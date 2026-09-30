import { authEnabled } from './config'
import { currentUser } from './user'

/** Reachable while signed out. */
const PUBLIC = (p: string) => p === '/login' || p === '/setup' || p.startsWith('/api/auth/')
/** Need a session, but not approval yet. */
const SIGNED_IN = (p: string) => p === '/pending' || p === '/setup/claim'

/**
 * With login on, only approved users get past this. Returns the response to send instead of
 * the page or API result, or null to continue.
 */
export async function gate(request: Request): Promise<Response | null> {
  if (!authEnabled) return null
  const path = new URL(request.url).pathname
  // Server functions check access themselves (requireUser/requireAdmin); fetchMe must stay open.
  if (PUBLIC(path) || path.startsWith('/_serverFn/')) return null
  const user = await currentUser(request)
  if (user?.approved) return null
  if (user && SIGNED_IN(path)) return null
  if (path.startsWith('/api/')) return new Response('Unauthorized', { status: 401 })
  return redirectTo(user ? '/pending' : '/login')
}

/** Relative Location, so it stays on the public host/scheme behind the tunnel. */
export const redirectTo = (location: string) => new Response(null, { status: 302, headers: { Location: location } })
