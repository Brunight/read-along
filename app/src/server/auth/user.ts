import { redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { LOCAL_USER_ID, db } from '../db'
import { user as userTable, userSeries } from '../db/schema'
import { auth } from './auth'

export interface AppUser {
  id: string
  /** Display name: the nickname if set, else the account's own name. */
  name: string
  /** Picked by the user in Settings; null means "use the account name". */
  nickname: string | null
  /** From Google ("You" for the local user). */
  accountName: string
  email: string
  image: string | null
  isAdmin: boolean
  /** May use the app (approved and not banned). */
  approved: boolean
  /** Series this user can see; 'all' for admins, the local user and unrestricted users. */
  series: 'all' | Set<string>
}

const cache = new WeakMap<Request, Promise<AppUser | null>>()

/** The signed-in user (or "You" when login is off), resolved once per request. */
export function currentUser(request: Request = getRequest()): Promise<AppUser | null> {
  let user = cache.get(request)
  if (!user) {
    user = resolveUser(request)
    cache.set(request, user)
  }
  return user
}

async function resolveUser(request: Request): Promise<AppUser | null> {
  if (!auth) {
    const local = await db.select().from(userTable).where(eq(userTable.id, LOCAL_USER_ID)).get()
    return local ? toAppUser(local, 'all', false) : null
  }
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null
  const u = session.user
  const isAdmin = u.role === 'admin'
  const series =
    isAdmin || u.allSeries
      ? 'all'
      : new Set(
          (await db.select({ series: userSeries.series }).from(userSeries).where(eq(userSeries.userId, u.id))).map(
            (r) => r.series,
          ),
        )
  return toAppUser(u, series, isAdmin)
}

function toAppUser(
  u: {
    id: string
    name: string
    nickname?: string | null
    email: string
    image?: string | null
    status: string
    banned?: boolean | null
  },
  series: AppUser['series'],
  isAdmin: boolean,
): AppUser {
  return {
    id: u.id,
    name: u.nickname || u.name,
    nickname: u.nickname ?? null,
    accountName: u.name,
    email: u.email,
    image: u.image ?? null,
    isAdmin,
    approved: u.status === 'approved' && !u.banned,
    series,
  }
}

/** The current user if they may use the app, else null (the caller answers 401). */
export async function approvedUser(): Promise<AppUser | null> {
  const user = await currentUser()
  return user?.approved ? user : null
}

/** For server functions: the approved user, else a redirect to /login or /pending. */
export async function requireUser(): Promise<AppUser> {
  const user = await currentUser()
  if (!user) throw redirect({ to: '/login' })
  if (!user.approved) throw redirect({ to: '/pending' })
  return user
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser()
  if (!user.isAdmin) throw redirect({ to: '/' })
  return user
}

export function canSeeSeries(user: AppUser, series: string): boolean {
  return user.series === 'all' || user.series.has(series)
}

export const unauthorized = () => new Response('Unauthorized', { status: 401 })
