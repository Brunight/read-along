import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { authEnabled } from './auth/config'
import { currentUser, requireUser } from './auth/user'
import { getBookFor, listBooks, readSync } from './books'
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
  user: { id: string; name: string; email: string; image: string | null; isAdmin: boolean; approved: boolean } | null
}

export const fetchMe = createServerFn({ method: 'GET' }).handler(async (): Promise<Me> => {
  const u = await currentUser()
  return {
    authEnabled,
    user: u && { id: u.id, name: u.name, email: u.email, image: u.image, isAdmin: u.isAdmin, approved: u.approved },
  }
})
