import { createFileRoute } from '@tanstack/react-router'
import { approvedUser, unauthorized } from '#/server/auth/user'
import { getBookFor } from '#/server/books'
import { serveFile } from '#/server/range'

const TYPES: Record<string, string> = { png: 'image/png', webp: 'image/webp' }

export const Route = createFileRoute('/api/books/$series/$volume/cover')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await approvedUser()
        if (!user) return unauthorized()
        const book = await getBookFor(user, params.series, params.volume)
        if (!book?.cover) return new Response('Not found', { status: 404 })
        const ext = book.cover.split('.').pop()!.toLowerCase()
        return serveFile(request, book.cover, TYPES[ext] ?? 'image/jpeg')
      },
    },
  },
})
