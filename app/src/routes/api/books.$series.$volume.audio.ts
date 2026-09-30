import { createFileRoute } from '@tanstack/react-router'
import { approvedUser, unauthorized } from '#/server/auth/user'
import { getBookFor } from '#/server/books'
import { serveFile } from '#/server/range'

export const Route = createFileRoute('/api/books/$series/$volume/audio')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await approvedUser()
        if (!user) return unauthorized()
        const book = await getBookFor(user, params.series, params.volume)
        if (!book) return new Response('Not found', { status: 404 })
        // m4b is AAC in an MP4 container; browsers only play it under the audio/mp4 type.
        return serveFile(request, book.audio, 'audio/mp4')
      },
    },
  },
})
