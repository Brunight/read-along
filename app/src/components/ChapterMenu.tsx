import { useEffect, useRef, useState } from 'react'
import { formatTime } from '#/lib/format'
import type { Chapter } from '#/lib/types'

interface Props {
  chapters: Chapter[]
  current: number
  onSelect: (chapter: Chapter) => void
}

export function ChapterMenu({ chapters, current, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' })
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-white/5"
        aria-expanded={open}
      >
        <span className="truncate">{chapters[current]?.title ?? 'Chapters'}</span>
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 fill-current opacity-60" aria-hidden>
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="absolute top-full right-0 z-30 mt-1 max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-zinc-900 p-1 shadow-xl ring-1 ring-white/10"
        >
          {chapters.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={i === current}
                onClick={() => {
                  onSelect(c)
                  setOpen(false)
                }}
                className={`flex w-full items-baseline gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-white/5 ${
                  i === current ? 'text-amber-400' : 'text-zinc-300'
                }`}
              >
                <span className="flex-1">{c.title}</span>
                <span className="text-xs text-zinc-500 tabular-nums">{formatTime(c.start)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
