--[[
  pesto_set_text.lua — Resolve Fusion Scripting Helper
  Setzt Text statisch in Fusion TextPlus-Nodes.
  Entfernt dabei bestehende Keyframe-Animationen vom StyledText-Input.

  Aufruf via fuscript:
    fuscript pesto_set_text.lua /path/to/data.lua
]]

local data_path = arg and arg[1]
if not data_path then
  data_path = os.getenv("PESTO_DATA_FILE")
end
if not data_path then
  io.write('{"ok":false,"error":"Kein Datenpfad angegeben"}\n')
  os.exit(1)
end

local ok_load, data = pcall(dofile, data_path)
if not ok_load or not data then
  io.write('{"ok":false,"error":"Datei konnte nicht geladen werden: ' .. tostring(data) .. '"}\n')
  os.exit(1)
end

local track_index = data.trackIndex or 1
local fps         = tonumber(data.fps) or 25.0
local cues        = data.cues or {}

local resolve = bmd.scriptapp and bmd.scriptapp("Resolve")
if not resolve then
  io.write('{"ok":false,"error":"Resolve Scripting API nicht verfügbar"}\n')
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

local items = timeline:GetItemListInTrack("video", track_index)
if not items then
  io.write('{"ok":false,"error":"Keine Items auf Track ' .. track_index .. '"}\n')
  os.exit(1)
end

-- ── Hilfsfunktionen ────────────────────────────────────────────────

local function escJson(s)
  s = tostring(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"', '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  return s
end

-- Setzt Text STATISCH auf einem TextPlus-Node.
-- Entfernt dazu die Keyframe-Animation vom StyledText-Input (falls vorhanden),
-- damit kein Wort-für-Wort-Effekt des Templates übrig bleibt.
local function setStaticText(comp, node, text)
  local set_ok = false

  -- Composition während der Änderung sperren
  comp:Lock()
  pcall(function()
    -- Über alle Inputs des Nodes iterieren und StyledText / Text finden
    local inputs = node:GetInputList()
    for _, inp in pairs(inputs or {}) do
      local attrs = {}
      pcall(function() attrs = inp:GetAttrs() end)
      local id = attrs.INPS_ID or ""
      if id == "StyledText" or id == "Text" then
        -- Prüfen ob der Input animiert ist (an einen BezierSpline gekoppelt)
        local connected = nil
        pcall(function() connected = inp:ConnectedTo() end)
        if connected then
          -- Verbindung zur Animation trennen
          pcall(function() inp:Connect() end)       -- Disconnect (kein Argument = nil)
          -- Spline löschen damit keine verwaisten Operatoren bleiben
          pcall(function() connected:Delete() end)
        end
        break
      end
    end
  end)
  comp:Unlock()

  -- Nun den statischen Text setzen (kein Keyframe, weil Animation entfernt)
  pcall(function()
    node:SetInput("StyledText", text)
    set_ok = true
  end)
  if not set_ok then
    pcall(function()
      node:SetInput("Text", text)
      set_ok = true
    end)
  end

  return set_ok
end

-- ── Text pro Cue setzen ────────────────────────────────────────────

local errors  = {}
local matched = 0

for _, cue in ipairs(cues) do
  local start_frame = math.floor(cue.startSec * fps + 0.5)
  local text        = cue.text or ""

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
      -- TextPlus-Node finden
      local node = nil
      pcall(function() node = comp:FindTool("PestoText") end)
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
        -- Statischen Text setzen (Animation entfernen)
        local ok = setStaticText(comp, node, text)
        if ok then
          matched = matched + 1
        else
          table.insert(errors, "SetInput fehlgeschlagen @ frame " .. start_frame)
        end
      end
    end
  end
end

-- ── Ergebnis ausgeben ──────────────────────────────────────────────

local errs_json = '"errors":['
for i, e in ipairs(errors) do
  errs_json = errs_json .. (i > 1 and ',' or '') .. '"' .. escJson(e) .. '"'
end
errs_json = errs_json .. ']'

io.write('{"ok":true,"matched":' .. matched .. ',' .. errs_json .. '}\n')
