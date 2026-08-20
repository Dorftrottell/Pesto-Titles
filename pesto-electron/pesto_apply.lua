--[[
  pesto_apply.lua — Resolve Scripting API Helper
  Platziert Template-Clips auf der Timeline UND setzt Text statisch.
  Nutzt die VOLLSTÄNDIGE Resolve Scripting API (nicht WI API) via fuscript.
  recordFrame funktioniert hier korrekt für alle Clips.

  Aufruf:
    fuscript pesto_apply.lua /path/to/data.lua
]]

-- ── Daten laden ────────────────────────────────────────────────────
local data_path = (arg and arg[1]) or os.getenv("PESTO_DATA_FILE")
if not data_path then
  io.write('{"ok":false,"error":"Kein Datenpfad"}\n')
  os.exit(1)
end

local ok_load, data = pcall(dofile, data_path)
if not ok_load or not data then
  io.write('{"ok":false,"error":"Datei konnte nicht geladen werden: ' .. tostring(data) .. '"}\n')
  os.exit(1)
end

local track_index      = data.trackIndex      or 1
local fps              = tonumber(data.fps)   or 25.0
local cues             = data.cues            or {}
local template_name    = data.templateName    or ""

-- ── Resolve verbinden ───────────────────────────────────────────────
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

local mp = project:GetMediaPool()
if not mp then
  io.write('{"ok":false,"error":"Kein Media Pool"}\n')
  os.exit(1)
end

-- ── Template-Clip im Media Pool suchen ─────────────────────────────
local function findClip(folder, name)
  local clips = folder:GetClipList() or {}
  for _, clip in pairs(clips) do
    local ok, n = pcall(function() return clip:GetName() end)
    if ok and n == name then return clip end
  end
  local subs = folder:GetSubFolderList() or {}
  for _, sub in pairs(subs) do
    local found = findClip(sub, name)
    if found then return found end
  end
  return nil
end

local root = mp:GetRootFolder()
local template_clip = findClip(root, template_name)
if not template_clip then
  io.write('{"ok":false,"error":"Template-Clip nicht gefunden: ' .. template_name .. '"}\n')
  os.exit(1)
end

-- ── Hilfsfunktionen ────────────────────────────────────────────────
local function escJson(s)
  s = tostring(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"',  '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  return s
end

-- Entfernt Keyframe-Animation vom TextPlus-Node und setzt statischen Text
local function setStaticText(comp, node, text)
  comp:Lock()
  pcall(function()
    local inputs = node:GetInputList()
    for _, inp in pairs(inputs or {}) do
      local attrs = {}
      pcall(function() attrs = inp:GetAttrs() end)
      local id = attrs.INPS_ID or ""
      if id == "StyledText" or id == "Text" then
        local connected = nil
        pcall(function() connected = inp:ConnectedTo() end)
        if connected then
          pcall(function() inp:Connect() end)
          pcall(function() connected:Delete() end)
        end
        break
      end
    end
  end)
  comp:Unlock()

  local ok = false
  pcall(function() node:SetInput("StyledText", text); ok = true end)
  if not ok then
    pcall(function() node:SetInput("Text", text); ok = true end)
  end
  return ok
end

-- ── PHASE 1: Clips platzieren (Resolve Scripting API) ──────────────
-- Die vollständige API interpretiert recordFrame korrekt für alle Clips.

local clip_array = {}
for _, cue in ipairs(cues) do
  local start_frame = math.floor(cue.startSec * fps + 0.5)
  local end_frame   = math.floor(cue.endSec   * fps + 0.5)
  local dur         = end_frame - start_frame
  if dur > 0 then
    table.insert(clip_array, {
      mediaPoolItem = template_clip,
      startFrame    = 0,
      endFrame      = dur,
      trackIndex    = track_index,
      recordFrame   = start_frame,
    })
  end
end

if #clip_array == 0 then
  io.write('{"ok":false,"error":"Keine gültigen Cues"}\n')
  os.exit(1)
end

-- ── Timeline-Start-Frame als absoluten Offset holen ────────────────
-- Resolve-Timelines beginnen oft NICHT bei Frame 0 (typisch: 01:00:00:00).
-- recordFrame ist eine ABSOLUTE Timeline-Position, cue.startSec ist relativ.
-- Ohne diesen Offset werden alle Clips am falschen Ort platziert!
local tl_start = 0
pcall(function()
  tl_start = timeline:GetStartFrame() or 0
end)

-- Track-Validierung
local tl_track_count = 0
pcall(function() tl_track_count = timeline:GetTrackCount("video") end)
if track_index > tl_track_count + 1 then
  io.write('{"ok":false,"error":"Video-Track ' .. track_index .. ' existiert nicht (vorhandene Tracks: ' .. tl_track_count .. ')"}')
  os.exit(1)
end

-- recordFrame-Offset auf alle Clips anwenden
for i, clip_info in ipairs(clip_array) do
  clip_array[i].recordFrame = clip_array[i].recordFrame + tl_start
end
local place_ok = false
pcall(function()
  local result = mp:AppendToTimeline(clip_array)
  -- Volle API gibt ein Array der platzierten Items zurück (oder false)
  place_ok = (result ~= false and result ~= nil)
end)

if not place_ok then
  io.write('{"ok":false,"error":"AppendToTimeline fehlgeschlagen"}\n')
  os.exit(1)
end

-- ── PHASE 2: Text setzen ────────────────────────────────────────────
-- Kurz warten damit Resolve die Clips verarbeiten kann
-- (nicht immer nötig, aber sicherer)
local items = timeline:GetItemListInTrack("video", track_index)
if not items then
  io.write('{"ok":false,"error":"Keine Items auf Track nach Platzierung"}\n')
  os.exit(1)
end

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
    -- Orangener Clip-Tag für einfaches Grading-Deaktivieren
    pcall(function() found_item:SetClipColor("Orange") end)

    local ok_comp, comp = pcall(function() return found_item:GetFusionCompByIndex(1) end)
    if not ok_comp or not comp then
      table.insert(errors, "Keine Fusion-Komp @ frame " .. start_frame)
    else
      local node = nil
      pcall(function() node = comp:FindTool("PestoText") end)
      if not node then
        pcall(function()
          local tools = comp:GetToolList(false, "TextPlus")
          if tools then for _, t in pairs(tools) do node = t; break end end
        end)
      end
      if not node then
        table.insert(errors, "Kein TextPlus-Node @ frame " .. start_frame)
      elseif setStaticText(comp, node, text) then
        matched = matched + 1
      else
        table.insert(errors, "SetInput fehlgeschlagen @ frame " .. start_frame)
      end
    end
  end
end

-- ── Ergebnis ───────────────────────────────────────────────────────
local errs = '"errors":['
for i, e in ipairs(errors) do
  errs = errs .. (i > 1 and ',' or '') .. '"' .. escJson(e) .. '"'
end
errs = errs .. ']'

io.write('{"ok":true,"matched":' .. matched .. ',' .. errs .. '}\n')
