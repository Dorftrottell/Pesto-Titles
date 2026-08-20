#!/usr/bin/env python3
"""
Pesto Captions — DaVinci Resolve Bridge Script
AGPL-3.0 License

Communicates with the Electron main process via JSON over stdin/stdout.
Each message is a single-line JSON object terminated by newline.

Commands:
  connect              → return project/timeline info
  templates_scan       → find Pesto Captions bin (PowerBin > local)
  captions_apply       → apply cue list to timeline
  transcribe_native    → run Resolve's built-in subtitle function
  transcribe_whisper   → run whisper.cpp (if binary available)
  presets_list         → list render presets
  render_start         → start render queue
"""

import sys
import os
import json
import traceback
import base64
import tempfile
import time

# ─── DaVinci Resolve API setup ─────────────────────────────────────────────────

RESOLVE_SCRIPT_PATHS = [
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
    "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/Python39/lib/python3.9",
    # Windows
    r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    r"C:\Program Files\Blackmagic Design\DaVinci Resolve",
]

for p in RESOLVE_SCRIPT_PATHS:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

def get_resolve():
    """Import and return the DaVinci Resolve scripting object, or None."""
    try:
        import DaVinciResolveScript as dvr  # type: ignore
        return dvr.scriptapp("Resolve")
    except ImportError:
        return None
    except Exception:
        return None


# ─── Output helpers ────────────────────────────────────────────────────────────

def send(obj: dict):
    """Write a JSON response line to stdout."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

def send_progress(cmd_id: str, current: int, total: int):
    send({"id": cmd_id, "ok": True, "progress": {"current": current, "total": total}})

def send_result(cmd_id: str, data):
    send({"id": cmd_id, "ok": True, "data": data})

def send_error(cmd_id: str, msg: str):
    send({"id": cmd_id, "ok": False, "error": msg})


# ─── Resolve helpers ───────────────────────────────────────────────────────────

def get_timeline_info(resolve):
    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        return None, "No project is open."
    timeline = project.GetCurrentTimeline()
    if not timeline:
        return None, "No timeline is active."
    return {
        "projectName": project.GetName(),
        "timelineName": timeline.GetName(),
        "frameRate": timeline.GetSetting("timelineFrameRate"),
        "startTimecode": timeline.GetStartTimecode() if hasattr(timeline, "GetStartTimecode") else "00:00:00:00",
        "videoTrackCount": timeline.GetTrackCount("video"),
        "audioTrackCount": timeline.GetTrackCount("audio"),
    }, None


def find_pesto_bin(project, bin_name: str):
    """
    Search for bin_name:
    1. PowerBins (Studio, project-wide)
    2. Current project's Media Pool (recursive)
    Returns (bin_obj, bin_type) or (None, None)
    """
    media_pool = project.GetMediaPool()

    # Try PowerBins (Studio only)
    try:
        power_bins = media_pool.GetRootFolder().GetSubFolderList()
        # In Studio, power bins appear as a special type — check by name
        # The actual API varies by Resolve version; we scan all top-level folders
        # that have the "power" attribute
        pb_folder = media_pool.GetCurrentFolder()  # placeholder; real PowerBin API below
        # Attempt Studio PowerBin API
        if hasattr(media_pool, "GetPowerBins"):
            for pb in media_pool.GetPowerBins():
                if pb.GetName() == bin_name:
                    return pb, "power"
    except Exception:
        pass

    # Fallback: search project Media Pool recursively
    def search_folder(folder):
        if folder.GetName() == bin_name:
            return folder
        for sub in folder.GetSubFolderList():
            result = search_folder(sub)
            if result:
                return result
        return None

    root = media_pool.GetRootFolder()
    found = search_folder(root)
    if found:
        return found, "local"

    return None, None


def ensure_pesto_bin(project, bin_name: str):
    """
    Return the bin *bin_name*, creating it as a local Media Pool sub-folder
    if it does not yet exist.  Returns (folder, created: bool).
    Raises RuntimeError if creation fails.
    """
    folder, _ = find_pesto_bin(project, bin_name)
    if folder:
        return folder, False

    media_pool = project.GetMediaPool()
    root = media_pool.GetRootFolder()
    try:
        new_folder = media_pool.AddSubFolder(root, bin_name)
    except Exception as e:
        raise RuntimeError(f"Could not create bin '{bin_name}': {e}")
    if not new_folder:
        raise RuntimeError(
            f"AddSubFolder returned None for bin '{bin_name}'. "
            "Make sure Resolve is in an editable state (not rendering)."
        )
    return new_folder, True


def get_clip_thumbnail_b64(clip) -> str | None:
    """Get thumbnail as base64 PNG string, or None."""
    try:
        # Resolve API: GetThumbnail is not universally available; return None gracefully
        if hasattr(clip, "GetThumbnail"):
            thumb = clip.GetThumbnail()
            if thumb:
                return base64.b64encode(thumb).decode("ascii")
    except Exception:
        pass
    return None


def has_text_plus_content(clip) -> bool:
    """Check if a clip is a Fusion Title (Text+) type."""
    try:
        clip_type = clip.GetClipProperty("Type")
        # Fusion Title shows as "Fusion Title" in Media Pool
        if clip_type and "fusion" in clip_type.lower():
            return True
        # Also check by name conventions (fallback)
        return True  # We include all clips; the apply step will fail gracefully if not Text+
    except Exception:
        return True


def find_pesto_text_node(fusion_comp):
    """
    Find the PestoText node in a Fusion composition.
    Returns (node, node_name, is_fallback).
    """
    # Try exact name first
    pesto_node = fusion_comp.FindTool("PestoText")
    if pesto_node:
        return pesto_node, "PestoText", False

    # Fallback: find first Text+ node
    tools = fusion_comp.GetToolList(False, "TextPlus")
    if tools:
        first_key = list(tools.keys())[0]
        node = tools[first_key]
        return node, node.GetAttrs()["TOOLS_Name"], True

    return None, None, False


# ─── Command handlers ──────────────────────────────────────────────────────────

def cmd_connect(cmd_id: str, params: dict):
    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id,
            "DaVinci Resolve is not running or the Scripting API is not accessible.\n\n"
            "Fix: In Resolve, go to Preferences → System → General and enable "
            "'External scripting using local network'. Then restart Resolve.")
        return

    info, err = get_timeline_info(resolve)
    if err:
        send_error(cmd_id, err)
    else:
        send_result(cmd_id, info)


def cmd_templates_scan(cmd_id: str, params: dict):
    bin_name = params.get("binName", "Pesto Captions")
    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id, "Resolve not connected.")
        return

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        send_error(cmd_id, "No project is open.")
        return

    # Auto-create the bin if it doesn't exist yet
    try:
        folder, bin_created = ensure_pesto_bin(project, bin_name)
    except RuntimeError as e:
        send_error(cmd_id, str(e))
        return

    if bin_created:
        # Bin was just created — it's empty; tell the UI so it can show a hint
        send_result(cmd_id, {"templates": [], "binCreated": True})
        return

    clips = folder.GetClipList()
    templates = []
    for clip in (clips or []):
        if not has_text_plus_content(clip):
            continue
        clip_name = clip.GetName()
        thumb = get_clip_thumbnail_b64(clip)
        templates.append({
            "clipName": clip_name,
            "thumbnail": thumb,
            "sourceBinType": "local",
        })

    send_result(cmd_id, {"templates": templates, "binCreated": False})


def cmd_transcribe_native(cmd_id: str, params: dict):
    """Use Resolve's built-in 'Create Subtitles from Audio'."""
    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id, "Resolve not connected.")
        return

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        send_error(cmd_id, "No project open.")
        return

    timeline = project.GetCurrentTimeline()
    if not timeline:
        send_error(cmd_id, "No active timeline.")
        return

    try:
        send_progress(cmd_id, 0, 100)

        # Resolve Studio API: CreateSubtitlesFromAudio
        # Returns True/False; subtitles appear on the timeline subtitle track
        language = params.get("language", "auto")
        result = False
        if hasattr(timeline, "CreateSubtitlesFromAudio"):
            settings = {}
            if language != "auto":
                settings["language"] = language
            result = timeline.CreateSubtitlesFromAudio(settings if settings else {})
        else:
            send_error(cmd_id,
                "This version of DaVinci Resolve does not support CreateSubtitlesFromAudio via API. "
                "Please use Whisper as the transcription engine instead.")
            return

        send_progress(cmd_id, 50, 100)

        if not result:
            send_error(cmd_id, "Resolve's native transcription returned an error. "
                "Make sure the timeline has audio and the language model is installed in Resolve.")
            return

        # Read back the created subtitle track items
        subtitle_track_items = []
        try:
            track_count = timeline.GetTrackCount("subtitle")
            if track_count > 0:
                items = timeline.GetItemListInTrack("subtitle", 1)
                if items:
                    frame_rate = float(timeline.GetSetting("timelineFrameRate") or 25)
                    for item in items:
                        start_frame = item.GetStart()
                        end_frame = item.GetEnd()
                        text = item.GetName()
                        subtitle_track_items.append({
                            "text": text,
                            "start": start_frame / frame_rate,
                            "end": end_frame / frame_rate,
                        })
        except Exception as e:
            pass  # Subtitle reading may not be available; still report success

        send_progress(cmd_id, 100, 100)

        # We cannot guarantee word-level timing from native transcription
        send_result(cmd_id, {
            "wordTimingAvailable": False,
            "phrases": subtitle_track_items,
        })

    except Exception as e:
        send_error(cmd_id, f"Native transcription error: {str(e)}\n{traceback.format_exc()}")


def cmd_transcribe_whisper(cmd_id: str, params: dict):
    """Run whisper.cpp binary (if available)."""
    import shutil
    import subprocess

    model_size = params.get("modelSize", "small")
    language = params.get("language", "auto")

    # Check for whisper binary
    whisper_bin = shutil.which("whisper") or shutil.which("whisper-cpp") or shutil.which("main")
    if not whisper_bin:
        # Check in app resources
        resource_whisper = os.path.join(os.path.dirname(__file__), "..", "resources", "whisper", "main")
        if os.path.exists(resource_whisper):
            whisper_bin = resource_whisper

    if not whisper_bin:
        send_error(cmd_id,
            "Whisper binary not found.\n\n"
            "Whisper (whisper.cpp) is not yet bundled with this version of Pesto Captions. "
            "You can:\n"
            "1. Use the native Resolve transcription engine instead.\n"
            "2. Install whisper.cpp manually and ensure the 'main' binary is on your PATH.\n"
            "3. Import an existing .srt or .vtt file.")
        return

    # Find model file
    model_dir = os.path.join(os.path.expanduser("~"), ".pesto-captions", "models")
    model_path = os.path.join(model_dir, f"ggml-{model_size}.en.bin")
    model_path_multi = os.path.join(model_dir, f"ggml-{model_size}.bin")

    if not os.path.exists(model_path) and not os.path.exists(model_path_multi):
        send_error(cmd_id,
            f"Whisper model '{model_size}' not found at {model_dir}.\n\n"
            f"Download it from: https://huggingface.co/ggerganov/whisper.cpp\n"
            f"Place the file at: {model_path_multi}")
        return

    actual_model = model_path if os.path.exists(model_path) else model_path_multi

    # Extract audio from current timeline using Resolve API
    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id, "Resolve not connected.")
        return

    project = resolve.GetProjectManager().GetCurrentProject()
    timeline = project.GetCurrentTimeline() if project else None
    if not timeline:
        send_error(cmd_id, "No active timeline.")
        return

    # Export audio to temp WAV (16kHz mono, as whisper.cpp expects)
    send_progress(cmd_id, 5, 100)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        audio_path = f.name

    try:
        # Use Resolve export to get WAV
        export_settings = {
            "SelectAllFrames": True,
            "ExportVideo": False,
            "ExportAudio": True,
            "AudioCodec": "LinearPCM",
            "AudioSampleRate": 16000,
            "AudioBitDepth": 16,
            "AudioChannels": 1,
        }
        media_pool = project.GetMediaPool()
        # timeline.Export is not universally available; try render queue approach
        # For now, attempt the Deliver Page approach via scripting
        project.LoadRenderPreset("H.264 Master")  # Temporary
        project.SetRenderSettings({
            "SelectAllFrames": True,
            "ExportVideo": False,
            "ExportAudio": True,
            "AudioCodec": "LinearPCM",
            "AudioSampleRate": 16000,
            "TargetDir": os.path.dirname(audio_path),
            "CustomName": os.path.basename(audio_path).replace(".wav", ""),
        })
        project.AddRenderJob()
        project.StartRendering()
        # Wait for render
        for i in range(60):
            time.sleep(1)
            if not project.IsRenderingInProgress():
                break
            send_progress(cmd_id, 5 + i, 100)

        if not os.path.exists(audio_path):
            send_error(cmd_id, "Audio extraction failed. Please use the native engine or import an SRT file.")
            return

        send_progress(cmd_id, 40, 100)

        # Run whisper.cpp
        cmd = [
            whisper_bin,
            "-m", actual_model,
            "-f", audio_path,
            "--output-json",
            "--word-timestamps", "1",
        ]
        if language != "auto":
            cmd.extend(["-l", language])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        send_progress(cmd_id, 90, 100)

        if result.returncode != 0:
            send_error(cmd_id, f"Whisper failed: {result.stderr}")
            return

        # Parse JSON output
        output_json_path = audio_path + ".json"
        if os.path.exists(output_json_path):
            with open(output_json_path) as jf:
                whisper_out = json.load(jf)
            words = []
            for segment in whisper_out.get("segments", []):
                for w in segment.get("words", []):
                    words.append({
                        "word": w.get("word", "").strip(),
                        "start": w.get("start", 0),
                        "end": w.get("end", 0),
                        "confidence": w.get("probability", 1.0),
                    })
            send_progress(cmd_id, 100, 100)
            send_result(cmd_id, {"wordTimingAvailable": True, "words": words})
        else:
            send_error(cmd_id, "Whisper did not produce JSON output.")

    except Exception as e:
        send_error(cmd_id, f"Whisper transcription error: {str(e)}")
    finally:
        try:
            os.unlink(audio_path)
        except Exception:
            pass


def cmd_captions_apply(cmd_id: str, params: dict):
    """Read cue-list JSON and apply captions to the Resolve timeline."""
    cue_list_path = params.get("cueListPath", "")
    template_clip_name = params.get("templateClipName", "")
    track_target = params.get("trackTarget", 0)

    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id, "Resolve not connected.")
        return

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        send_error(cmd_id, "No project open.")
        return

    timeline = project.GetCurrentTimeline()
    if not timeline:
        send_error(cmd_id, "No active timeline.")
        return

    # Load cue list
    if not os.path.exists(cue_list_path):
        send_error(cmd_id, f"Cue list file not found: {cue_list_path}")
        return

    with open(cue_list_path) as f:
        cue_list = json.load(f)

    cues = cue_list.get("cues", [])
    word_timing_available = cue_list.get("wordTimingAvailable", False)
    total = len(cues)

    # Find template clip in Pesto Captions bin
    media_pool = project.GetMediaPool()
    template_clip = None

    def find_clip_in_folder(folder, name):
        for clip in (folder.GetClipList() or []):
            if clip.GetName() == name:
                return clip
        for sub in (folder.GetSubFolderList() or []):
            found = find_clip_in_folder(sub, name)
            if found:
                return found
        return None

    template_clip = find_clip_in_folder(media_pool.GetRootFolder(), template_clip_name)
    if not template_clip:
        send_error(cmd_id,
            f"Template clip '{template_clip_name}' not found in Media Pool. "
            "Make sure the template clip exists somewhere in your Media Pool.")
        return

    # Ensure the Pesto bin exists and place the template clip there
    bin_name = params.get("binName", "Pesto Captions")
    bin_created = False
    clip_placed_in_bin = False
    try:
        pesto_bin, bin_created = ensure_pesto_bin(project, bin_name)
        if pesto_bin:
            already_there = any(
                c.GetName() == template_clip_name
                for c in (pesto_bin.GetClipList() or [])
            )
            if not already_there:
                try:
                    media_pool.MoveClips([template_clip], pesto_bin)
                    clip_placed_in_bin = True
                    # Re-fetch after move so AppendToTimeline works correctly
                    template_clip = find_clip_in_folder(
                        media_pool.GetRootFolder(), template_clip_name
                    ) or template_clip
                except Exception:
                    pass  # Non-critical; apply continues regardless
    except RuntimeError:
        pass  # Bin creation failed — not critical for the apply step

    # Determine target video track (add new track if needed)
    frame_rate = float(timeline.GetSetting("timelineFrameRate") or 25)
    video_track_count = timeline.GetTrackCount("video")
    target_track = track_target if track_target > 0 else video_track_count + 1

    # Ensure track exists
    while timeline.GetTrackCount("video") < target_track:
        timeline.AddTrack("video")

    errors = []
    for i, cue in enumerate(cues):
        send_progress(cmd_id, i, total)
        try:
            start_frame = int(round(cue["startSec"] * frame_rate))
            end_frame = int(round(cue["endSec"] * frame_rate))
            duration_frames = max(1, end_frame - start_frame)

            # Add clip to timeline at the target track
            clip_info = {
                "mediaPoolItem": template_clip,
                "startFrame": 0,
                "endFrame": duration_frames - 1,
                "trackIndex": target_track,
                "recordFrame": start_frame,
            }

            added = media_pool.AppendToTimeline([clip_info])
            if not added:
                errors.append(f"Cue {cue['cueIndex']}: Could not add to timeline.")
                continue

            # Get the newly added clip on the timeline
            items = timeline.GetItemListInTrack("video", target_track)
            new_item = None
            for item in (items or []):
                if abs(item.GetStart() - start_frame) < 2:
                    new_item = item
                    break

            if not new_item:
                errors.append(f"Cue {cue['cueIndex']}: Could not locate added clip on timeline.")
                continue

            # Open Fusion composition and set text
            fusion_comp = new_item.GetFusionCompByIndex(1) if hasattr(new_item, "GetFusionCompByIndex") else None
            if not fusion_comp:
                errors.append(f"Cue {cue['cueIndex']}: No Fusion composition found in clip.")
                continue

            text_node, node_name, is_fallback = find_pesto_text_node(fusion_comp)
            if not text_node:
                errors.append(f"Cue {cue['cueIndex']}: No Text+ node found in template '{template_clip_name}'.")
                continue

            # Build styled text — each run with emphasis is set as a separate styled run
            runs = cue.get("runs", [])
            plain_text = "".join(r["text"] for r in runs)

            # Set the text content
            # In Resolve's Fusion Python API, we set the styled text input
            try:
                if hasattr(text_node, "SetInput"):
                    text_node.SetInput("StyledText", plain_text)
                elif hasattr(text_node, "StyledText"):
                    text_node.StyledText[fusion_comp.TIME_UNDEFINED] = plain_text
            except Exception as e:
                # Try alternate input name
                try:
                    text_node.SetInput("Text", plain_text)
                except Exception:
                    errors.append(f"Cue {cue['cueIndex']}: Could not set text ({e}). Node: {node_name}")

        except Exception as e:
            errors.append(f"Cue {cue['cueIndex']}: {str(e)}")

    send_progress(cmd_id, total, total)

    if errors:
        # Partial success
        send_result(cmd_id, {
            "success": True,
            "partial": True,
            "errors": errors[:10],
            "binCreated": bin_created,
            "clipPlacedInBin": clip_placed_in_bin,
        })
    else:
        send_result(cmd_id, {
            "success": True,
            "partial": False,
            "binCreated": bin_created,
            "clipPlacedInBin": clip_placed_in_bin,
        })


def cmd_presets_list(cmd_id: str, params: dict):
    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id, "Resolve not connected.")
        return

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        send_error(cmd_id, "No project open.")
        return

    try:
        presets = project.GetRenderPresetList()
        send_result(cmd_id, [{"name": p} for p in (presets or [])])
    except Exception as e:
        send_error(cmd_id, f"Could not read presets: {str(e)}")


def cmd_render_start(cmd_id: str, params: dict):
    preset_name = params.get("presetName", "")
    resolve = get_resolve()
    if not resolve:
        send_error(cmd_id, "Resolve not connected.")
        return

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        send_error(cmd_id, "No project open.")
        return

    try:
        project.LoadRenderPreset(preset_name)
        project.AddRenderJob()
        project.StartRendering()
        send_result(cmd_id, {"started": True})
    except Exception as e:
        send_error(cmd_id, f"Could not start render: {str(e)}")


# ─── Command dispatcher ────────────────────────────────────────────────────────

COMMANDS = {
    "connect": cmd_connect,
    "templates_scan": cmd_templates_scan,
    "transcribe_native": cmd_transcribe_native,
    "transcribe_whisper": cmd_transcribe_whisper,
    "captions_apply": cmd_captions_apply,
    "presets_list": cmd_presets_list,
    "render_start": cmd_render_start,
}


# ─── Main loop ────────────────────────────────────────────────────────────────

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            sys.stderr.write(f"[bridge] Invalid JSON: {line}\n")
            sys.stderr.flush()
            continue

        cmd_id = msg.get("id", "unknown")
        cmd = msg.get("cmd", "")
        params = msg.get("params") or {}

        handler = COMMANDS.get(cmd)
        if not handler:
            send_error(cmd_id, f"Unknown command: {cmd}")
            continue

        try:
            handler(cmd_id, params)
        except Exception as e:
            send_error(cmd_id, f"Unhandled error in '{cmd}': {str(e)}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
