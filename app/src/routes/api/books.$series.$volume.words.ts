import { createFileRoute } from '@tanstack/react-router'
import { getBook } from '#/server/books'

// words.json is ~2.5 MB of JSON (~0.7 MB gzipped); compress once per file version.
const cache = new Map<string, { mtime: number; gz: Uint8Array<ArrayBuffer> }>()

export const Route = createFileRoute('/api/books/$series/$volume/words')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const book = await getBook(params.series, params.volume)
        const file = book && Bun.file(book.words)
        if (!file || !(await file.exists())) return new Response('Not found', { status: 404 })
        const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600', Vary: 'Accept-Encoding' }
        if (!request.headers.get('accept-encoding')?.includes('gzip')) return new Response(file, { headers })

        let entry = cache.get(book.words)
        if (!entry || entry.mtime !== file.lastModified) {
          entry = { mtime: file.lastModified, gz: Bun.gzipSync(new Uint8Array(await file.arrayBuffer())) as Uint8Array<ArrayBuffer> }
          cache.set(book.words, entry)
        }
        return new Response(entry.gz, { headers: { ...headers, 'Content-Encoding': 'gzip' } })
      },
    },
  },
})
