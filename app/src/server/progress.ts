import { eq } from 'drizzle-orm'
import type { Progress } from '#/lib/types'
import { db } from './db'
import { progress } from './db/schema'

export async function readAllProgress(userId: string): Promise<Record<string, Progress>> {
  const rows = await db.select().from(progress).where(eq(progress.userId, userId))
  return Object.fromEntries(rows.map((r) => [r.bookId, { time: r.time, updatedAt: r.updatedAt.toISOString() }]))
}

export async function saveProgress(userId: string, bookId: string, time: number): Promise<void> {
  const updatedAt = new Date()
  await db
    .insert(progress)
    .values({ userId, bookId, time, updatedAt })
    .onConflictDoUpdate({ target: [progress.userId, progress.bookId], set: { time, updatedAt } })
}
