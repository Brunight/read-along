import { createFileRoute } from '@tanstack/react-router'
import { getBook } from '#/server/books'
import { serveFile } from '#/server/range'

export const Route = createFileRoute('/api/books/$series/$volume/pdf')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const book = await getBook(params.series, params.volume)
        if (!book) return new Response('Not found', { status: 404 })
        return serveFile(request, book.pdf, 'application/pdf')
      },
    },
  },
})
