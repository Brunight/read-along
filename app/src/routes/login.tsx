import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthScreen, GoogleButton } from '#/components/AuthScreen'
import { signInWithGoogle } from '#/lib/auth-client'
import { fetchMe } from '#/server/fns'

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): { error?: string } => ({
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  beforeLoad: async () => {
    const me = await fetchMe()
    if (!me.authEnabled || me.user?.approved) throw redirect({ to: '/' })
    if (me.user) throw redirect({ to: '/pending' })
  },
  head: () => ({ meta: [{ title: 'Sign in · Read Along' }] }),
  component: Login,
})

function Login() {
  const { error } = Route.useSearch()
  return (
    <AuthScreen title="Read Along">
      <p className="mt-1 text-sm text-zinc-400">Sign in to open the library.</p>
      {error && (
        <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/20">
          {/banned/i.test(error) ? 'This account has been blocked.' : 'Sign-in failed. Please try again.'}
        </p>
      )}
      <GoogleButton label="Sign in with Google" onClick={() => signInWithGoogle('/')} />
    </AuthScreen>
  )
}
