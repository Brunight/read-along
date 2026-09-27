import { createFileRoute } from '@tanstack/react-router'
import { getBook } from '#/server/books'
import { readAllProgress, saveProgress } from '#/server/progress'

export const Route = createFileRoute('/api/progress/$series/$volume')({
  server: {
    handlers: {
      GET: async ({ params }) =>
        Response.json((await readAllProgress())[`${params.series}/${params.volume}`] ?? null),
      // PUT for normal saves, POST for navigator.sendBeacon on page hide.
      PUT: ({ request, params }) => save(request, params.series, params.volume),
      POST: ({ request, params }) => save(request, params.series, params.volume),
    },
  },
})

async function save(request: Request, series: string, volume: string) {
  const book = await getBook(series, volume)
  if (!book) return new Response('Not found', { status: 404 })
  const body = (await request.json().catch(() => null)) as { time?: unknown } | null
  const time = Number(body?.time)
  if (!Number.isFinite(time) || time < 0) return new Response('Bad time', { status: 400 })
  await saveProgress(book.id, time)
  return new Response(null, { status: 204 })
}
