"""Prepare every book in the books folder for the Reader Sensei app.

For each books/<series>/<volume>/ with a *.pdf and audio/*.m4b, writes <volume>/.sync/:
  paragraphs.json  PDF paragraphs with page rects
  transcript.json  Whisper words with timestamps (cached; the slow part)
  sync.json        what the web app reads
  words.json       per-word page boxes + times (for word highlighting)
  cover.jpg        library cover (the PDF's cover page, else the m4b's cover art)

Usage: uv run prep.py [BOOKS_DIR] [--book SERIES[/VOLUME]] [--force] [--force-transcribe] [--model large-v3] [--debug-png]
"""

from __future__ import annotations

import argparse
import json
import re
import traceback
from collections import Counter
from pathlib import Path

from rich.console import Console
from rich.progress import BarColumn, Progress, TextColumn, TimeElapsedColumn, TimeRemainingColumn
from rich.table import Table

import align
import cover
import pdf_paragraphs
import transcribe

SYNC_VERSION = 3
console = Console()


def _subdirs(d: Path) -> list[Path]:
    return sorted(p for p in d.iterdir() if p.is_dir() and not p.name.startswith("."))


def find_books(root: Path) -> list[dict]:
    """Volumes laid out as books/<series>/<volume>/{*.pdf, audio/*.m4b}; id = "<series>/<volume>"."""
    books = []
    for series in _subdirs(root):
        for d in _subdirs(series):
            vid = f"{series.name}/{d.name}"
            pdfs = sorted(d.glob("*.pdf"))
            audios = sorted((d / "audio").glob("*.m4b"))
            if pdfs and audios:
                books.append({"id": vid, "series": series.name, "dir": d, "pdf": pdfs[0], "audio": audios[0]})
            else:
                console.print(f"[yellow]skip {vid}: needs a *.pdf and audio/*.m4b[/]")
    return books


def is_up_to_date(book: dict) -> bool:
    sync = book["dir"] / ".sync" / "sync.json"
    if not sync.exists():
        return False
    try:
        if json.loads(sync.read_text()).get("version") != SYNC_VERSION:
            return False
    except json.JSONDecodeError:
        return False
    mtime = sync.stat().st_mtime
    return mtime > book["pdf"].stat().st_mtime and mtime > book["audio"].stat().st_mtime


def name_prompt(paragraphs: list[dict], limit: int = 30) -> str:
    """Capitalized words that never appear lowercase (mostly character and place names), to help spelling."""
    words = Counter()
    lower = set()
    for p in paragraphs:
        for m in re.finditer(r"(?<![.!?“\"]\s)(?<!^)\b([A-Z][a-z]{2,})\b", p["text"]):
            words[m.group(1)] += 1
        lower.update(re.findall(r"\b[a-z]{3,}\b", p["text"]))
    names = [w for w, n in words.most_common() if n >= 3 and w.lower() not in lower]
    return "Names: " + ", ".join(names[:limit]) + "."


def book_title(audio: Path, fallback: str) -> str:
    import subprocess

    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format_tags=title,album", "-of", "json", str(audio)],
        capture_output=True, text=True,
    ).stdout
    tags = json.loads(out or "{}").get("format", {}).get("tags", {})
    return tags.get("album") or tags.get("title") or fallback


def process(book: dict, args, model, progress: Progress) -> dict:
    out = book["dir"] / ".sync"
    out.mkdir(exist_ok=True)

    t = progress.add_task(f"{book['id']}: PDF", total=1)
    paragraphs = pdf_paragraphs.extract(book["pdf"], lambda d, n: progress.update(t, completed=d, total=n))
    (out / "paragraphs.json").write_text(json.dumps(paragraphs, ensure_ascii=False))
    if args.debug_png:
        mid = paragraphs[len(paragraphs) // 2]["rects"][0]["page"]
        pages = sorted({paragraphs[0]["rects"][0]["page"], 19, 20, 21, mid})
        pdf_paragraphs.debug_png(book["pdf"], paragraphs, out / "debug", pages)

    t = progress.add_task(f"{book['id']}: transcribe", total=1)
    transcript_path = out / "transcript.json"

    def on_audio(pos, total, chapter):
        progress.update(t, completed=pos, total=total, description=f"{book['id']}: {chapter[:40]}")

    transcript = transcribe.transcribe(
        book["audio"], transcript_path, model, args.model,
        prompt=name_prompt(paragraphs), force=args.force_transcribe, progress=on_audio,
    )
    progress.update(t, description=f"{book['id']}: transcribed")

    t = progress.add_task(f"{book['id']}: align", total=1)
    result = align.align(paragraphs, transcript)
    progress.update(t, completed=1)

    words = result.pop("words")
    # Separate file: only fetched by the reader when word highlighting is on.
    (out / "words.json").write_text(json.dumps(
        {"version": SYNC_VERSION, "fields": ["page", "x0", "y0", "x1", "y1", "start", "paragraph"], "words": words},
        separators=(",", ":"),
    ))
    sync = {
        "version": SYNC_VERSION,
        "id": book["id"],
        "series": book["series"],
        "title": book_title(book["audio"], book["id"]),
        "pdf": book["pdf"].name,
        "audio": book["audio"].name,
        "duration": round(transcript["duration"], 2),
        "pages": pdf_paragraphs.page_sizes(book["pdf"]),
        **result,
    }
    (out / "sync.json").write_text(json.dumps(sync, ensure_ascii=False))
    return sync


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("books_dir", nargs="?", default=str(Path(__file__).resolve().parent.parent / "books"))
    ap.add_argument("--book", action="append", help="only this series, or series/volume (repeatable)")
    ap.add_argument("--force", action="store_true", help="rebuild even if sync.json is up to date")
    ap.add_argument("--force-transcribe", action="store_true", help="ignore cached transcripts")
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--debug-png", action="store_true", help="render pages with paragraph boxes to .sync/debug")
    ap.add_argument("--covers-only", action="store_true", help="only extract missing covers (no transcription)")
    args = ap.parse_args()

    transcribe.ensure_cuda_libs()

    books = find_books(Path(args.books_dir))
    if args.book:
        books = [b for b in books if b["id"] in args.book or b["series"] in args.book]
    # Covers are cheap, so every volume gets one, even those not (yet) transcribed.
    for b in books:
        try:
            cover.ensure_cover(b["pdf"], b["audio"], b["dir"] / ".sync")
        except Exception as e:  # a missing cover must never block transcription
            console.print(f"[yellow]{b['id']}: no cover ({e})[/]")
    if args.covers_only:
        console.print(f"covers ready for {len(books)} volume(s)")
        return

    todo = [b for b in books if args.force or args.force_transcribe or not is_up_to_date(b)]
    for b in books:
        if b not in todo:
            console.print(f"[dim]{b['id']}: up to date[/]")
    if not todo:
        return

    model = None

    class LazyModel:
        """Load Whisper only if some book actually needs transcribing."""

        def transcribe(self, *a, **kw):
            nonlocal model
            if model is None:
                console.print(f"loading Whisper {args.model}…")
                model = transcribe.load_model(args.model)
            return model.transcribe(*a, **kw)

    results = []
    with Progress(
        TextColumn("{task.description:<45}"), BarColumn(), TextColumn("{task.percentage:>5.1f}%"),
        TimeElapsedColumn(), TimeRemainingColumn(), console=console,
    ) as progress:
        for b in todo:
            try:
                results.append((b, process(b, args, LazyModel(), progress), None))
            except Exception as e:  # keep going with the other books
                results.append((b, None, e))
                progress.console.print(f"[red]{b['id']} failed:[/]\n{traceback.format_exc()}")

    for b, sync, err in results:
        if err:
            console.print(f"[red]✗ {b['id']}: {err}[/]")
            continue
        st = sync["stats"]
        table = Table(title=f"{b['id']} — {sync['title']}", title_justify="left")
        table.add_column("chapter")
        table.add_column("start", justify="right")
        table.add_column("words", justify="right")
        table.add_column("matched", justify="right")
        table.add_column("1st paragraph", justify="right")
        for c in sync["chapters"]:
            ratio = c["match"]
            color = "green" if ratio and ratio >= 0.85 else "yellow" if ratio and ratio >= 0.5 else "dim"
            s = int(c["start"])
            table.add_row(
                c["title"], f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}", str(c["words"]),
                f"[{color}]{ratio:.1%}[/]" if ratio is not None else "-",
                str(c["firstParagraphId"]) if c["firstParagraphId"] is not None else "-",
            )
        console.print(table)
        console.print(
            f"PDF words matched {st['pdfMatched']:.1%}, transcript words matched {st['transcriptMatched']:.1%}, "
            f"paragraphs synced {st['syncedParagraphs']}/{st['paragraphs']}\n"
        )


if __name__ == "__main__":
    main()
