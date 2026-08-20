"""
Pesto Captions — Web Server (FastAPI + lokaler Browser)
AGPL-3.0  |  Kein Login, kein Paywall

Starten: python server.py
Browser öffnet sich automatisch auf http://localhost:7425
"""

import sys
import os
import json
import asyncio
import threading
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel

# ── Paths ──────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
UI_DIR   = BASE_DIR / "ui"
DATA_DIR = Path.home() / ".pesto-captions"
CONFIG_FILE = DATA_DIR / "config.json"
STYLES_DIR  = DATA_DIR / "styles"

DATA_DIR.mkdir(exist_ok=True)
STYLES_DIR.mkdir(exist_ok=True)

# Point style_manager at the correct user data directory
os.environ["PESTO_STYLES_DIR"] = str(STYLES_DIR)

sys.path.insert(0, str(BASE_DIR))
import resolve_bridge as rb
import style_manager as sm

# ── Default config ─────────────────────────────────────────────────
DEFAULT_CONFIG: dict = {
    "binName": "Pesto Captions",
    "engine": "native",
    "language": "auto",
    "modelSize": "small",
    "segmentation": {
        "maxChars": 42,
        "maxWords": 8,
        "minDurationMs": 500,
        "maxDurationMs": 5000,
        "fillGapsMs": 0,
        "casing": "unchanged",
        "punctuation": {
            "comma": True, "period": True, "questionMark": True,
            "exclamationMark": True, "quotes": True, "dash": True,
            "semicolon": True, "colon": True,
        },
    },
}

def load_config() -> dict:
    try:
        stored = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        merged = {**DEFAULT_CONFIG, **stored}
        # Deep-merge segmentation
        merged["segmentation"] = {
            **DEFAULT_CONFIG["segmentation"],
            **stored.get("segmentation", {}),
        }
        merged["segmentation"]["punctuation"] = {
            **DEFAULT_CONFIG["segmentation"]["punctuation"],
            **stored.get("segmentation", {}).get("punctuation", {}),
        }
        return merged
    except Exception:
        return dict(DEFAULT_CONFIG)

def save_config(cfg: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")

# ── Lifespan (replaces deprecated on_event) ───────────────────────
@asynccontextmanager
async def lifespan(application: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()
    def _open():
        import time; time.sleep(1.2)
        webbrowser.open("http://localhost:7425")
    threading.Thread(target=_open, daemon=True).start()
    yield  # app runs here

# ── FastAPI App ────────────────────────────────────────────────────
app = FastAPI(title="Pesto Captions", docs_url=None, redoc_url=None, lifespan=lifespan)

# ── WebSocket Manager ──────────────────────────────────────────────
class WSManager:
    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.append(ws)

    async def disconnect(self, ws: WebSocket):
        try:
            self._clients.remove(ws)
        except ValueError:
            pass

    async def broadcast(self, msg: dict):
        data = json.dumps(msg, ensure_ascii=False)
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

ws_manager = WSManager()
_loop: Optional[asyncio.AbstractEventLoop] = None

def broadcast_sync(msg: dict) -> None:
    """Call from worker threads to send WS message."""
    if _loop and not _loop.is_closed():
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(msg), _loop)

# ── Static files + index ───────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(UI_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse((UI_DIR / "index.html").read_text(encoding="utf-8"))

# ── Status & Connect ───────────────────────────────────────────────
@app.get("/api/status")
async def api_status():
    try:
        info = rb.connect()
        return {"connected": True, **info}
    except Exception as exc:
        return {"connected": False, "error": str(exc)}

@app.get("/api/debug/thumbnail")
async def api_debug_thumbnail(clipName: str = ""):
    """Debug: inspect what GetThumbnailImage returns for a given clip."""
    try:
        resolve = rb.get_resolve()
        if not resolve:
            return {"error": "Resolve nicht verbunden"}
        project = resolve.GetProjectManager().GetCurrentProject()
        if not project:
            return {"error": "Kein Projekt"}

        def find_clip(folder, name):
            for c in (folder.GetClipList() or []):
                if not name or c.GetName() == name:
                    return c
            for sub in (folder.GetSubFolderList() or []):
                r = find_clip(sub, name)
                if r:
                    return r
            return None

        clip = find_clip(project.GetMediaPool().GetRootFolder(), clipName)
        if not clip:
            return {"error": f"Clip '{clipName}' nicht gefunden"}

        info = {
            "clipName": clip.GetName(),
            "hasGetThumbnailImage": hasattr(clip, "GetThumbnailImage"),
            "clipProperties": {},
        }
        # Try calling it
        if hasattr(clip, "GetThumbnailImage"):
            try:
                result = clip.GetThumbnailImage()
                info["result_type"] = type(result).__name__
                info["result_repr"] = repr(result)[:200]
                if isinstance(result, dict):
                    info["result_keys"] = list(result.keys())
                    if "data" in result:
                        info["data_len"] = len(result["data"])
            except Exception as e:
                info["call_error"] = str(e)
        else:
            info["note"] = "GetThumbnailImage existiert nicht auf diesem Objekt"
        # Get available clip props
        for prop in ["Type", "File Path", "Resolution", "FPS"]:
            try:
                info["clipProperties"][prop] = clip.GetClipProperty(prop)
            except Exception:
                pass
        return info
    except Exception as exc:
        return {"error": str(exc)}



@app.post("/api/connect")
async def api_connect():
    try:
        info = rb.connect()
        return {"ok": True, **info}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)

# ── Config ─────────────────────────────────────────────────────────
@app.get("/api/config")
async def api_get_config():
    return load_config()

class ConfigPayload(BaseModel):
    config: dict

@app.post("/api/config")
async def api_set_config(payload: ConfigPayload):
    save_config(payload.config)
    return {"ok": True}

# ── Templates ──────────────────────────────────────────────────────
@app.get("/api/templates")
async def api_templates():
    cfg = load_config()
    bin_name = cfg.get("binName", "Pesto Captions")
    try:
        templates = rb.scan_templates(bin_name)
        return {"ok": True, "templates": templates}
    except Exception as exc:
        diag = rb.list_all_bins()
        return JSONResponse(
            {"ok": False, "error": str(exc), "bins": diag},
            status_code=400,
        )

# ── Styles ─────────────────────────────────────────────────────────
@app.get("/api/styles")
async def api_get_styles():
    return {"styles": sm.list_styles()}

class SaveStylePayload(BaseModel):
    name: str
    clipName: str
    binName: str
    thumbnailB64: str = ""

@app.post("/api/styles")
async def api_save_style(payload: SaveStylePayload):
    try:
        path = sm.save_style(
            name=payload.name,
            clip_name=payload.clipName,
            bin_name=payload.binName,
            thumbnail_b64=payload.thumbnailB64,
        )
        return {"ok": True, "path": str(path)}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)

@app.delete("/api/styles/{style_id}")
async def api_delete_style(style_id: str):
    try:
        styles = sm.list_styles()
        for s in styles:
            if Path(s.get("path", "")).stem == style_id:
                sm.delete_style(s["path"])
                return {"ok": True}
        return JSONResponse({"ok": False, "error": "Stil nicht gefunden."}, status_code=404)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)

# ── Transcription ──────────────────────────────────────────────────
class TranscribePayload(BaseModel):
    engine: str = "native"
    language: str = "auto"
    modelSize: str = "small"

def _run_transcription(engine: str, language: str, model_size: str) -> None:
    try:
        broadcast_sync({"type": "transcribe_progress", "percent": 5,
                        "message": "Starte Transkription …"})
        if engine == "native":
            def prog(cur, total):
                pct = int(cur / max(total, 1) * 88) + 5
                broadcast_sync({"type": "transcribe_progress", "percent": pct,
                                "message": f"Verarbeite … {cur}/{total}"})
            result = rb.transcribe_native(language=language, progress_cb=prog)
        else:
            raise RuntimeError(
                "Whisper ist in dieser Version noch nicht verfügbar.\n"
                "Bitte nutze die native Resolve-Transkription."
            )
        broadcast_sync({
            "type": "transcribe_done",
            "wordTimingAvailable": result.get("wordTimingAvailable", False),
            "phrases": result.get("phrases", []),
        })
    except Exception as exc:
        broadcast_sync({"type": "transcribe_error", "message": str(exc)})

@app.post("/api/transcribe")
async def api_transcribe(payload: TranscribePayload, bg: BackgroundTasks):
    bg.add_task(_run_transcription, payload.engine, payload.language, payload.modelSize)
    return {"ok": True}

# ── Preview ────────────────────────────────────────────────────────
class PreviewPayload(BaseModel):
    clipName: str
    binName: str = "Pesto Captions"

@app.post("/api/preview")
async def api_preview(payload: PreviewPayload):
    """
    Return the Media Pool thumbnail for the given clip via GetThumbnailImage().
    No timeline manipulation — reads what Resolve already rendered in the Media Pool.
    """
    try:
        resolve = rb.get_resolve()
        if not resolve:
            return JSONResponse({"ok": False, "error": "Resolve nicht verbunden."}, status_code=400)
        project = resolve.GetProjectManager().GetCurrentProject()
        if not project:
            return JSONResponse({"ok": False, "error": "Kein Projekt geöffnet."}, status_code=400)

        def find_clip(folder, name):
            for c in (folder.GetClipList() or []):
                if c.GetName() == name:
                    return c
            for sub in (folder.GetSubFolderList() or []):
                r = find_clip(sub, name)
                if r:
                    return r
            return None

        clip = find_clip(project.GetMediaPool().GetRootFolder(), payload.clipName)
        if not clip:
            return JSONResponse({"ok": False,
                                 "error": f"Clip '{payload.clipName}' nicht gefunden."}, status_code=404)

        b64 = rb._get_media_pool_thumbnail(clip)
        if not b64:
            return JSONResponse({"ok": False,
                                 "error": "GetThumbnailImage() nicht verfügbar. "
                                          "Stelle sicher dass Resolve 18+ läuft und der Clip "
                                          "mindestens einmal im Media Pool geöffnet war."}, status_code=400)
        return {"ok": True, "imageB64": b64}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)


class ApplyPayload(BaseModel):
    cues: List[dict]
    templateClipName: str
    trackTarget: int = 0

def _run_apply(cues: list, template_clip_name: str, track_target: int) -> None:
    try:
        def prog(cur, total):
            broadcast_sync({"type": "apply_progress", "current": cur, "total": total})
        result = rb.apply_captions(cues, template_clip_name, track_target, progress_cb=prog)
        broadcast_sync({"type": "apply_done", "errors": result.get("errors", [])})
    except Exception as exc:
        broadcast_sync({"type": "apply_error", "message": str(exc)})

@app.post("/api/apply")
async def api_apply(payload: ApplyPayload, bg: BackgroundTasks):
    bg.add_task(_run_apply, payload.cues, payload.templateClipName, payload.trackTarget)
    return {"ok": True}

# ── WebSocket ──────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            await asyncio.sleep(30)          # keep-alive; ignore incoming frames
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
    except Exception:
        await ws_manager.disconnect(ws)

# ── Entry point ────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🌿 Pesto Captions startet …")
    print("   → http://localhost:7425")
    print("   Zum Beenden: Strg+C")
    uvicorn.run(app, host="127.0.0.1", port=7425, log_level="warning")
