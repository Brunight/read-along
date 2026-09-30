import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { authEnabled } from './auth/config'
import { currentUser, requireUser } from './auth/user'
import { getBookFor, listBooks, readSync } from './books'
import { db } from './db'
import { user } from './db/schema'
import { readAllProgress } from './progress'

export const fetchBooks = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  return listBooks(user)
})

export const fetchBook = createServerFn({ method: 'GET' })
  .validator((d: { series: string; volume: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const book = await getBookFor(user, data.series, data.volume)
    const sync = book && (await readSync(book))
    if (!book || !sync) throw notFound()
    const progress = (await readAllProgress(user.id))[book.id] ?? null
    // Scopes the reader's localStorage copy of the position, so accounts sharing a device don't mix.
    const storageUser = authEnabled ? user.id : null
    return { sync, progress, storageUser }
  })

export interface Me {
  /** Google login is configured; false means single-user mode ("You"). */
  authEnabled: boolean
  user: {
    id: string
    name: string
    nickname: string | null
    accountName: string
    email: string
    image: string | null
    isAdmin: boolean
    approved: boolean
  } | null
}

export const fetchMe = createServerFn({ method: 'GET' }).handler(async (): Promise<Me> => {
  const u = await currentUser()
  return {
    authEnabled,
    user: u && {
      id: u.id,
      name: u.name,
      nickname: u.nickname,
      accountName: u.accountName,
      email: u.email,
      image: u.image,
      isAdmin: u.isAdmin,
      approved: u.approved,
    },
  }
})

export const MAX_NAME_LENGTH = 50

/** Trimmed, inner whitespace collapsed, capped; "" means "use the account name". */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)

/** Renames the current user; an empty name goes back to the account name. */
export const setMyName = createServerFn({ method: 'POST' })
  .validator((d: { name: string }) => ({ name: cleanName(d.name) }))
  .handler(async ({ data }) => {
    const u = await requireUser()
    await db.update(user).set({ nickname: data.name || null }).where(eq(user.id, u.id))
  })
