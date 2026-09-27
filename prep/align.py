"""Align PDF paragraphs to transcript word timestamps.

The PDF has no machine-readable chapter headings, so alignment is global:
  1. word 4-grams that occur exactly once in both texts become candidate anchors;
  2. the longest monotonic chain of anchors is kept (drops spurious matches);
  3. gaps between anchors are refined with difflib;
  4. every PDF word gets a time, interpolated between matched neighbours.
"""

from __future__ import annotations

import bisect
import re
from collections import Counter
from difflib import SequenceMatcher

NGRAM = 4
MAX_GAP_CELLS = 4_000_000

_APOS = re.compile(r"['’‘]")
_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(_APOS.sub("", text.lower()))


def _lis(pairs: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Longest chain strictly increasing in both coordinates (pairs sorted by first)."""
    tails: list[int] = []
    tails_idx: list[int] = []
    back = [-1] * len(pairs)
    for k, (_, j) in enumerate(pairs):
        pos = bisect.bisect_left(tails, j)
        if pos == len(tails):
            tails.append(j)
            tails_idx.append(k)
        else:
            tails[pos] = j
            tails_idx[pos] = k
        back[k] = tails_idx[pos - 1] if pos else -1
    chain = []
    k = tails_idx[-1] if tails_idx else -1
    while k != -1:
        chain.append(pairs[k])
        k = back[k]
    return chain[::-1]


def match_tokens(a: list[str], b: list[str]) -> list[int | None]:
    """For each token in `a`, the index of its matching token in `b` (or None)."""
    grams_a = Counter(tuple(a[i:i + NGRAM]) for i in range(len(a) - NGRAM + 1))
    grams_b: dict[tuple, int] = {}
    count_b = Counter()
    for j in range(len(b) - NGRAM + 1):
        g = tuple(b[j:j + NGRAM])
        count_b[g] += 1
        grams_b[g] = j
    pairs = [
        (i, grams_b[g])
        for i in range(len(a) - NGRAM + 1)
        if grams_a[(g := tuple(a[i:i + NGRAM]))] == 1 and count_b[g] == 1
    ]
    anchors = _lis(pairs)

    m: list[int | None] = [None] * len(a)
    for i, j in anchors:
        for k in range(NGRAM):
            m[i + k] = j + k

    # Refine between consecutive anchors.
    bounds = [(-NGRAM, -NGRAM)] + anchors + [(len(a), len(b))]
    for (i0, j0), (i1, j1) in zip(bounds, bounds[1:]):
        a0, b0 = i0 + NGRAM, j0 + NGRAM
        if i1 <= a0 or j1 <= b0 or (i1 - a0) * (j1 - b0) > MAX_GAP_CELLS:
            continue
        # Leading/trailing gaps are unbounded on one side (front matter, credits); skip them.
        if i0 < 0 or i1 == len(a):
            continue
        sm = SequenceMatcher(None, a[a0:i1], b[b0:j1], autojunk=False)
        for blk in sm.get_matching_blocks():
            for k in range(blk.size):
                m[a0 + blk.a + k] = b0 + blk.b + k
    return m


def align(paragraphs: list[dict], transcript: dict) -> dict:
    # PDF side: tokens tagged with paragraph id.
    pdf_tokens: list[str] = []
    pdf_para: list[int] = []
    # First token index of each PDF word, as (paragraph id, word index) -> token index.
    word_tok: dict[tuple[int, int], int] = {}
    for p in paragraphs:
        words = p.get("words")
        if words:
            for wi, w in enumerate(words):
                toks = tokenize(w[5])
                if toks:
                    word_tok[(p["id"], wi)] = len(pdf_tokens)
                for t in toks:
                    pdf_tokens.append(t)
                    pdf_para.append(p["id"])
        else:
            for t in tokenize(p["text"]):
                pdf_tokens.append(t)
                pdf_para.append(p["id"])

    # Transcript side: tokens with word start time and chapter index.
    tr_tokens: list[str] = []
    tr_time: list[float] = []
    tr_chapter: list[int] = []
    for ci, ch in enumerate(transcript["chapters"]):
        for w, start, _end, _p in ch["words"]:
            for t in tokenize(w):
                tr_tokens.append(t)
                tr_time.append(start)
                tr_chapter.append(ci)

    m = match_tokens(pdf_tokens, tr_tokens)

    # Interpolate a time for every PDF token between matched neighbours.
    matched_idx = [i for i, j in enumerate(m) if j is not None]
    times: list[float | None] = [None] * len(pdf_tokens)
    for i in matched_idx:
        times[i] = tr_time[m[i]]
    for i0, i1 in zip(matched_idx, matched_idx[1:]):
        t0, t1 = times[i0], times[i1]
        for k in range(i0 + 1, i1):
            times[k] = t0 + (t1 - t0) * (k - i0) / (i1 - i0)

    # Paragraph start = time of its first token; paragraphs outside the matched range are dropped.
    first_tok: dict[int, int] = {}
    tok_count = Counter(pdf_para)
    matched_count = Counter(pdf_para[i] for i in matched_idx)
    for i, pid in enumerate(pdf_para):
        first_tok.setdefault(pid, i)

    synced = []
    last = -1.0
    for p in paragraphs:
        i = first_tok.get(p["id"])
        if i is None or times[i] is None:
            continue
        start = max(times[i], last)
        last = start
        # Each page segment of a paragraph gets its own start time, so the reader can
        # scroll to the next page when narration crosses the page break mid-paragraph.
        rects = []
        for k, r in enumerate(p["rects"]):
            seg = {key: r[key] for key in ("page", "x0", "y0", "x1", "y1")}
            if k == 0:
                seg["start"] = round(start, 2)
            else:
                j = min(i + len(tokenize(p["text"][: r.get("char", 0)])), i + tok_count[p["id"]] - 1)
                t = times[j] if times[j] is not None else start
                seg["start"] = round(max(t, rects[-1]["start"]), 2)
            rects.append(seg)
        synced.append({
            "id": p["id"],
            "start": round(start, 2),
            "match": round(matched_count[p["id"]] / tok_count[p["id"]], 2),
            "rects": rects,
        })
    for a, b in zip(synced, synced[1:]):
        a["end"] = b["start"]
    if synced:
        last_ch = transcript["chapters"][tr_chapter[m[matched_idx[-1]]]]
        synced[-1]["end"] = round(last_ch["end"], 2)

    # Chapters and per-chapter stats.
    tr_matched = Counter(tr_chapter[j] for j in m if j is not None)
    tr_total = Counter(tr_chapter)
    chapters = []
    starts = [p["start"] for p in synced]
    for ci, ch in enumerate(transcript["chapters"]):
        k = bisect.bisect_left(starts, ch["start"] - 0.5)
        first = synced[k]["id"] if k < len(synced) and synced[k]["start"] < ch["end"] else None
        chapters.append({
            "title": ch["title"],
            "start": round(ch["start"], 2),
            "end": round(ch["end"], 2),
            "firstParagraphId": first,
            "match": round(tr_matched[ci] / tr_total[ci], 3) if tr_total[ci] else None,
            "words": tr_total[ci],
        })

    # Word-level timing: every word of a synced paragraph gets the time of its first token.
    # Words without letters/digits (a lone dash, "***") are skipped.
    synced_ids = {p["id"] for p in synced}
    words_out = []
    last_t = -1.0
    for p in paragraphs:
        if p["id"] not in synced_ids:
            continue
        for wi, w in enumerate(p.get("words", [])):
            i = word_tok.get((p["id"], wi))
            if i is None or times[i] is None:
                continue
            t = max(times[i], last_t)
            last_t = t
            words_out.append([w[0], w[1], w[2], w[3], w[4], round(t, 2), p["id"]])

    return {
        "words": words_out,
        "chapters": chapters,
        "paragraphs": synced,
        "stats": {
            "pdfWords": len(pdf_tokens),
            "transcriptWords": len(tr_tokens),
            "pdfMatched": round(len(matched_idx) / max(1, len(pdf_tokens)), 3),
            "transcriptMatched": round(sum(tr_matched.values()) / max(1, len(tr_tokens)), 3),
            "paragraphs": len(paragraphs),
            "syncedParagraphs": len(synced),
        },
    }
