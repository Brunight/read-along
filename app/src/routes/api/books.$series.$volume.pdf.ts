import { createFileRoute } from '@tanstack/react-router'
import { approvedUser, unauthorized } from '#/server/auth/user'
import { getBookFor } from '#/server/books'
import { serveFile } from '#/server/range'

export const Route = createFileRoute('/api/books/$series/$volume/pdf')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await approvedUser()
        if (!user) return unauthorized()
        const book = await getBookFor(user, params.series, params.volume)
        if (!book) return new Response('Not found', { status: 404 })
        return serveFile(request, book.pdf, 'application/pdf')
      },
    },
  },
})
