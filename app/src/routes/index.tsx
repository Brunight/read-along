import { Link, createFileRoute } from '@tanstack/react-router'
import { SettingsLink } from '#/components/SettingsLink'
import { formatDuration } from '#/lib/format'
import type { BookSummary } from '#/lib/types'
import { fetchBooks } from '#/server/fns'

export const Route = createFileRoute('/')({
  loader: () => fetchBooks(),
  component: Library,
})

function Library() {
  const series = Route.useLoaderData()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <SettingsLink />
      </div>
      {series.length === 0 ? (
        <p className="mt-6 text-zinc-400">
          No books found. Add volumes as <code className="text-zinc-300">books/&lt;book&gt;/&lt;volume&gt;/</code> with
          a PDF and an <code className="text-zinc-300">audio/*.m4b</code>.
        </p>
      ) : (
        series.map((s) => (
          <section key={s.id} className="mt-10 first-of-type:mt-8">
            <h2 className="text-lg font-semibold text-zinc-200">
              {s.name}
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {s.volumes.length} {s.volumes.length === 1 ? 'volume' : 'volumes'}
              </span>
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {s.volumes.map((b) => (
                <li key={b.id}>
                  {b.ready ? (
                    <Link
                      to="/books/$series/$volume"
                      params={{ series: b.series, volume: b.volume }}
                      className="group block"
                    >
                      <VolumeCard book={b} />
                    </Link>
                  ) : (
                    <div className="opacity-60">
                      <VolumeCard book={b} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}

function VolumeCard({ book: b }: { book: BookSummary }) {
  return (
    <>
      <div className="relative aspect-[210/297] overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10">
        {b.hasCover ? (
          <img
            src={`/api/books/${encodeURIComponent(b.series)}/${encodeURIComponent(b.volume)}/cover`}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid h-full place-items-center p-4 text-center text-sm text-zinc-500">{b.title}</div>
        )}
        {b.progress != null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-amber-400" style={{ width: `${b.progress * 100}%` }} />
          </div>
        )}
        {!b.ready && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 text-xs font-medium tracking-wide text-zinc-300 uppercase">
            Not prepared
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium">{b.title}</p>
      <p className="text-xs text-zinc-500">
        {b.duration != null && formatDuration(b.duration)}
        {b.progress != null && ` · ${Math.round(b.progress * 100)}%`}
        {!b.ready && 'Run prep/prep.py to sync'}
      </p>
    </>
  )
}
