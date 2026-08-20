--[[
  pesto_set_text.lua — Resolve Fusion Scripting Helper
  Setzt Text in Fusion TextPlus-Nodes der platzierten Timeline-Items.

  Aufruf via fuscript:
    fuscript pesto_set_text.lua /path/to/data.lua

  data.lua-Format (Lua-Tabelle, kein JSON-Parser nötig):
    return {
      trackIndex = 3,
      fps = 25.0,
      cues = {
        { startSec = 0.0, text = "Hallo Welt" },
        ...
      }
    }
]]

-- ── Datei-Pfad aus Argumenten lesen ────────────────────────────────
-- In fuscript: arg[0] = Script, arg[1] = erstes Argument
local data_path = arg and arg[1]
if not data_path then
  -- Fallback: aus Umgebungsvariable (Windows-Kompatibilität)
  data_path = os.getenv("PESTO_DATA_FILE")
end
if not data_path then
  io.write('{"ok":false,"error":"Kein Datenpfad angegeben"}\n')
  os.exit(1)
end

-- ── Daten als Lua-Tabelle laden (robust, kein bmd.fromjson nötig) ──
local ok_load, data = pcall(dofile, data_path)
if not ok_load or not data then
  io.write('{"ok":false,"error":"Datei konnte nicht geladen werden: ' .. tostring(data) .. '"}\n')
  os.exit(1)
end

local track_index = data.trackIndex or 1
local fps         = tonumber(data.fps) or 25.0
local cues        = data.cues or {}

-- ── Resolve verbinden ───────────────────────────────────────────────
local resolve = bmd.scriptapp and bmd.scriptapp("Resolve")
if not resolve then
  io.write('{"ok":false,"error":"Resolve Scripting API nicht verfügbar (bmd.scriptapp)"}\n')
  os.exit(1)
end

local pm      = resolve:GetProjectManager()
local project = pm and pm:GetCurrentProject()
if not project then
  io.write('{"ok":false,"error":"Kein Projekt geöffnet"}\n')
  os.exit(1)
end

local timeline = project:GetCurrentTimeline()
if not timeline then
  io.write('{"ok":false,"error":"Keine Timeline geöffnet"}\n')
  os.exit(1)
end

-- GetItemListInTrack gibt {[1]=item, [2]=item, ...} zurück
local items = timeline:GetItemListInTrack("video", track_index)
if not items then
  io.write('{"ok":false,"error":"Keine Items auf Track ' .. track_index .. '"}\n')
  os.exit(1)
end

-- ── Text pro Cue setzen ────────────────────────────────────────────
local errors  = {}
local matched = 0

local function escJson(s)
  s = tostring(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"', '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  return s
end

for _, cue in ipairs(cues) do
  local start_frame = math.floor(cue.startSec * fps + 0.5)
  local text        = cue.text or ""

  -- Item mit passendem Startframe suchen (±2 Frames Toleranz)
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
    local ok_comp, comp = pcall(function() return found_item:GetFusionCompByIndex(1) end)
    if not ok_comp or not comp then
      table.insert(errors, "Keine Fusion-Komp @ frame " .. start_frame)
    else
      -- 1. PestoText-Node direkt suchen
      local node = nil
      pcall(function() node = comp:FindTool("PestoText") end)

      -- 2. Fallback: ersten TextPlus-Node nehmen
      if not node then
        pcall(function()
          local tools = comp:GetToolList(false, "TextPlus")
          if tools then
            for _, t in pairs(tools) do node = t; break end
          end
        end)
      end

      if not node then
        table.insert(errors, "Kein TextPlus-Node @ frame " .. start_frame)
      else
        -- SetInput versuchen (StyledText → Text als Fallback)
        local set_ok = false
        pcall(function() node:SetInput("StyledText", text); set_ok = true end)
        if not set_ok then
          pcall(function() node:SetInput("Text", text); set_ok = true end)
        end
        if set_ok then
          matched = matched + 1
        else
          table.insert(errors, "SetInput fehlgeschlagen @ frame " .. start_frame)
        end
      end
    end
  end
end

-- ── Ergebnis als JSON ausgeben ─────────────────────────────────────
local errs_json = '"errors":['
for i, e in ipairs(errors) do
  errs_json = errs_json .. (i > 1 and ',' or '') .. '"' .. escJson(e) .. '"'
end
errs_json = errs_json .. ']'

io.write('{"ok":true,"matched":' .. matched .. ',' .. errs_json .. '}\n')
