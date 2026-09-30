import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { LOCAL_USER_ID, db } from '../db'
import { meta, progress, user } from '../db/schema'
import { authEnabled, publicUrl } from './config'

const TOKEN_KEY = 'setupTokenHash'

const sha256 = (s: string) => createHash('sha256').update(s).digest()

function hasAdmin() {
  return !!db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1).get()
}

/**
 * While login is on and nobody is admin yet, print a one-time URL; whoever signs in through it
 * becomes the first admin. A fresh token is made on every start until then.
 */
export function ensureSetupToken() {
  if (!authEnabled || hasAdmin()) return
  const token = randomBytes(32).toString('base64url')
  db.insert(meta)
    .values({ key: TOKEN_KEY, value: sha256(token).toString('hex') })
    .onConflictDoUpdate({ target: meta.key, set: { value: sha256(token).toString('hex') } })
    .run()
  console.log(`\nNo admin yet. Sign in through this link to become the first admin:\n  ${publicUrl}/setup?token=${token}\n`)
}

/**
 * Makes `userId` the first admin if `token` is the current setup token, and hands them the
 * progress saved while login was off. False if the token is wrong or an admin already exists.
 */
export function claimFirstAdmin(userId: string, token: string): boolean {
  return db.transaction((tx) => {
    const stored = tx.select().from(meta).where(eq(meta.key, TOKEN_KEY)).get()
    if (!stored || !token) return false
    const expected = Buffer.from(stored.value, 'hex')
    const given = sha256(token)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
    if (tx.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1).get()) return false

    tx.update(user).set({ role: 'admin', status: 'approved' }).where(eq(user.id, userId)).run()

    // Move "You"'s positions over, keeping whichever of the two is more recent per book.
    const mine = new Map(
      tx.select().from(progress).where(eq(progress.userId, userId)).all().map((p) => [p.bookId, p]),
    )
    for (const p of tx.select().from(progress).where(eq(progress.userId, LOCAL_USER_ID)).all()) {
      const existing = mine.get(p.bookId)
      if (existing && existing.updatedAt >= p.updatedAt) continue
      tx.insert(progress)
        .values({ ...p, userId })
        .onConflictDoUpdate({ target: [progress.userId, progress.bookId], set: { time: p.time, updatedAt: p.updatedAt } })
        .run()
    }
    tx.delete(progress).where(eq(progress.userId, LOCAL_USER_ID)).run()
    tx.delete(meta).where(eq(meta.key, TOKEN_KEY)).run()
    return true
  })
}
