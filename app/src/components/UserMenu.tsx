import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { signOut } from '#/lib/auth-client'
import type { Me } from '#/server/fns'

/** Avatar with Admin / Sign out, shown only when Google login is on. */
export function UserMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => ref.current?.contains(e.target as Node) || setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const user = me.user
  if (!me.authEnabled || !user) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={user.email}
        className="grid size-8 place-items-center overflow-hidden rounded-full bg-zinc-800 text-sm font-medium text-zinc-300 ring-1 ring-white/10 hover:ring-white/30"
      >
        {user.image ? (
          <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          user.name.slice(0, 1).toUpperCase()
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-xl bg-zinc-900 py-1 text-sm shadow-xl ring-1 ring-white/10">
          <div className="border-b border-white/10 px-3 py-2">
            <div className="truncate font-medium">{user.name}</div>
            <div className="truncate text-xs text-zinc-500">{user.email}</div>
          </div>
          {user.isAdmin && (
            <Link to="/admin" className="block px-3 py-2 text-zinc-300 hover:bg-white/5 hover:text-white">
              Admin
            </Link>
          )}
          <button type="button" onClick={signOut} className="block w-full px-3 py-2 text-left text-zinc-300 hover:bg-white/5 hover:text-white">
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
