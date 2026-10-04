import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { formatAgo } from '#/lib/format'
import {
  approveUser,
  fetchAdminData,
  preAddEmail,
  removePreAddedEmail,
  removeUser,
  setAdmin,
  setBlocked,
  setSeriesAccess,
} from '#/server/admin'
import type { AdminData, AdminUser } from '#/server/admin'
import { fetchMe } from '#/server/fns'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const me = await fetchMe()
    if (!me.authEnabled || !me.user?.isAdmin) throw redirect({ to: '/' })
  },
  loader: () => fetchAdminData(),
  head: () => ({ meta: [{ title: 'Admin · Reader Sensei' }] }),
  component: AdminPage,
})

/** Runs a server action, then reloads the page data; keeps the last error for display. */
function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function AdminPage() {
  const data = Route.useLoaderData()
  const pending = data.users.filter((u) => u.state === 'pending')
  const approved = data.users.filter((u) => u.state === 'approved')
  const blocked = data.users.filter((u) => u.state === 'blocked')

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
        <Link to="/" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" title="Library">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12.5 4.5 7 10l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="text-sm font-medium">Admin</h1>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:py-10">
        {pending.length > 0 && (
          <Section title="Waiting for approval" hint="Signed in with Google but can't open the library yet.">
            {pending.map((u) => (
              <UserCard key={u.id} user={u} data={data} />
            ))}
          </Section>
        )}

        <Section title="Users" hint="People who can open the library.">
          {approved.map((u) => (
            <UserCard key={u.id} user={u} data={data} />
          ))}
        </Section>

        <PreApproved emails={data.preApproved} />

        {blocked.length > 0 && (
          <Section title="Blocked" hint="Signed out and can't sign in again.">
            {blocked.map((u) => (
              <UserCard key={u.id} user={u} data={data} />
            ))}
          </Section>
        )}
      </main>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{hint}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

const btn = 'rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition disabled:opacity-50'
const btnPlain = `${btn} text-zinc-300 ring-white/15 hover:bg-white/5`
const btnPrimary = `${btn} bg-amber-400 text-zinc-950 ring-amber-400 hover:bg-amber-300`
const btnDanger = `${btn} text-rose-300 ring-rose-500/30 hover:bg-rose-500/10`

function UserCard({ user: u, data }: { user: AdminUser; data: AdminData }) {
  const { busy, error, run } = useAction()
  const [open, setOpen] = useState(false)
  const isMe = u.id === data.meId
  const confirmRemove = () =>
    window.confirm(`Remove ${u.name}? Their reading positions are deleted. They can sign in again and ask for access.`) &&
    run(() => removeUser({ data: { userId: u.id } }))

  return (
    <div className="rounded-xl ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Avatar user={u} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{u.name}</span>
            {u.isAdmin && (
              <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
                Admin
              </span>
            )}
            {isMe && <span className="text-xs text-zinc-500">(you)</span>}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {u.email} · {u.lastSeen ? `seen ${formatAgo(u.lastSeen)}` : `joined ${formatAgo(u.createdAt)}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {u.state === 'pending' && (
            <button type="button" disabled={busy} className={btnPrimary} onClick={() => run(() => approveUser({ data: { userId: u.id } }))}>
              Approve
            </button>
          )}
          {u.state === 'approved' && (
            <button type="button" className={btnPlain} onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Close' : 'Manage'}
            </button>
          )}
          {u.state === 'blocked' ? (
            <button type="button" disabled={busy} className={btnPlain} onClick={() => run(() => setBlocked({ data: { userId: u.id, blocked: false } }))}>
              Unblock
            </button>
          ) : (
            !isMe && (
              <button type="button" disabled={busy} className={btnDanger} onClick={() => run(() => setBlocked({ data: { userId: u.id, blocked: true } }))}>
                Block
              </button>
            )
          )}
          {u.state !== 'approved' && (
            <button type="button" disabled={busy} className={btnDanger} onClick={confirmRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="px-3 pb-3 text-xs text-rose-300">{error}</p>}

      {open && u.state === 'approved' && (
        <div className="space-y-5 border-t border-white/10 p-3">
          <SeriesAccess user={u} series={data.series} />
          <ProgressList user={u} />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              className={btnPlain}
              onClick={() => run(() => setAdmin({ data: { userId: u.id, admin: !u.isAdmin } }))}
            >
              {u.isAdmin ? 'Remove admin' : 'Make admin'}
            </button>
            {!isMe && (
              <button type="button" disabled={busy} className={btnDanger} onClick={confirmRemove}>
                Remove user
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ user }: { user: AdminUser }) {
  return user.image ? (
    <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full bg-zinc-800" />
  ) : (
    <div className="grid size-9 place-items-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
      {user.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function SeriesAccess({ user: u, series }: { user: AdminUser; series: AdminData['series'] }) {
  const { busy, error, run } = useAction()
  const save = (all: boolean, list: string[]) => run(() => setSeriesAccess({ data: { userId: u.id, all, series: list } }))
  const toggle = (id: string) => save(false, u.series.includes(id) ? u.series.filter((s) => s !== id) : [...u.series, id])

  return (
    <div>
      <div className="text-sm font-medium">Series</div>
      {u.isAdmin ? (
        <p className="mt-1 text-xs text-zinc-500">Admins see every series.</p>
      ) : (
        <>
          <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              disabled={busy}
              checked={u.allSeries}
              onChange={(e) => save(e.target.checked, u.series)}
              className="size-4 accent-amber-400"
            />
            All series, including ones added later
          </label>
          {!u.allSeries && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {series.map((s) => {
                const on = u.series.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => toggle(s.id)}
                    className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                      on ? 'bg-amber-400/15 text-amber-200 ring-amber-400/50' : 'text-zinc-400 ring-white/15 hover:bg-white/5'
                    }`}
                  >
                    {s.name}
                  </button>
                )
              })}
              {series.length === 0 && <span className="text-xs text-zinc-500">No series in the library.</span>}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-1 text-xs text-rose-300">{error}</p>}
    </div>
  )
}

function ProgressList({ user: u }: { user: AdminUser }) {
  return (
    <div>
      <div className="text-sm font-medium">Reading</div>
      {u.progress.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">Hasn't started a book yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {u.progress.map((p) => (
            <li key={p.bookId} className="text-xs">
              <div className="flex justify-between gap-3">
                <span className="truncate text-zinc-300">{p.title}</span>
                <span className="shrink-0 text-zinc-500">
                  {p.percent != null && `${Math.round(p.percent * 100)}% · `}
                  {formatAgo(p.updatedAt)}
                </span>
              </div>
              {p.percent != null && (
                <div className="mt-1 h-1 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${p.percent * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PreApproved({ emails }: { emails: string[] }) {
  const { busy, error, run } = useAction()
  const [email, setEmail] = useState('')
  return (
    <Section title="Pre-approved emails" hint="These Google accounts get in on their first sign-in, without waiting.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await preAddEmail({ data: { email } })
            setEmail('')
          })
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@gmail.com"
          className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-amber-400/60 focus:outline-none"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-300 disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {emails.length > 0 && (
        <ul className="divide-y divide-white/5 rounded-xl ring-1 ring-white/10">
          {emails.map((e) => (
            <li key={e} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate text-zinc-300">{e}</span>
              <button type="button" disabled={busy} className={btnPlain} onClick={() => run(() => removePreAddedEmail({ data: { email: e } }))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
