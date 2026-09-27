import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { Rect } from '#/lib/types'
import type { Word } from '#/lib/useWords'

export interface PageRect {
  id: number
  rect: Rect
}

/** Loads a PDF with pdf.js (client-only; imported lazily so SSR never touches it). */
export function usePdfDocument(url: string) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null
    ;(async () => {
      const pdfjs = await import('pdfjs-dist')
      const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
      // Range requests: only the pages being viewed are downloaded.
      task = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 1 << 20 })
      const loaded = await task.promise
      if (!cancelled) setDoc(loaded)
    })().catch((e) => {
      if (!cancelled) setError(String(e))
    })
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [url])

  return { doc, error }
}

const PAD = 4
const WORD_PAD = 2

interface PageViewProps {
  doc: PDFDocumentProxy | null
  index: number
  top: number
  width: number
  height: number
  /** CSS pixels per PDF point. */
  scale: number
  /** Whether the canvas should be drawn (page is near the viewport). */
  render: boolean
  rects: PageRect[]
  activeId: number | null
  /** Active paragraph look, from the user's settings (see lib/settings.ts). */
  highlight: ActiveHighlight
  /** The word being spoken, if it's on this page. */
  word: Word | null
  onSeek: (paragraphId: number) => void
}

export interface ActiveHighlight {
  box?: CSSProperties
  gutter?: CSSProperties
  word?: CSSProperties
}

export const PageView = memo(function PageView({
  doc,
  index,
  top,
  width,
  height,
  scale,
  render,
  rects,
  activeId,
  highlight,
  word,
  onSeek,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!render || !doc) {
      // Free the bitmap of far-away pages; 250 full-size canvases would exhaust memory.
      canvas.width = 0
      canvas.height = 0
      setDrawn(false)
      return
    }
    let cancelled = false
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null
    doc
      .getPage(index + 1)
      .then((page) => {
        if (cancelled) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: scale * dpr })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        task = page.render({ canvas, viewport })
        return task.promise.then(() => {
          if (!cancelled) setDrawn(true)
        })
      })
      .catch(() => {
        // RenderingCancelledException when scrolling fast; nothing to do.
      })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, index, render, scale])

  return (
    <div
      className="absolute left-0 overflow-hidden rounded-sm bg-black shadow-lg shadow-black/50 ring-1 ring-white/5"
      style={{ top, width, height }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${drawn ? 'opacity-100' : 'opacity-0'}`}
      />
      {!drawn && (
        <div className="absolute inset-0 grid place-items-center text-xs text-zinc-700">{index + 1}</div>
      )}
      {rects.map(({ id, rect }, k) => (
        <button
          key={`${id}-${k}`}
          type="button"
          tabIndex={-1}
          data-paragraph={id}
          onClick={() => onSeek(id)}
          title="Play from here"
          className={`absolute cursor-pointer rounded-md transition-[background-color,box-shadow] duration-300 ${
            id === activeId ? 'para-active' : 'hover:bg-white/[0.04]'
          }`}
          style={{
            left: rect.x0 * scale - PAD,
            top: rect.y0 * scale - PAD,
            width: (rect.x1 - rect.x0) * scale + PAD * 2,
            height: (rect.y1 - rect.y0) * scale + PAD * 2,
            ...(id === activeId ? highlight.box : undefined),
          }}
        >
          {id === activeId && highlight.gutter && <GutterBar style={highlight.gutter} scale={scale} />}
        </button>
      ))}
      {word && highlight.word && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[3px]"
          style={{
            ...highlight.word,
            left: word[1] * scale - WORD_PAD,
            top: word[2] * scale - WORD_PAD / 2,
            width: (word[3] - word[1]) * scale + WORD_PAD * 2,
            height: (word[4] - word[2]) * scale + WORD_PAD,
          }}
        />
      )}
    </div>
  )
})

/** Vertical bar in the page margin, left of the paragraph (the "gutter" highlight style). */
export function GutterBar({ style, scale }: { style: CSSProperties; scale: number }) {
  // Sits in the left margin, ~10pt from the text, scaled with the page.
  const gap = Math.max(6, 10 * scale)
  const width = Math.max(3, 3.5 * scale)
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-full transition-colors duration-300"
      style={{ ...style, left: PAD - gap - width, top: PAD, bottom: PAD, width }}
    />
  )
}
