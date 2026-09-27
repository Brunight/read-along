import { Link } from '@tanstack/react-router'

export function SettingsLink() {
  return (
    <Link to="/settings" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" title="Settings">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M10.3 3.6a1.7 1.7 0 0 1 3.4 0l.2 1a1.7 1.7 0 0 0 2.5 1l.9-.5a1.7 1.7 0 0 1 2.4 2.4l-.5.9a1.7 1.7 0 0 0 1 2.5l1 .2a1.7 1.7 0 0 1 0 3.4l-1 .2a1.7 1.7 0 0 0-1 2.5l.5.9a1.7 1.7 0 0 1-2.4 2.4l-.9-.5a1.7 1.7 0 0 0-2.5 1l-.2 1a1.7 1.7 0 0 1-3.4 0l-.2-1a1.7 1.7 0 0 0-2.5-1l-.9.5a1.7 1.7 0 0 1-2.4-2.4l.5-.9a1.7 1.7 0 0 0-1-2.5l-1-.2a1.7 1.7 0 0 1 0-3.4l1-.2a1.7 1.7 0 0 0 1-2.5l-.5-.9a1.7 1.7 0 0 1 2.4-2.4l.9.5a1.7 1.7 0 0 0 2.5-1z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </Link>
  )
}
