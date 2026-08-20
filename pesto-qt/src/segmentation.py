"""
Pesto Captions — Segmentation Engine (Python)
AGPL-3.0

Pure functions: no side effects, fully testable.
"""

import re
from typing import Optional


# ── Types ──────────────────────────────────────────────────────────

def apply_casing(text: str, mode: str) -> str:
    if mode == "uppercase":
        return text.upper()
    if mode == "lowercase":
        return text.lower()
    if mode == "sentence":
        t = text.strip()
        if not t:
            return text
        return t[0].upper() + t[1:].lower()
    return text  # unchanged


def normalize_punctuation(text: str, cfg: dict) -> str:
    t = text
    if not cfg.get("comma", True):       t = t.replace(",", "")
    if not cfg.get("period", True):      t = t.replace(".", "")
    if not cfg.get("questionMark", True):t = t.replace("?", "")
    if not cfg.get("exclamationMark", True): t = t.replace("!", "")
    if not cfg.get("quotes", True):      t = re.sub(r'[""\'\'„"«»]', "", t)
    if not cfg.get("dash", True):        t = re.sub(r'[-–—]', "", t)
    if not cfg.get("semicolon", True):   t = t.replace(";", "")
    if not cfg.get("colon", True):       t = t.replace(":", "")
    return re.sub(r"  +", " ", t).strip()


def parse_emphasis_runs(text: str) -> list:
    """Parse **word** markup into TextRun list."""
    runs = []
    last = 0
    for m in re.finditer(r"\*\*(.+?)\*\*", text):
        if m.start() > last:
            runs.append({"text": text[last:m.start()], "emphasis": False})
        runs.append({"text": m.group(1), "emphasis": True})
        last = m.end()
    if last < len(text):
        runs.append({"text": text[last:], "emphasis": False})
    return runs if runs else [{"text": text, "emphasis": False}]


def segment_from_words(words: list, cfg: dict) -> list:
    """
    Segment word-timed tokens into CaptionCues.
    cfg keys: maxChars, maxWords, minDurationMs, maxDurationMs, fillGapsMs, casing, punctuation
    """
    cues = []
    group = []
    char_count = 0

    def flush():
        nonlocal group, char_count
        if not group:
            return
        text = " ".join(w["word"] for w in group)
        text = normalize_punctuation(text, cfg.get("punctuation", {}))
        text = apply_casing(text, cfg.get("casing", "unchanged"))

        start_sec = group[0]["start"]
        end_sec = group[-1]["end"]
        dur_ms = (end_sec - start_sec) * 1000
        effective_end = end_sec if dur_ms >= cfg.get("minDurationMs", 500) \
            else start_sec + cfg.get("minDurationMs", 500) / 1000

        cues.append({
            "cueIndex": len(cues) + 1,
            "startSec": start_sec,
            "endSec": effective_end,
            "runs": parse_emphasis_runs(text),
            "timingEditable": True,
        })
        group = []
        char_count = 0

    for word in words:
        w = word["word"].strip()
        extra = len(w) + (1 if group else 0)
        if group and (char_count + extra > cfg.get("maxChars", 42) or len(group) >= cfg.get("maxWords", 8)):
            flush()
        group.append(word)
        char_count += extra

    flush()

    # Fill gaps
    fill_ms = cfg.get("fillGapsMs", 0)
    if fill_ms > 0 and len(cues) > 1:
        for i in range(len(cues) - 1):
            gap_ms = (cues[i + 1]["startSec"] - cues[i]["endSec"]) * 1000
            if 0 < gap_ms <= fill_ms:
                cues[i]["endSec"] = cues[i + 1]["startSec"]

    # Clamp max duration
    max_ms = cfg.get("maxDurationMs", 5000)
    for cue in cues:
        if (cue["endSec"] - cue["startSec"]) * 1000 > max_ms:
            cue["endSec"] = cue["startSec"] + max_ms / 1000

    return cues


def segment_from_phrases(phrases: list, cfg: dict) -> list:
    """Segment phrase-level tokens (no word timing) into CaptionCues."""
    cues = []
    for i, phrase in enumerate(phrases):
        text = normalize_punctuation(phrase["text"], cfg.get("punctuation", {}))
        text = apply_casing(text, cfg.get("casing", "unchanged"))
        dur_ms = (phrase["end"] - phrase["start"]) * 1000
        effective_end = phrase["end"] if dur_ms >= cfg.get("minDurationMs", 500) \
            else phrase["start"] + cfg.get("minDurationMs", 500) / 1000
        cues.append({
            "cueIndex": i + 1,
            "startSec": phrase["start"],
            "endSec": effective_end,
            "runs": [{"text": text, "emphasis": False}],
            "timingEditable": False,
        })
    return cues


def segment_cues(transcribe_result: dict, cfg: dict) -> list:
    """Main entry: dispatch to word or phrase segmentation."""
    if transcribe_result.get("wordTimingAvailable") and transcribe_result.get("words"):
        return segment_from_words(transcribe_result["words"], cfg)
    return segment_from_phrases(transcribe_result.get("phrases", []), cfg)


# ── SRT/VTT parsing ────────────────────────────────────────────────

def _parse_ts(ts: str) -> float:
    ts = ts.strip().replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    if len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def parse_srt(content: str) -> list:
    phrases = []
    for block in re.split(r"\n\n+", content.strip()):
        lines = block.strip().split("\n")
        timing_line = next((l for l in lines if "-->" in l), None)
        if not timing_line:
            continue
        parts = timing_line.split("-->")
        if len(parts) != 2:
            continue
        try:
            start = _parse_ts(parts[0])
            end = _parse_ts(parts[1].split()[0])  # strip extra metadata (VTT)
        except Exception:
            continue
        idx = lines.index(timing_line)
        text = " ".join(lines[idx + 1:]).strip()
        # Strip HTML tags that may appear in VTT
        text = re.sub(r"<[^>]+>", "", text).strip()
        if text:
            phrases.append({"text": text, "start": start, "end": end})
    return phrases


def parse_vtt(content: str) -> list:
    body = re.sub(r"^WEBVTT.*\n?", "", content, flags=re.MULTILINE).strip()
    return parse_srt(body)


# ── SRT export ─────────────────────────────────────────────────────

def format_ts(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def export_srt(cues: list) -> str:
    parts = []
    for cue in cues:
        text = "".join(r["text"] for r in cue["runs"])
        parts.append(f"{cue['cueIndex']}\n{format_ts(cue['startSec'])} --> {format_ts(cue['endSec'])}\n{text}")
    return "\n\n".join(parts)


# ── Default config ─────────────────────────────────────────────────

DEFAULT_PUNCTUATION = {
    "comma": True, "period": True, "questionMark": True,
    "exclamationMark": True, "quotes": True, "dash": True,
    "semicolon": True, "colon": True,
}

DEFAULT_SEGMENTATION = {
    "maxChars": 42,
    "maxWords": 8,
    "minDurationMs": 500,
    "maxDurationMs": 5000,
    "fillGapsMs": 0,
    "casing": "unchanged",
    "punctuation": DEFAULT_PUNCTUATION,
}
