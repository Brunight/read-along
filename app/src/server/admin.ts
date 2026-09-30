import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq, max, ne } from 'drizzle-orm'
import { auth } from './auth/auth'
import { requireAdmin } from './auth/user'
import { displayName, getBook, listSeries, summarize } from './books'
import { LOCAL_USER_ID, db } from './db'
import { preApprovedEmails, progress, session, user, userSeries } from './db/schema'

export interface AdminUser {
  id: string
  name: string
  email: string
  image: string | null
  isAdmin: boolean
  state: 'pending' | 'approved' | 'blocked'
  createdAt: string
  lastSeen: string | null
  allSeries: boolean
  series: string[]
  progress: { bookId: string; title: string; percent: number | null; updatedAt: string }[]
}

export interface AdminData {
  meId: string
  users: AdminUser[]
  preApproved: string[]
  series: { id: string; name: string }[]
}

export const fetchAdminData = createServerFn({ method: 'GET' }).handler(async (): Promise<AdminData> => {
  const me = await requireAdmin()
  const users = await db.select().from(user).where(ne(user.id, LOCAL_USER_ID)).orderBy(user.createdAt)
  const lastSeen = new Map(
    (await db.select({ userId: session.userId, at: max(session.updatedAt) }).from(session).groupBy(session.userId)).map(
      (r) => [r.userId, r.at],
    ),
  )
  const seriesByUser = group(await db.select().from(userSeries), (r) => r.userId)
  const progressByUser = group(await db.select().from(progress).orderBy(progress.updatedAt), (r) => r.userId)

  // Titles and percentages; each (book, position) pair is looked up once.
  const books = new Map<string, Promise<{ title: string; percent: number | null }>>()
  const describe = (bookId: string, time: number) => {
    const key = `${bookId}@${time}`
    if (!books.has(key)) {
      books.set(
        key,
        (async () => {
          const [series, volume] = bookId.split('/')
          const book = await getBook(series, volume)
          if (!book) return { title: bookId, percent: null }
          const s = await summarize(book, time)
          return { title: s.title, percent: s.progress }
        })(),
      )
    }
    return books.get(key)!
  }

  return {
    meId: me.id,
    users: await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        name: u.nickname || u.name,
        email: u.email,
        image: u.image,
        isAdmin: u.role === 'admin',
        state: u.banned ? 'blocked' : u.status === 'approved' ? 'approved' : 'pending',
        createdAt: u.createdAt.toISOString(),
        lastSeen: lastSeen.get(u.id)?.toISOString() ?? null,
        allSeries: u.allSeries,
        series: (seriesByUser.get(u.id) ?? []).map((r) => r.series),
        progress: await Promise.all(
          (progressByUser.get(u.id) ?? []).reverse().map(async (p) => ({
            bookId: p.bookId,
            ...(await describe(p.bookId, p.time)),
            updatedAt: p.updatedAt.toISOString(),
          })),
        ),
      })),
    ),
    preApproved: (await db.select().from(preApprovedEmails).orderBy(preApprovedEmails.createdAt)).map((r) => r.email),
    series: (await listSeries()).map((id) => ({ id, name: displayName(id) })),
  }
})

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r])
  return out
}

const byUserId = (d: { userId: string }) => d

/** Admin endpoints of better-auth act as the signed-in admin, so they need the request's cookies. */
const headers = () => getRequest().headers

export const approveUser = createServerFn({ method: 'POST' })
  .validator(byUserId)
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.update(user).set({ status: 'approved' }).where(eq(user.id, data.userId))
  })

export const setBlocked = createServerFn({ method: 'POST' })
  .validator((d: { userId: string; blocked: boolean }) => d)
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    if (data.userId === me.id) throw new Error("You can't block yourself.")
    // Banning also signs them out everywhere and refuses future sign-ins.
    if (data.blocked) await auth!.api.banUser({ body: { userId: data.userId }, headers: headers() })
    else await auth!.api.unbanUser({ body: { userId: data.userId }, headers: headers() })
  })

export const removeUser = createServerFn({ method: 'POST' })
  .validator(byUserId)
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    if (data.userId === me.id) throw new Error("You can't remove yourself.")
    // Their sessions, progress and series access go with them (foreign keys cascade).
    await auth!.api.removeUser({ body: { userId: data.userId }, headers: headers() })
  })

export const setAdmin = createServerFn({ method: 'POST' })
  .validator((d: { userId: string; admin: boolean }) => d)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!data.admin) {
      const others = await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.role, 'admin'), ne(user.id, data.userId)))
        .limit(1)
      if (!others.length) throw new Error('There must be at least one admin.')
    }
    await auth!.api.setRole({ body: { userId: data.userId, role: data.admin ? 'admin' : 'user' }, headers: headers() })
    if (data.admin) await db.update(user).set({ status: 'approved' }).where(eq(user.id, data.userId))
  })

export const preAddEmail = createServerFn({ method: 'POST' })
  .validator((d: { email: string }) => ({ email: d.email.trim().toLowerCase() }))
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('That doesn’t look like an email address.')
    // Already signed in once: approve them directly.
    const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, data.email)).get()
    if (existing) {
      await db.update(user).set({ status: 'approved' }).where(eq(user.id, existing.id))
      return
    }
    await db.insert(preApprovedEmails).values({ email: data.email, addedBy: me.id }).onConflictDoNothing()
  })

export const removePreAddedEmail = createServerFn({ method: 'POST' })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.delete(preApprovedEmails).where(eq(preApprovedEmails.email, data.email))
  })

export const setSeriesAccess = createServerFn({ method: 'POST' })
  .validator((d: { userId: string; all: boolean; series: string[] }) => d)
  .handler(async ({ data }) => {
    await requireAdmin()
    db.transaction((tx) => {
      tx.update(user).set({ allSeries: data.all }).where(eq(user.id, data.userId)).run()
      tx.delete(userSeries).where(eq(userSeries.userId, data.userId)).run()
      for (const series of new Set(data.series)) tx.insert(userSeries).values({ userId: data.userId, series }).run()
    })
  })
