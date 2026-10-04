import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AuthScreen } from '#/components/AuthScreen'
import { signOut } from '#/lib/auth-client'
import { fetchMe } from '#/server/fns'

export const Route = createFileRoute('/pending')({
  beforeLoad: async () => {
    const me = await fetchMe()
    if (!me.authEnabled || me.user?.approved) throw redirect({ to: '/' })
    if (!me.user) throw redirect({ to: '/login' })
    return { me: me.user }
  },
  head: () => ({ meta: [{ title: 'Waiting for approval · Reader Sensei' }] }),
  component: Pending,
})

function Pending() {
  const { me } = Route.useRouteContext()
  const router = useRouter()
  return (
    <AuthScreen title="Waiting for approval">
      <p className="mt-2 text-sm text-zinc-400">
        You're signed in as <span className="text-zinc-200">{me.email}</span>. An admin needs to let you in before
        you can open the library.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="flex-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-300"
        >
          Check again
        </button>
        <button
          type="button"
          onClick={signOut}
          className="flex-1 rounded-lg px-4 py-2 text-sm text-zinc-300 ring-1 ring-white/15 hover:bg-white/5"
        >
          Sign out
        </button>
      </div>
    </AuthScreen>
  )
}
