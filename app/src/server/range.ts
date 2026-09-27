/**
 * Serves a file with HTTP Range support. Browsers need 206 responses to seek
 * inside the audiobook, and pdf.js uses ranges to load large PDFs progressively.
 */
export async function serveFile(request: Request, filePath: string, contentType: string): Promise<Response> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return new Response('Not found', { status: 404 })
  const size = file.size
  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  }

  const range = request.headers.get('range')
  const match = range?.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) {
    return new Response(file, { headers: { ...headers, 'Content-Length': String(size) } })
  }

  let start: number
  let end: number
  if (match[1]) {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  } else {
    // "bytes=-N": the last N bytes.
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  }

  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  })
}
