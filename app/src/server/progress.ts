import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import type { Progress } from '#/lib/types'

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), '../data'))
const FILE = path.join(DATA_DIR, 'progress.json')

let writing: Promise<void> = Promise.resolve()

export async function readAllProgress(): Promise<Record<string, Progress>> {
  const file = Bun.file(FILE)
  if (!(await file.exists())) return {}
  try {
    return (await file.json()) as Record<string, Progress>
  } catch {
    return {}
  }
}

/** Serialized, atomic (temp file + rename) so concurrent saves can't corrupt the file. */
export function saveProgress(bookId: string, time: number): Promise<void> {
  writing = writing.catch(() => {}).then(async () => {
    const all = await readAllProgress()
    all[bookId] = { time, updatedAt: new Date().toISOString() }
    await mkdir(DATA_DIR, { recursive: true })
    const tmp = `${FILE}.${process.pid}.tmp`
    await Bun.write(tmp, JSON.stringify(all, null, 2))
    await rename(tmp, FILE)
  })
  return writing
}
