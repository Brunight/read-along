import { createFileRoute } from '@tanstack/react-router'
import { redirectTo } from '#/server/auth/gate'
import { claimFirstAdmin } from '#/server/auth/setup'
import { currentUser } from '#/server/auth/user'

/** Where /setup's Google sign-in returns: turns the signed-in user into the first admin. */
export const Route = createFileRoute('/setup_/claim')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser(request)
        if (!user) return redirectTo('/login')
        const token = new URL(request.url).searchParams.get('token') ?? ''
        return redirectTo(claimFirstAdmin(user.id, token) ? '/admin' : '/')
      },
    },
  },
})
