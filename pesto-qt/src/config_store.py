"""
Pesto Captions — Local Config Store
AGPL-3.0

Reads/writes config.json in ~/Library/Application Support/Pesto Captions/
No account, no device binding.
"""

import json
import os
from pathlib import Path
from segmentation import DEFAULT_SEGMENTATION, DEFAULT_PUNCTUATION

APP_NAME = "Pesto Captions"

DEFAULT_CONFIG = {
    "binName": "Pesto Captions",
    "engine": "native",
    "language": "auto",
    "segmentation": DEFAULT_SEGMENTATION,
    "presets": {},
}


def get_config_dir() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path.home() / "Library" / "Application Support"
    d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_config_path() -> Path:
    return get_config_dir() / "config.json"


def load_config() -> dict:
    path = get_config_path()
    if not path.exists():
        return dict(DEFAULT_CONFIG)
    try:
        with open(path) as f:
            stored = json.load(f)
        # Deep merge with defaults
        merged = dict(DEFAULT_CONFIG)
        merged.update(stored)
        merged["segmentation"] = {**DEFAULT_SEGMENTATION, **stored.get("segmentation", {})}
        merged["segmentation"]["punctuation"] = {
            **DEFAULT_PUNCTUATION,
            **stored.get("segmentation", {}).get("punctuation", {})
        }
        return merged
    except Exception:
        return dict(DEFAULT_CONFIG)


def save_config(cfg: dict):
    with open(get_config_path(), "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
