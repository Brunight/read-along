import { useState } from 'react'
import { load, store } from '#/lib/storage'

const DISMISSED_KEY = 'wakeLockNoticeDismissed'

/** Whether the browser can keep the screen on. It can't on plain http:// (non-secure context). */
export function canKeepAwake() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/**
 * Shown on touch devices when audio plays but the screen can't be kept awake,
 * explaining the Chrome flag that fixes it without setting up HTTPS.
 */
export function WakeLockNotice({ playing }: { playing: boolean }) {
  const [dismissed, setDismissed] = useState(() => load(DISMISSED_KEY, false))
  const [copied, setCopied] = useState(false)
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  if (!playing || dismissed || !touch || canKeepAwake()) return null

  const origin = window.location.origin
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(origin)
    } catch {
      // Clipboard API is also restricted on insecure pages; fall back to a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = origin
      document.body.append(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
  }

  return (
    <div className="absolute inset-x-3 top-3 z-20 mx-auto max-w-md rounded-lg bg-zinc-900/95 p-3 text-sm text-zinc-300 shadow-xl ring-1 ring-amber-400/30 backdrop-blur">
      <p className="font-medium text-amber-300">The screen may turn off while playing</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Browsers only keep the screen on for HTTPS pages. In Chrome, open{' '}
        <code className="text-zinc-200">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, enable it, add
        this address, then relaunch Chrome:
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 text-xs text-zinc-200">{origin}</code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md px-2 py-1 text-xs font-medium text-zinc-200 ring-1 ring-white/15 hover:bg-white/10"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true)
            store(DISMISSED_KEY, true)
          }}
          className="rounded-md bg-amber-400 px-2 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-300"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
