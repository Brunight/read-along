"""Extract a cover image for the library into <volume>/.sync/cover.<ext>."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pymupdf

# The PDF's first page counts as the cover if one image fills at least this much of it.
MIN_PAGE_COVERAGE = 0.9


def _from_pdf(pdf: Path) -> tuple[bytes, str] | None:
    """The original image embedded as the PDF's first page (the light-novel cover)."""
    doc = pymupdf.open(pdf)
    if not len(doc):
        return None
    page = doc[0]
    area = page.rect.width * page.rect.height
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        if info["xref"] and (x1 - x0) * (y1 - y0) >= area * MIN_PAGE_COVERAGE:
            img = doc.extract_image(info["xref"])
            ext = "jpg" if img["ext"] in ("jpeg", "jpg") else img["ext"]
            if ext in ("jpg", "png", "webp"):
                return img["image"], ext
            # Other encodings (jpx, …): re-encode as PNG so browsers can show it.
            return pymupdf.Pixmap(doc, info["xref"]).tobytes("png"), "png"
    return None


def _from_audio(audio: Path, out: Path) -> Path | None:
    """The m4b's embedded cover art (square audiobook art)."""
    dest = out / "cover.jpg"
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(audio), "-map", "0:v:0", "-frames:v", "1", "-c", "copy", str(dest)],
        capture_output=True,
    )
    return dest if r.returncode == 0 and dest.exists() and dest.stat().st_size else None


def existing(out: Path) -> Path | None:
    return next((p for p in sorted(out.glob("cover.*")) if p.suffix in (".jpg", ".png", ".webp")), None)


def ensure_cover(pdf: Path, audio: Path, out: Path) -> Path | None:
    """Writes out/cover.<ext> once (from the PDF, else the audio); returns its path."""
    if found := existing(out):
        return found
    out.mkdir(exist_ok=True)
    if got := _from_pdf(pdf):
        data, ext = got
        dest = out / f"cover.{ext}"
        dest.write_bytes(data)
        return dest
    return _from_audio(audio, out)
