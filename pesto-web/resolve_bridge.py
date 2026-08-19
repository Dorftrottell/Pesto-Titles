"""
Pesto Captions — DaVinci Resolve Bridge
AGPL-3.0

Wraps DaVinci Resolve's Scripting API.
Imported directly by the PySide6 app — no subprocess needed.
"""

import sys
import os
import json
import traceback
import base64
from typing import Optional

# ── Add Resolve Scripting API to path ──────────────────────────────
RESOLVE_SCRIPT_PATHS = [
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
    "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/Python39/lib/python3.9",
    r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    r"C:\Program Files\Blackmagic Design\DaVinci Resolve",
]
for p in RESOLVE_SCRIPT_PATHS:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)


# ── Connection ─────────────────────────────────────────────────────

def get_resolve():
    """Return the Resolve scripting object, or None."""
    try:
        import DaVinciResolveScript as dvr  # type: ignore
        return dvr.scriptapp("Resolve")
    except Exception:
        return None


def connect() -> dict:
    """
    Connect to running Resolve instance.
    Returns dict with project/timeline info, or raises RuntimeError.
    """
    resolve = get_resolve()
    if not resolve:
        raise RuntimeError(
            "DaVinci Resolve ist nicht erreichbar.\n\n"
            "Lösung:\n"
            "1. Öffne DaVinci Resolve\n"
            "2. Gehe zu: Preferences → System → General\n"
            "3. Aktiviere: 'External scripting using local network'\n"
            "4. Starte Resolve neu"
        )

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    if not project:
        raise RuntimeError("Kein Projekt in Resolve geöffnet.")

    timeline = project.GetCurrentTimeline()
    if not timeline:
        raise RuntimeError("Keine aktive Timeline in Resolve.")

    return {
        "projectName": project.GetName(),
        "timelineName": timeline.GetName(),
        "frameRate": float(timeline.GetSetting("timelineFrameRate") or 25),
        "startTimecode": timeline.GetStartTimecode() if hasattr(timeline, "GetStartTimecode") else "00:00:00:00",
        "videoTrackCount": timeline.GetTrackCount("video"),
        "audioTrackCount": timeline.GetTrackCount("audio"),
    }


# ── Template scanning ──────────────────────────────────────────────


def _all_roots(resolve, project, media_pool):
    """
    Yield all accessible folder roots in priority order.
    PowerBins are NOT in GetRootFolder() — they require special access.
    """
    # 1. Project-local media pool root (regular bins)
    root = media_pool.GetRootFolder()
    if root:
        yield root, "local"

    # 2. PowerBin root via GetPowerBinFolderByName / similar
    #    In Resolve 18+ the PowerBin root can sometimes be retrieved
    #    by temporarily switching the current folder context.
    #    We try: project.GetMediaPool().GetPowerBinFolder()
    try:
        pb_root = media_pool.GetPowerBinFolder()
        if pb_root:
            yield pb_root, "power"
    except Exception:
        pass

    # 3. Some versions expose it as a named attribute
    for attr in ("GetPowerBins", "GetPowerBinRoot"):
        try:
            fn = getattr(media_pool, attr, None)
            if callable(fn):
                result = fn()
                if result:
                    # Could be a list or a single folder
                    if isinstance(result, list):
                        for r in result:
                            yield r, "power"
                    else:
                        yield result, "power"
        except Exception:
            pass


def _search_folder(folder, bin_name: str):
    """Recursive case-insensitive search for a bin/folder by name."""
    try:
        name = folder.GetName()
    except Exception:
        return None

    if name.lower() == bin_name.lower():
        return folder

    try:
        subs = folder.GetSubFolderList() or []
    except Exception:
        return None

    for sub in subs:
        r = _search_folder(sub, bin_name)
        if r:
            return r
    return None


def list_all_bins() -> list:
    """Diagnostic: return names of all visible bins in the media pool."""
    resolve = get_resolve()
    if not resolve:
        return ["(Resolve nicht verbunden)"]
    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        return ["(Kein Projekt)"]
    media_pool = project.GetMediaPool()

    names = []

    def collect(folder, prefix=""):
        try:
            n = folder.GetName()
            names.append(f"{prefix}{n}")
            for sub in (folder.GetSubFolderList() or []):
                collect(sub, prefix + "  ")
        except Exception:
            pass

    try:
        collect(media_pool.GetRootFolder(), "[Local] ")
    except Exception:
        pass

    for attr in ("GetPowerBinFolder", "GetPowerBins"):
        try:
            fn = getattr(media_pool, attr, None)
            if callable(fn):
                result = fn()
                if result:
                    if isinstance(result, list):
                        for r in result:
                            collect(r, "[Power] ")
                    else:
                        collect(result, "[Power] ")
        except Exception:
            pass

    return names if names else ["(Keine Bins gefunden)"]


def _find_bin(media_pool, bin_name: str):
    """
    Find bin by name across all roots (local + PowerBins).
    Returns (folder, source_type) or (None, None).
    """
    resolve = get_resolve()
    project = resolve.GetProjectManager().GetCurrentProject() if resolve else None

    # Walk all available roots
    for root, source_type in _all_roots(resolve, project, media_pool):
        found = _search_folder(root, bin_name)
        if found:
            return found, source_type

    return None, None



def scan_templates(bin_name: str = "Pesto Captions") -> list:
    """
    Scan the Pesto Captions bin for templates.
    Returns list of dicts: {clipName, thumbnail, sourceBinType, nodeNameOk, fallbackNodeName}
    """
    resolve = get_resolve()
    if not resolve:
        raise RuntimeError("Resolve nicht verbunden.")

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        raise RuntimeError("Kein Projekt geöffnet.")

    media_pool = project.GetMediaPool()
    folder, bin_type = _find_bin(media_pool, bin_name)

    if not folder:
        # Auto-create the bin as a local bin in the root folder
        root = media_pool.GetRootFolder()
        try:
            folder = media_pool.AddSubFolder(root, bin_name)
            bin_type = "local"
            if not folder:
                raise RuntimeError("AddSubFolder lieferte None zurück.")
            # Signal to caller that bin was freshly created (empty)
            return [{"clipName": "__BIN_CREATED__", "thumbnail": None,
                     "sourceBinType": "local", "nodeNameOk": True, "fallbackNodeName": None}]
        except Exception as e:
            raise RuntimeError(
                f"Bin '{bin_name}' nicht gefunden und konnte auch nicht erstellt werden.\n\n"
                f"Fehler: {e}\n\n"
                "Wichtig: Die Resolve Scripting API hat keinen Zugriff auf Power Bins.\n"
                "Bitte lege den Bin manuell im Media Pool an (lokale Bins, nicht Power Bins)\n"
                "und ziehe deine Template-Clips dort hinein."
            )

    templates = []
    for clip in (folder.GetClipList() or []):
        name = clip.GetName()
        # Try to grab a real thumbnail via GrabStill; fall back to SVG placeholder
        thumb = _grab_template_thumbnail(clip, project) or _make_placeholder_thumbnail(name)
        templates.append({
            "clipName": name,
            "thumbnail": thumb,
            "sourceBinType": bin_type,
            "nodeNameOk": True,
            "fallbackNodeName": None,
        })

    return templates


def _grab_template_thumbnail(clip, project) -> Optional[str]:
    """
    Grab a real thumbnail from a Fusion Title / Text+ clip.

    Strategy (non-destructive):
    1. Get the current active timeline.
    2. Place the clip for 1 second on a very high video track (V20)
       at the very beginning (frame 0), so it doesn't overlap anything real.
    3. Move the playhead to frame 15 (half-second mark).
    4. Call GrabStill() → adds a still to the gallery.
    5. Export the still as PNG to a temp folder.
    6. Read the PNG, encode as base64.
    7. Delete the placed clip and the gallery still.
    """
    import tempfile, glob, time, pathlib

    try:
        timeline = project.GetCurrentTimeline()
        if not timeline:
            return None

        media_pool = project.GetMediaPool()
        frame_rate = float(timeline.GetSetting("timelineFrameRate") or 25)
        duration   = int(frame_rate)  # 1 second
        thumb_track = 20              # High track — won't interfere with real content

        # Ensure the track exists
        while timeline.GetTrackCount("video") < thumb_track:
            timeline.AddTrack("video")

        # Place clip at frame 0 on the thumb track
        clip_info = {
            "mediaPoolItem": clip,
            "startFrame": 0,
            "endFrame": duration - 1,
            "trackIndex": thumb_track,
            "recordFrame": 0,
        }
        added = media_pool.AppendToTimeline([clip_info])
        if not added:
            return None

        # Move playhead to frame 15 (mid-second) for a good frame
        mid_tc = _frames_to_tc(15, int(frame_rate))
        if hasattr(timeline, "SetCurrentTimecode"):
            timeline.SetCurrentTimecode(mid_tc)
        time.sleep(0.2)  # Let Resolve update the viewer

        # Grab still from gallery
        still = timeline.GrabStill()
        if not still:
            _remove_clip_at(timeline, thumb_track, 0)
            return None

        # Export still to temp dir
        with tempfile.TemporaryDirectory() as tmp:
            gallery = project.GetGallery()
            album   = gallery.GetCurrentStillAlbum()
            if not album:
                _remove_clip_at(timeline, thumb_track, 0)
                return None

            ok = album.ExportStills([still], tmp, "pesto_thumb", "PNG")
            time.sleep(0.5)  # Wait for file write

            pngs = sorted(pathlib.Path(tmp).glob("pesto_thumb*.png"))
            if not pngs:
                # Try without prefix filter
                pngs = sorted(pathlib.Path(tmp).glob("*.png"))

            thumb_b64 = None
            if pngs:
                thumb_b64 = base64.b64encode(pngs[0].read_bytes()).decode()

            # Clean up: delete still from gallery
            try:
                album.DeleteStills([still])
            except Exception:
                pass

        # Clean up: remove the clip we placed
        _remove_clip_at(timeline, thumb_track, 0)
        return thumb_b64

    except Exception:
        return None


def _frames_to_tc(frame: int, fps: int) -> str:
    h  = frame // (fps * 3600)
    m  = (frame % (fps * 3600)) // (fps * 60)
    s  = (frame % (fps * 60)) // fps
    f  = frame % fps
    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"


def _remove_clip_at(timeline, track_index: int, record_frame: int):
    """Remove the first clip found at `record_frame` on `track_index`."""
    try:
        items = timeline.GetItemListInTrack("video", track_index) or []
        for item in items:
            if abs(item.GetStart() - record_frame) < 5:
                timeline.DeleteClips([item])
                break
    except Exception:
        pass



def _make_placeholder_thumbnail(name: str) -> str:
    """Generate a base64-encoded SVG thumbnail with the clip name."""

    # Truncate long names for the thumbnail
    display = name[:18] + "…" if len(name) > 18 else name
    # Escape XML special chars
    for ch, esc in (("&", "&amp;"), ("<", "&lt;"), (">", "&gt;"), ('"', "&quot;")):
        display = display.replace(ch, esc)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
  <rect width="320" height="180" rx="8" fill="#1e2a1e"/>
  <rect x="2" y="2" width="316" height="176" rx="7" fill="none" stroke="#2e4a2e" stroke-width="2"/>
  <text x="160" y="82" font-family="system-ui,sans-serif" font-size="13"
        fill="#4ade80" text-anchor="middle" opacity="0.6">Text+</text>
  <text x="160" y="108" font-family="system-ui,sans-serif" font-size="14"
        fill="#e2e8e2" text-anchor="middle" font-weight="600">{display}</text>
</svg>'''
    return base64.b64encode(svg.encode()).decode()


# ── Native transcription ───────────────────────────────────────────

def transcribe_native(language: str = "auto", progress_cb=None) -> dict:
    """
    Use Resolve's built-in CreateSubtitlesFromAudio.
    Returns {wordTimingAvailable, phrases}
    """
    resolve = get_resolve()
    if not resolve:
        raise RuntimeError("Resolve nicht verbunden.")

    project = resolve.GetProjectManager().GetCurrentProject()
    timeline = project.GetCurrentTimeline() if project else None
    if not timeline:
        raise RuntimeError("Keine aktive Timeline.")

    if not hasattr(timeline, "CreateSubtitlesFromAudio"):
        raise RuntimeError(
            "Diese Resolve-Version unterstützt 'CreateSubtitlesFromAudio' nicht über die API.\n"
            "Bitte nutze Whisper als Alternative oder importiere eine SRT-Datei."
        )

    if progress_cb:
        progress_cb(10, 100)

    settings = {}
    if language != "auto":
        settings["language"] = language

    result = timeline.CreateSubtitlesFromAudio(settings if settings else {})
    if not result:
        raise RuntimeError(
            "Resolve-Transkription fehlgeschlagen.\n"
            "Stelle sicher, dass die Timeline Audio enthält\n"
            "und das Sprachmodell in Resolve installiert ist."
        )

    if progress_cb:
        progress_cb(70, 100)

    # Read back subtitle track
    phrases = []
    try:
        frame_rate = float(timeline.GetSetting("timelineFrameRate") or 25)
        track_count = timeline.GetTrackCount("subtitle")
        if track_count > 0:
            items = timeline.GetItemListInTrack("subtitle", 1)
            for item in (items or []):
                phrases.append({
                    "text": item.GetName(),
                    "start": item.GetStart() / frame_rate,
                    "end": item.GetEnd() / frame_rate,
                })
    except Exception:
        pass

    if progress_cb:
        progress_cb(100, 100)

    return {"wordTimingAvailable": False, "phrases": phrases}


# ── Apply captions ─────────────────────────────────────────────────

def apply_captions(cues: list, template_clip_name: str, track_target: int = 0,
                   progress_cb=None) -> dict:
    """
    Apply caption cues to timeline using the chosen template clip.
    Returns {success, errors}
    """
    resolve = get_resolve()
    if not resolve:
        raise RuntimeError("Resolve nicht verbunden.")

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        raise RuntimeError("Kein Projekt geöffnet.")

    timeline = project.GetCurrentTimeline()
    if not timeline:
        raise RuntimeError("Keine aktive Timeline.")

    media_pool = project.GetMediaPool()
    frame_rate = float(timeline.GetSetting("timelineFrameRate") or 25)

    # Find template clip
    def find_clip(folder, name):
        for c in (folder.GetClipList() or []):
            if c.GetName() == name:
                return c
        for sub in (folder.GetSubFolderList() or []):
            r = find_clip(sub, name)
            if r:
                return r
        return None

    template_clip = find_clip(media_pool.GetRootFolder(), template_clip_name)
    if not template_clip:
        raise RuntimeError(
            f"Template-Clip '{template_clip_name}' nicht im Media Pool gefunden.\n"
            "Stelle sicher, dass der Clip im Pesto Captions Bin liegt."
        )

    # Ensure target track exists
    video_track_count = timeline.GetTrackCount("video")
    target_track = track_target if track_target > 0 else video_track_count + 1
    while timeline.GetTrackCount("video") < target_track:
        timeline.AddTrack("video")

    errors = []
    total = len(cues)

    for i, cue in enumerate(cues):
        if progress_cb:
            progress_cb(i, total)
        try:
            start_frame = int(round(cue["startSec"] * frame_rate))
            end_frame = int(round(cue["endSec"] * frame_rate))
            duration = max(1, end_frame - start_frame)

            clip_info = {
                "mediaPoolItem": template_clip,
                "startFrame": 0,
                "endFrame": duration - 1,
                "trackIndex": target_track,
                "recordFrame": start_frame,
            }
            added = media_pool.AppendToTimeline([clip_info])
            if not added:
                errors.append(f"Cue {cue['cueIndex']}: Konnte nicht zur Timeline hinzugefügt werden.")
                continue

            # Find the placed clip
            items = timeline.GetItemListInTrack("video", target_track)
            new_item = None
            for item in (items or []):
                if abs(item.GetStart() - start_frame) < 3:
                    new_item = item
                    break

            if not new_item:
                errors.append(f"Cue {cue['cueIndex']}: Clip auf Timeline nicht gefunden.")
                continue

            # Set text in PestoText node
            fusion_comp = new_item.GetFusionCompByIndex(1) if hasattr(new_item, "GetFusionCompByIndex") else None
            if not fusion_comp:
                errors.append(f"Cue {cue['cueIndex']}: Keine Fusion-Komposition.")
                continue

            # Find PestoText node
            text_node = fusion_comp.FindTool("PestoText")
            if not text_node:
                tools = fusion_comp.GetToolList(False, "TextPlus")
                if tools:
                    text_node = list(tools.values())[0]

            if not text_node:
                errors.append(f"Cue {cue['cueIndex']}: Kein Text+-Node gefunden.")
                continue

            plain_text = "".join(r["text"] for r in cue.get("runs", [{"text": cue.get("text", "")}]))
            try:
                text_node.SetInput("StyledText", plain_text)
            except Exception:
                try:
                    text_node.SetInput("Text", plain_text)
                except Exception as e:
                    errors.append(f"Cue {cue['cueIndex']}: Text setzen fehlgeschlagen: {e}")

        except Exception as e:
            errors.append(f"Cue {cue['cueIndex']}: {e}")

    if progress_cb:
        progress_cb(total, total)

    return {"success": True, "errors": errors}


# ── Render presets ─────────────────────────────────────────────────


# ── Navigation ─────────────────────────────────────────────────────

def navigate_to_timecode(sec: float):
    """Move Resolve's playhead to the given position (in seconds)."""
    resolve = get_resolve()
    if not resolve:
        return
    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        return
    timeline = project.GetCurrentTimeline()
    if not timeline:
        return

    frame_rate = float(timeline.GetSetting("timelineFrameRate") or 25)
    frame = int(round(sec * frame_rate))

    # Convert frame to SMPTE timecode string
    h = frame // (int(frame_rate) * 3600)
    m = (frame % (int(frame_rate) * 3600)) // (int(frame_rate) * 60)
    s = (frame % (int(frame_rate) * 60)) // int(frame_rate)
    f = frame % int(frame_rate)
    tc = f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"

    try:
        if hasattr(timeline, "SetCurrentTimecode"):
            timeline.SetCurrentTimecode(tc)
    except Exception:
        pass  # Not critical if navigation fails


# ── Render presets ─────────────────────────────────────────────────

def list_presets() -> list:

    resolve = get_resolve()
    if not resolve:
        return []
    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        return []
    try:
        return list(project.GetRenderPresetList() or [])
    except Exception:
        return []


def start_render(preset_name: str):
    resolve = get_resolve()
    if not resolve:
        raise RuntimeError("Resolve nicht verbunden.")
    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        raise RuntimeError("Kein Projekt geöffnet.")
    project.LoadRenderPreset(preset_name)
    project.AddRenderJob()
    project.StartRendering()
