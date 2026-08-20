#!/usr/bin/env python3
"""
pesto_set_text.py — Resolve Scripting API helper
Setzt Text in Fusion TextPlus-Nodes via regulärer Scripting API
(die WI API hat keinen Zugriff auf Fusion-Node-Internals).

Aufruf: python3 pesto_set_text.py <cues_json_path>
JSON: { "trackIndex": 3, "fps": 25.0,
        "cues": [{"startSec": 0.0, "endSec": 1.5, "text": "..."}, ...] }
"""

import sys, json, os

def find_resolve():
    # Scripting-Module-Pfade
    for d in [
        "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
        os.path.expanduser("~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"),
    ]:
        if os.path.isdir(d) and d not in sys.path:
            sys.path.insert(0, d)

    # fusionscript.so laden (notwendig für Scripting-API)
    for so in [
        "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so",
        "/Applications/DaVinci Resolve Studio/DaVinci Resolve Studio.app/Contents/Libraries/Fusion/fusionscript.so",
    ]:
        if os.path.exists(so):
            import importlib.util
            spec = importlib.util.spec_from_file_location("fusionscript", so)
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            sys.modules["fusionscript"] = m
            break

    try:
        import DaVinciResolveScript as dvr
        return dvr.scriptapp("Resolve")
    except Exception:
        pass
    try:
        import fusionscript as dvr
        return dvr.scriptapp("Resolve")
    except Exception:
        return None

def find_text_node(comp):
    try:
        n = comp.FindTool("PestoText")
        if n: return n
    except Exception: pass
    try:
        tools = comp.GetToolList(False, "TextPlus")
        if tools:
            for n in tools.values(): return n
    except Exception: pass
    return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Kein JSON-Pfad"})); sys.exit(1)
    try:
        with open(sys.argv[1], encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)})); sys.exit(1)

    track_index = data.get("trackIndex", 1)
    fps = float(data.get("fps", 25.0))
    cues = data.get("cues", [])

    resolve = find_resolve()
    if not resolve:
        print(json.dumps({"ok": False, "error": "Resolve Scripting API nicht verfügbar"}))
        sys.exit(1)

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        print(json.dumps({"ok": False, "error": "Kein Projekt"})); sys.exit(1)
    timeline = project.GetCurrentTimeline()
    if not timeline:
        print(json.dumps({"ok": False, "error": "Keine Timeline"})); sys.exit(1)

    raw_items = timeline.GetItemListInTrack("video", track_index)
    item_list = list(raw_items.values()) if isinstance(raw_items, dict) else list(raw_items or [])

    errors = []
    matched = 0
    for cue in cues:
        start_frame = round(cue["startSec"] * fps)
        text = cue.get("text", "")
        found = next((it for it in item_list if abs(it.GetStart() - start_frame) < 3), None)
        if not found:
            errors.append(f"Kein Item @ frame {start_frame}"); continue
        try:
            comp = found.GetFusionCompByIndex(1)
            node = find_text_node(comp) if comp else None
            if not node:
                errors.append(f"Kein TextPlus-Node @ frame {start_frame}"); continue
            ok = False
            for inp in ("StyledText", "Text"):
                try: node.SetInput(inp, text); ok = True; break
                except Exception: pass
            if ok: matched += 1
            else: errors.append(f"SetInput failed @ frame {start_frame}")
        except Exception as e:
            errors.append(f"frame {start_frame}: {e}")

    print(json.dumps({"ok": True, "matched": matched, "errors": errors}))

if __name__ == "__main__":
    main()
