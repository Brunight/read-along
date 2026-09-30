import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthScreen, GoogleButton } from '#/components/AuthScreen'
import { signInWithGoogle } from '#/lib/auth-client'
import { fetchMe } from '#/server/fns'

/** Opened from the link the server prints at startup while there is no admin. */
export const Route = createFileRoute('/setup')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
  }),
  beforeLoad: async () => {
    const me = await fetchMe()
    if (!me.authEnabled) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Set up · Read Along' }] }),
  component: Setup,
})

function Setup() {
  const { token } = Route.useSearch()
  return (
    <AuthScreen title="Become the admin">
      <p className="mt-2 text-sm text-zinc-400">
        The Google account you sign in with becomes the first admin. Reading positions saved before login was turned
        on move to it.
      </p>
      {token ? (
        <GoogleButton
          label="Sign in with Google"
          onClick={() => signInWithGoogle(`/setup/claim?token=${encodeURIComponent(token)}`)}
        />
      ) : (
        <p className="mt-4 text-sm text-rose-300">This link is missing its token. Copy it again from the server log.</p>
      )}
    </AuthScreen>
  )
}
