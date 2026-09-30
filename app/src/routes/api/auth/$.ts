import { createFileRoute } from '@tanstack/react-router'
import { auth } from '#/server/auth/auth'

const handle = ({ request }: { request: Request }) =>
  auth ? auth.handler(request) : new Response('Not found', { status: 404 })

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: { GET: handle, POST: handle },
  },
})
