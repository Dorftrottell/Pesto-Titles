"""
Pesto Captions — Style Manager
AGPL-3.0

Saves, loads, and lists caption styles from pesto-qt/styles/.
Each style = one JSON file (metadata + base64 thumbnail).
"""

import json
import os
import re
import base64
from datetime import datetime
from pathlib import Path

# Styles directory is always relative to this file's parent's parent
# i.e.  pesto-qt/src/style_manager.py -> pesto-qt/styles/
STYLES_DIR = Path(__file__).parent.parent / "styles"


def _ensure_dir():
    STYLES_DIR.mkdir(parents=True, exist_ok=True)


def _slug(name: str) -> str:
    """Convert style name to safe filename."""
    slug = re.sub(r"[^\w\-]", "_", name.strip().lower())
    return slug[:64] or "style"


def save_style(name: str, clip_name: str, bin_name: str, thumbnail_b64: str | None) -> Path:
    """
    Save a style to the styles directory.
    Returns the path of the saved file.
    """
    _ensure_dir()
    data = {
        "name": name,
        "clipName": clip_name,
        "binName": bin_name,
        "thumbnail": thumbnail_b64 or "",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    slug = _slug(name)
    # Avoid collisions
    path = STYLES_DIR / f"{slug}.json"
    counter = 1
    while path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        if existing.get("name") == name:
            break  # overwrite same name
        path = STYLES_DIR / f"{slug}_{counter}.json"
        counter += 1

    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def list_styles() -> list[dict]:
    """
    Return all saved styles sorted by creation date (newest first).
    Each dict: {name, clipName, binName, thumbnail, created_at, path}
    """
    _ensure_dir()
    styles = []
    for f in STYLES_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data["path"] = str(f)
            styles.append(data)
        except Exception:
            pass
    # Sort newest first
    styles.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    return styles


def delete_style(path: str):
    """Delete a style file."""
    p = Path(path)
    if p.exists() and p.suffix == ".json" and p.parent == STYLES_DIR:
        p.unlink()


def get_styles_dir() -> Path:
    _ensure_dir()
    return STYLES_DIR
