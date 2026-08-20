--[[
  pesto_set_text.lua — Resolve Fusion Scripting Helper
  Setzt Text in Fusion TextPlus-Nodes der platzierten Timeline-Items.

  Aufruf via fuscript:
    fuscript pesto_set_text.lua /path/to/cues.json

  JSON-Format: { "trackIndex": 3, "fps": 25.0,
                 "cues": [{"startSec": 0.0, "text": "..."}, ...] }
]]

-- ── JSON-Datei lesen ────────────────────────────────────────────────
local json_path = arg and arg[1]
if not json_path then
  print('{"ok":false,"error":"Kein JSON-Pfad angegeben"}')
  os.exit(1)
end

local fh = io.open(json_path, 'r')
if not fh then
  print('{"ok":false,"error":"JSON-Datei nicht lesbar: ' .. json_path .. '"}')
  os.exit(1)
end
local content = fh:read('*all')
fh:close()

-- bmd.fromjson ist in Fusion/Resolve Lua verfügbar
local ok_parse, data = pcall(bmd.fromjson, content)
if not ok_parse or not data then
  print('{"ok":false,"error":"JSON-Parse-Fehler"}')
  os.exit(1)
end

local track_index = data.trackIndex or 1
local fps         = tonumber(data.fps) or 25.0
local cues        = data.cues or {}

-- ── Resolve verbinden ───────────────────────────────────────────────
local resolve = bmd.scriptapp("Resolve")
if not resolve then
  print('{"ok":false,"error":"Resolve Scripting API nicht verfügbar"}')
  os.exit(1)
end

local project = resolve:GetProjectManager():GetCurrentProject()
if not project then
  print('{"ok":false,"error":"Kein Projekt geöffnet"}')
  os.exit(1)
end

local timeline = project:GetCurrentTimeline()
if not timeline then
  print('{"ok":false,"error":"Keine Timeline geöffnet"}')
  os.exit(1)
end

-- GetItemListInTrack gibt eine Lua-Tabelle zurück { [1]=item, [2]=item, ... }
local items = timeline:GetItemListInTrack("video", track_index)
if not items then
  print('{"ok":false,"error":"Keine Items auf Track ' .. track_index .. '"}')
  os.exit(1)
end

-- ── Text pro Cue setzen ────────────────────────────────────────────
local errors  = {}
local matched = 0

for _, cue in ipairs(cues) do
  local start_frame = math.floor(cue.startSec * fps + 0.5)
  local text        = cue.text or ""

  -- Item mit passendem Startframe suchen
  local found_item = nil
  for _, item in pairs(items) do
    if math.abs(item:GetStart() - start_frame) < 3 then
      found_item = item
      break
    end
  end

  if not found_item then
    table.insert(errors, "Kein Item @ frame " .. start_frame)
  else
    local comp = found_item:GetFusionCompByIndex(1)
    if not comp then
      table.insert(errors, "Keine Fusion-Komp @ frame " .. start_frame)
    else
      -- 1. PestoText-Node direkt suchen
      local node = comp:FindTool("PestoText")

      -- 2. Fallback: ersten TextPlus-Node nehmen
      if not node then
        local tools = comp:GetToolList(false, "TextPlus")
        if tools then
          for _, t in pairs(tools) do
            node = t
            break
          end
        end
      end

      if not node then
        table.insert(errors, "Kein TextPlus-Node @ frame " .. start_frame)
      else
        -- Text setzen (StyledText → Text als Fallback)
        local set_ok = pcall(function()
          node:SetInput("StyledText", text)
        end)
        if not set_ok then
          local set_ok2 = pcall(function()
            node:SetInput("Text", text)
          end)
          if not set_ok2 then
            table.insert(errors, "SetInput fehlgeschlagen @ frame " .. start_frame)
          else
            matched = matched + 1
          end
        else
          matched = matched + 1
        end
      end
    end
  end
end

-- ── Ergebnis ausgeben ──────────────────────────────────────────────
local result = {
  ok      = true,
  matched = matched,
  errors  = errors,
}
print(bmd.tojson(result))
