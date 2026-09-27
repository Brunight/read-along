import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { getBook, listBooks, readSync } from './books'
import { readAllProgress } from './progress'

export const fetchBooks = createServerFn({ method: 'GET' }).handler(() => listBooks())

export const fetchBook = createServerFn({ method: 'GET' })
  .validator((d: { series: string; volume: string }) => d)
  .handler(async ({ data }) => {
    const book = await getBook(data.series, data.volume)
    const sync = book && (await readSync(book))
    if (!book || !sync) throw notFound()
    const progress = (await readAllProgress())[book.id] ?? null
    return { sync, progress }
  })
