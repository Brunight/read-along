"""Extract paragraphs (text + bounding rects per page) from a book PDF."""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import pymupdf

FOOTER_RE = re.compile(r"^\s*\d+\s*\|\s*P\s*a\s*g\s*e\s*$")
# A line starting this far right of the body margin opens a new paragraph.
INDENT_MIN = 8.0
# A vertical gap this many times the typical line spacing also breaks a paragraph.
GAP_FACTOR = 2.2


def _words(line: dict) -> list[dict]:
    """Splits a rawdict line into words (whitespace-separated) with their bounding boxes."""
    words: list[dict] = []
    cur: dict | None = None
    for span in line["spans"]:
        for ch in span["chars"]:
            if ch["c"].isspace():
                cur = None
                continue
            x0, y0, x1, y1 = ch["bbox"]
            if cur is None:
                cur = {"text": "", "bbox": [x0, y0, x1, y1]}
                words.append(cur)
            cur["text"] += ch["c"]
            b = cur["bbox"]
            b[0], b[1], b[2], b[3] = min(b[0], x0), min(b[1], y0), max(b[2], x1), max(b[3], y1)
    return words


def _lines(page: pymupdf.Page) -> list[dict]:
    out = []
    for block in page.get_text("rawdict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            text = "".join(ch["c"] for s in line["spans"] for ch in s["chars"])
            if not text.strip() or FOOTER_RE.match(text):
                continue
            size = max((s["size"] for s in line["spans"]), default=0)
            out.append({"text": text.strip(), "bbox": line["bbox"], "size": size, "words": _words(line)})
    out.sort(key=lambda l: (round(l["bbox"][1]), l["bbox"][0]))
    return out


def _join(a: str, b: str) -> str:
    # Word keeps real hyphens at line ends ("half-" + "lived"), so glue without a space.
    if a.endswith(("-", "—", "–")):
        return a + b
    return f"{a} {b}"


def extract(pdf_path: Path, progress=None) -> list[dict]:
    """Returns [{id, text, rects: [{page, x0, y0, x1, y1, char}], words: [[page, x0, y0, x1, y1, text]]}].

    In reading order. `page` is 0-based; coordinates are PDF points with a top-left origin.
    `words` concatenated (with tokenize()) give the same tokens as `text`.
    """
    doc = pymupdf.open(pdf_path)
    pages = [_lines(p) for p in doc]

    xs = Counter(round(l["bbox"][0]) for ls in pages for l in ls)
    margin = min(x for x, n in xs.items() if n >= max(10, xs.most_common(1)[0][1] * 0.2))
    gaps = Counter(
        round(b["bbox"][1] - a["bbox"][1])
        for ls in pages
        for a, b in zip(ls, ls[1:])
        if b["bbox"][1] > a["bbox"][1]
    )
    line_step = gaps.most_common(1)[0][0]

    paragraphs: list[dict] = []
    cur: dict | None = None

    def flush():
        nonlocal cur
        if cur and re.search(r"[A-Za-z0-9]", cur["text"]):
            paragraphs.append(cur)
        cur = None

    for pn, lines in enumerate(pages):
        prev_y = None
        for line in lines:
            x0, y0, x1, y1 = line["bbox"]
            indented = x0 - margin >= INDENT_MIN
            gap = prev_y is not None and (y0 - prev_y) > line_step * GAP_FACTOR
            prev_y = y0
            if cur is None or indented or gap:
                flush()
                cur = {"text": line["text"], "rects": [], "words": []}
                offset = 0
            else:
                offset = len(cur["text"])
                cur["text"] = _join(cur["text"], line["text"])
            cur["words"].extend([pn, *w["bbox"], w["text"]] for w in line["words"])
            rects = cur["rects"]
            if rects and rects[-1]["page"] == pn:
                r = rects[-1]
                r["x0"], r["y0"] = min(r["x0"], x0), min(r["y0"], y0)
                r["x1"], r["y1"] = max(r["x1"], x1), max(r["y1"], y1)
            else:
                # `char`: where this page's part of the text begins, so align.py can time each page segment.
                rects.append({"page": pn, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "char": offset})
        if progress:
            progress(pn + 1, len(pages))
    flush()

    for i, p in enumerate(paragraphs):
        p["id"] = i
        for r in p["rects"]:
            for k in ("x0", "y0", "x1", "y1"):
                r[k] = round(r[k], 1)
        for w in p["words"]:
            w[1:5] = [round(v, 1) for v in w[1:5]]
    return paragraphs


def page_sizes(pdf_path: Path) -> list[list[float]]:
    doc = pymupdf.open(pdf_path)
    return [[round(p.rect.width, 1), round(p.rect.height, 1)] for p in doc]


def debug_png(pdf_path: Path, paragraphs: list[dict], out_dir: Path, pages: list[int]):
    """Draw paragraph rects on a few pages for visual checking."""
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf_path)
    colors = [(1, 0.3, 0.3), (0.3, 0.8, 1), (0.4, 1, 0.4), (1, 0.8, 0.2)]
    for pn in pages:
        if pn >= len(doc):
            continue
        page = doc[pn]
        for p in paragraphs:
            for r in p["rects"]:
                if r["page"] == pn:
                    page.draw_rect(
                        pymupdf.Rect(r["x0"], r["y0"], r["x1"], r["y1"]),
                        color=colors[p["id"] % len(colors)],
                        width=1.2,
                    )
                    page.insert_text((r["x0"] - 20, r["y0"] + 10), str(p["id"]), fontsize=7, color=(1, 1, 0))
        page.get_pixmap(dpi=80).save(out_dir / f"page-{pn + 1:03d}.png")
