/** Reads width/height from a JPEG, PNG or WebP header without decoding the image. */
export async function imageSize(filePath: string): Promise<{ width: number; height: number } | null> {
  const buf = new Uint8Array(await Bun.file(filePath).slice(0, 256 * 1024).arrayBuffer())
  const view = new DataView(buf.buffer)

  // PNG: IHDR is the first chunk.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk.
  if (buf.length >= 30 && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...buf.slice(12, 16))
    if (kind === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    if (kind === 'VP8L') {
      const bits = view.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (kind === 'VP8X') {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16)
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16)
      return { width: w + 1, height: h + 1 }
    }
    return null
  }

  // JPEG: walk the segments until a start-of-frame marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const len = view.getUint16(i + 2)
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) }
      i += 2 + len
    }
  }
  return null
}
