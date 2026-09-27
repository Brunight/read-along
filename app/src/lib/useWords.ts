import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/** [page, x0, y0, x1, y1, start, paragraphId] — see prep/prep.py (words.json). */
export type Word = [number, number, number, number, number, number, number]

/** A word stays highlighted at most this long; longer gaps are pauses or unnarrated text. */
const MAX_WORD_HOLD = 2.5

/** Loads a book's word timings (only when enabled; the file is ~0.7 MB gzipped). */
export function useWords(url: string, enabled: boolean): Word[] | null {
  const [words, setWords] = useState<Word[] | null>(null)
  useEffect(() => {
    if (!enabled || words) return
    const ctrl = new AbortController()
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { words: Word[] } | null) => data && setWords(data.words))
      .catch(() => {
        // Older prep output has no words.json: word highlighting just stays off.
      })
    return () => ctrl.abort()
  }, [url, enabled, words])
  return enabled ? words : null
}

function wordAt(words: Word[], t: number): number {
  let lo = 0
  let hi = words.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (words[mid][5] <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans >= 0 && t - words[ans][5] <= MAX_WORD_HOLD ? ans : -1
}

/**
 * Index of the word being spoken. Polls the audio every animation frame while playing,
 * since `timeupdate` fires only ~4×/s and words last ~0.3 s.
 */
export function useActiveWord(
  words: Word[] | null,
  audioRef: RefObject<HTMLAudioElement | null>,
  playing: boolean,
  time: number,
): number {
  const [idx, setIdx] = useState(-1)

  // Paused / seeking: follow the React time state.
  useEffect(() => {
    if (words) setIdx(wordAt(words, time))
  }, [words, time])

  useEffect(() => {
    if (!words || !playing) return
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      if (a) {
        const i = wordAt(words, a.currentTime)
        setIdx((prev) => (prev === i ? prev : i))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [words, playing, audioRef])

  return words ? idx : -1
}
