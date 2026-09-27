"""Transcribe an m4b chapter by chapter with faster-whisper, keeping word timestamps."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

TRANSCRIPT_VERSION = 2


def _cuda_lib_dirs() -> list[str]:
    """cuBLAS/cuDNN ship as pip wheels (nvidia-*-cu12); ctranslate2 needs them on the loader path."""
    import importlib.util

    dirs = []
    for mod in ("nvidia.cublas", "nvidia.cudnn"):
        spec = importlib.util.find_spec(mod)
        if spec and spec.submodule_search_locations:
            dirs.append(str(Path(list(spec.submodule_search_locations)[0]) / "lib"))
    return dirs


def ensure_cuda_libs():
    """Re-exec the process with LD_LIBRARY_PATH set, since the loader reads it only at startup."""
    dirs = _cuda_lib_dirs()
    current = os.environ.get("LD_LIBRARY_PATH", "").split(":")
    if dirs and not all(d in current for d in dirs):
        os.environ["LD_LIBRARY_PATH"] = ":".join(dirs + [c for c in current if c])
        os.execv(sys.executable, [sys.executable, *sys.argv])


def chapters(audio: Path) -> tuple[float, list[dict]]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_chapters", "-show_format", "-of", "json", str(audio)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    data = json.loads(out)
    duration = float(data["format"]["duration"])
    chs = [
        {
            "title": c.get("tags", {}).get("title", f"Chapter {i + 1}").strip(),
            "start": float(c["start_time"]),
            "end": float(c["end_time"]),
        }
        for i, c in enumerate(data.get("chapters", []))
    ]
    if not chs:
        chs = [{"title": "Full book", "start": 0.0, "end": duration}]
    return duration, chs


def load_model(name: str):
    from faster_whisper import WhisperModel

    return WhisperModel(name, device="cuda", compute_type="float16")


def _is_compatible(cached: dict, audio: Path, model_name: str) -> bool:
    return (
        cached.get("version") == TRANSCRIPT_VERSION
        and cached.get("audioSize") == audio.stat().st_size
        and cached.get("model") == model_name
    )


def transcribe(
    audio: Path,
    out_path: Path,
    model,
    model_name: str,
    prompt: str | None = None,
    force: bool = False,
    progress=None,
) -> dict:
    """Writes/returns {version, model, audioSize, duration, chapters: [{title, start, end, words: [[w, s, e, p]]}]}.

    Saves after every chapter, so an interrupted run resumes where it stopped.
    """
    duration, chs = chapters(audio)
    cached = {}
    if out_path.exists() and not force:
        cached = json.loads(out_path.read_text())
        if not _is_compatible(cached, audio, model_name):
            cached = {}
    done = {c["title"]: c for c in cached.get("chapters", []) if "words" in c}

    result = {
        "version": TRANSCRIPT_VERSION,
        "model": model_name,
        "audioSize": audio.stat().st_size,
        "duration": duration,
        "chapters": [],
    }
    with tempfile.TemporaryDirectory() as tmp:
        for ch in chs:
            prev = done.get(ch["title"])
            if prev and abs(prev["start"] - ch["start"]) < 0.01:
                result["chapters"].append(prev)
                if progress:
                    progress(ch["end"], duration, ch["title"])
                continue

            wav = Path(tmp) / "chapter.wav"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-ss", str(ch["start"]), "-to", str(ch["end"]),
                 "-i", str(audio), "-vn", "-ac", "1", "-ar", "16000", str(wav)],
                check=True,
            )
            segments, _ = model.transcribe(
                str(wav),
                language="en",
                word_timestamps=True,
                vad_filter=True,
                # Conditioning on previous text makes Whisper loop/hallucinate over long narration
                # (and hotwords get echoed as fake words), so each window is decoded independently.
                condition_on_previous_text=False,
                initial_prompt=prompt,
            )
            words = []
            for seg in segments:
                for w in seg.words or []:
                    words.append([w.word.strip(), round(ch["start"] + w.start, 3),
                                  round(ch["start"] + w.end, 3), round(w.probability, 3)])
                if progress:
                    progress(ch["start"] + seg.end, duration, ch["title"])
            result["chapters"].append({**ch, "words": words})
            out_path.write_text(json.dumps(result))
            if progress:
                progress(ch["end"], duration, ch["title"])

    out_path.write_text(json.dumps(result))
    return result
