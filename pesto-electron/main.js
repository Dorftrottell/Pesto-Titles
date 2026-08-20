/**
 * Pesto Titles — Electron Workflow Integration Plugin
 * main.js — Hauptprozess
 *
 * WICHTIG: Resolve WI API gibt keine echten Promises zurück!
 * Nur await + try/catch verwenden — KEIN .catch() chaining!
 *
 * AGPL-3.0 | Offline-first
 */

'use strict';

const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// App-Name und Icon setzen (Dock / Taskbar)
app.setName('Pesto Titles');
const ICON_PATH = path.join(__dirname, 'icon.icns');

// ── WorkflowIntegration.node ──────────────────────────────────────────
let WorkflowIntegration = null;
try {
  WorkflowIntegration = require('./WorkflowIntegration.node');
  console.log('[Pesto] WorkflowIntegration.node geladen ✅');
} catch (e) {
  console.warn('[Pesto] WI.node nicht ladbar:', e.message);
}

const PLUGIN_ID = 'com.pesto.titles';

// ── Globale Resolve-Objekte ───────────────────────────────────────────
let resolveObj = null;
let projectMgr = null;

// ── Storage ───────────────────────────────────────────────────────────
const STORAGE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Pesto Titles');
const STYLES_DIR  = path.join(STORAGE_DIR, 'styles');
const CONFIG_FILE = path.join(STORAGE_DIR, 'config.json');

function ensureDirs() {
  for (const d of [STORAGE_DIR, STYLES_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// ── Resolve-Verbindung ────────────────────────────────────────────────
// WICHTIG: Nur try/catch, kein .catch() — WI gibt keine echten Promises!
async function initResolve() {
  if (!WorkflowIntegration) return null;
  try {
    const ok = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!ok) { console.warn('[Pesto] Initialize() → false'); return null; }
    resolveObj = await WorkflowIntegration.GetResolve();
    if (!resolveObj) console.warn('[Pesto] GetResolve() → null');
    return resolveObj;
  } catch (e) {
    console.error('[Pesto] initResolve():', e.message);
    return null;
  }
}

async function getResolve() {
  if (resolveObj) return resolveObj;
  return initResolve();
}

async function cleanupResolve() {
  try { if (WorkflowIntegration) WorkflowIntegration.CleanUp(); } catch {}
  resolveObj = projectMgr = null;
}

async function getCurrentProject() {
  try {
    const r = await getResolve();
    if (!r) return null;
    if (!projectMgr) projectMgr = await r.GetProjectManager();
    if (!projectMgr) return null;
    return await projectMgr.GetCurrentProject();
  } catch (e) {
    console.error('[Pesto] getCurrentProject:', e.message);
    return null;
  }
}

async function getMediaPool() {
  try {
    const proj = await getCurrentProject();
    if (!proj) return null;
    return await proj.GetMediaPool();
  } catch { return null; }
}

async function getRootFolder() {
  try {
    const mp = await getMediaPool();
    if (!mp) return null;
    return await mp.GetRootFolder();
  } catch { return null; }
}

async function findFolder(binName) {
  try {
    const root = await getRootFolder();
    if (!root) return null;
    const subs = await root.GetSubFolderList();
    if (!subs) return null;
    for (const f of subs) {
      const name = await f.GetName();
      if (name === binName) return f;
    }
  } catch (e) {
    console.error('[Pesto] findFolder:', e.message);
  }
  return null;
}

async function ensureBin(binName) {
  try {
    let folder = await findFolder(binName);
    if (!folder) {
      const mp   = await getMediaPool();
      const root = await getRootFolder();
      if (mp && root) {
        folder = await mp.AddSubFolder(root, binName);
        return { folder, created: true };
      }
      return { folder: null, created: false };
    }
    return { folder, created: false };
  } catch (e) {
    console.error('[Pesto] ensureBin:', e.message);
    return { folder: null, created: false };
  }
}

// ── IPC: Status ───────────────────────────────────────────────────────
ipcMain.handle('pesto:status', async () => {
  try {
    const r = await getResolve();
    if (!r) return { connected: false, error: 'Resolve nicht verbunden — Plugin in Resolve öffnen' };

    const proj = await getCurrentProject();
    if (!proj) return { connected: false, error: 'Kein Projekt geöffnet' };

    let timelineName = null;
    let frameRate    = null;
    try {
      const tl = await proj.GetCurrentTimeline();
      if (tl) {
        timelineName = await tl.GetName();
        frameRate    = await tl.GetSetting('timelineFrameRate');
      }
    } catch {}

    return {
      connected:    true,
      projectName:  await proj.GetName(),
      timelineName,
      frameRate,
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
});

// ── IPC: Config ───────────────────────────────────────────────────────
ipcMain.handle('pesto:getConfig', async () => {
  try {
    if (fs.existsSync(CONFIG_FILE))
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return defaultConfig();
});

ipcMain.handle('pesto:saveConfig', async (_e, config) => {
  try {
    ensureDirs();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

function defaultConfig() {
  return {
    binName: 'Pesto Titles',
    engine: 'native',
    language: 'auto',
    segmentation: {
      maxChars: 42, maxWords: 8,
      minDurationMs: 500, maxDurationMs: 5000,
      fillGapsMs: 0, casing: 'unchanged',
      punctuation: {
        comma: true, period: true, questionMark: true,
        exclamationMark: true, quotes: false, dash: false,
        semicolon: false, colon: true,
      },
    },
  };
}

// ── IPC: Templates ────────────────────────────────────────────────────
ipcMain.handle('pesto:getTemplates', async (_e, binName) => {
  try {
    const { folder, created } = await ensureBin(binName || 'Pesto Titles');
    if (!folder) return { ok: false, error: 'Resolve nicht verbunden oder Bin nicht gefunden', templates: [] };

    let clips = null;
    try { clips = await folder.GetClipList(); } catch (e) {
      return { ok: false, error: 'GetClipList(): ' + e.message, templates: [] };
    }

    const templates = [];
    for (const clip of (clips || [])) {
      try {
        const clipName = await clip.GetName();
        let props = {};
        try { props = await clip.GetClipProperty(); } catch {}
        const type = (props && (props.Type || props['Clip Type'])) || '';
        if (type !== 'Fusion Title' && type !== 'Generator') continue;

        // Thumbnail versuchen — WI API kann hier null zurückgeben
        let thumbnailB64 = null;
        try {
          const thumb = await clip.GetThumbnailImage();
          if (thumb && thumb.data) {
            thumbnailB64 = Buffer.from(thumb.data).toString('base64');
          }
        } catch {}

        // Gespeichertes PNG als Fallback
        if (!thumbnailB64) {
          const p = path.join(STYLES_DIR, `${clipName}.png`);
          if (fs.existsSync(p)) {
            thumbnailB64 = fs.readFileSync(p).toString('base64');
          }
        }

        templates.push({
          clipName,
          type,
          resolution: (props && props.Resolution) || '',
          thumbnail: thumbnailB64,
        });
      } catch (e) {
        console.warn('[Pesto] Clip-Verarbeitung:', e.message);
      }
    }

    return { ok: true, templates, binCreated: created };
  } catch (e) {
    return { ok: false, error: e.message, templates: [] };
  }
});

// ── IPC: Styles ───────────────────────────────────────────────────────
ipcMain.handle('pesto:getStyles', async () => {
  try {
    ensureDirs();
    const files  = fs.readdirSync(STYLES_DIR).filter(f => f.endsWith('.json'));
    const styles = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), 'utf8'));
        return { ...data, path: path.join(STYLES_DIR, f) };
      } catch { return null; }
    }).filter(Boolean);
    return { styles };
  } catch {
    return { styles: [] };
  }
});

ipcMain.handle('pesto:saveStyle', async (_e, { name, clipName, binName, thumbnailB64 }) => {
  try {
    ensureDirs();
    const safe = name.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '_').trim();
    fs.writeFileSync(
      path.join(STYLES_DIR, `${safe}.json`),
      JSON.stringify({ name, clipName, binName, createdAt: new Date().toISOString() }, null, 2)
    );
    if (thumbnailB64) {
      try {
        fs.writeFileSync(
          path.join(STYLES_DIR, `${clipName}.png`),
          Buffer.from(thumbnailB64, 'base64')
        );
      } catch {}
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('pesto:deleteStyle', async (_e, styleId) => {
  try {
    const file = path.join(STYLES_DIR, `${styleId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: Video-Track-Anzahl lesen ─────────────────────────────────────
ipcMain.handle('pesto:getTrackCount', async () => {
  try {
    const proj = await getCurrentProject();
    if (!proj) return { ok: false, count: 0 };
    let tl = null;
    try { tl = await proj.GetCurrentTimeline(); } catch {}
    if (!tl) return { ok: false, count: 0 };
    let count = 0;
    try { count = await tl.GetTrackCount('video'); } catch {}
    return { ok: true, count };
  } catch {
    return { ok: false, count: 0 };
  }
});

// ── IPC: Bestehende Subtitles importieren (ohne neu zu transkribieren) ──
// Liest vorhandene Subtitle-Tracks aus der Timeline — preserviert manuell
// korrigierte Texte und überschreibt NICHT durch CreateSubtitlesFromAudio.
ipcMain.handle('pesto:importSubtitles', async (event) => {
  try {
    const proj = await getCurrentProject();
    if (!proj) return { ok: false, error: 'Kein Projekt geöffnet' };
    let tl = null;
    try { tl = await proj.GetCurrentTimeline(); } catch {}
    if (!tl) return { ok: false, error: 'Keine Timeline geöffnet' };

    let fps = 24;
    try { fps = parseFloat(await proj.GetSetting('timelineFrameRate')) || 24; } catch {}

    let trackCount = 0;
    try { trackCount = await tl.GetTrackCount('subtitle'); } catch {}
    if (trackCount === 0) return { ok: false, error: 'Keine Subtitle-Tracks in der Timeline gefunden. Bitte erst transkribieren.' };

    // Letzten Subtitle-Track lesen (enthält die längsten/besten Phrasen)
    const phrases = [];
    try {
      const items = await tl.GetItemListInTrack('subtitle', trackCount);
      for (const item of Object.values(items || {})) {
        try {
          const start = (await item.GetStart()) / fps;
          const end   = (await item.GetEnd())   / fps;
          const text  = await item.GetName();
          if (text) phrases.push({ start, end, text });
        } catch {}
      }
    } catch {}

    if (!phrases.length) return { ok: false, error: 'Subtitle-Track ist leer.' };

    event.sender.send('pesto:transcribeProgress', { percent: 100, message: 'Importiert!' });
    return { ok: true, phrases };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: Transkription ────────────────────────────────────────────────
ipcMain.handle('pesto:transcribe', async (event, { engine, language, modelSize }) => {
  try {
    const proj = await getCurrentProject();
    if (!proj) return { ok: false, error: 'Kein Projekt geöffnet' };

    let tl = null;
    try { tl = await proj.GetCurrentTimeline(); } catch {}
    if (!tl) return { ok: false, error: 'Keine Timeline geöffnet' };

    if (engine === 'native') {
      let ok = false;
      let lastErr = '';

      // Resolve 21 API — verschiedene Parameter-Formate versuchen
      const attempts = [
        { language },                          // { language: 'auto' }
        { subtitleTrackIndex: 1, language },   // mit Track-Index
        {},                                    // ohne Parameter
        null,                                  // null
      ];

      for (const params of attempts) {
        try {
          ok = params !== null
            ? await tl.CreateSubtitlesFromAudio(params)
            : await tl.CreateSubtitlesFromAudio();
          if (ok) break;
        } catch (e) {
          lastErr = e.message;
        }
      }

      if (!ok) {
        // Prüfen ob überhaupt Audio-Tracks vorhanden
        let audioTracks = 0;
        try { audioTracks = await tl.GetTrackCount('audio'); } catch {}
        const hint = audioTracks === 0
          ? 'Keine Audio-Tracks in der Timeline gefunden.'
          : `Transkription fehlgeschlagen. Audio-Tracks: ${audioTracks}. Stelle sicher dass "Inspector → AI Transcription" in Resolve aktiviert ist. Details: ${lastErr}`;
        return { ok: false, error: hint };
      }

      let fps = 24;
      try {
        const fpsStr = await proj.GetSetting('timelineFrameRate');
        fps = parseFloat(fpsStr) || 24;
      } catch {}

      let trackCount = 0;
      try { trackCount = await tl.GetTrackCount('subtitle'); } catch {}

      // Nur den letzten Subtitle-Track lesen — Resolve legt den besten/längsten
      // Phrasen-Track zuletzt an. Alle Tracks zu lesen würde Phrasen doppeln.
      const phrases = [];
      if (trackCount > 0) {
        try {
          const items = await tl.GetItemListInTrack('subtitle', trackCount);
          for (const item of (items || [])) {
            try {
              const start = (await item.GetStart()) / fps;
              const end   = (await item.GetEnd())   / fps;
              const text  = await item.GetName();
              if (text) phrases.push({ start, end, text });
            } catch {}
          }
        } catch {}
      }

      event.sender.send('pesto:transcribeProgress', { percent: 100, message: 'Fertig!' });
      return { ok: true, phrases };
    }

    // ── Whisper Engine ─────────────────────────────────────────────────
    if (engine === 'whisper') {
      return await runWhisper(event, proj, tl, { language, modelSize: modelSize || 'small' });
    }

    return { ok: false, error: `Engine '${engine}' nicht unterstützt.` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Whisper-Implementierung ────────────────────────────────────────────
async function runWhisper(event, proj, tl, { language, modelSize }) {
  const { execFile, spawn } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  const tmpDir = require('os').tmpdir();
  const audioFile = path.join(tmpDir, `pesto_audio_${Date.now()}.wav`);

  try {
    // 1. Audio aus Timeline exportieren
    event.sender.send('pesto:transcribeProgress', { percent: 5, message: 'Exportiere Audio …' });

    const tlName = await tl.GetName();
    const renderPreset = 'Audio Only'; // Resolve built-in preset

    // Render-Job anlegen
    let renderOk = false;
    try {
      await proj.LoadRenderPreset(renderPreset);
      await proj.SetRenderSettings({
        TargetDir: tmpDir,
        CustomName: `pesto_audio_${Date.now()}`,
        ExportAudio: true,
        ExportVideo: false,
      });
      const jobId = await proj.AddRenderJob();
      if (jobId) {
        await proj.StartRendering(jobId);
        // Warten bis fertig
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const status = await proj.GetRenderJobStatus(jobId);
          const pct = status?.CompletionPercentage || 0;
          event.sender.send('pesto:transcribeProgress', { percent: 5 + pct * 0.4, message: `Rendere Audio … ${Math.round(pct)}%` });
          if (status?.JobStatus === 'Complete') { renderOk = true; break; }
          if (status?.JobStatus === 'Failed') break;
        }
      }
    } catch (e) {
      console.warn('[Pesto] Render-Preset fehlgeschlagen:', e.message);
    }

    // Fallback: ffmpeg aus Resolve-Pfad versuchen wenn kein Render
    if (!renderOk) {
      // Prüfe ob eine exportierte Audiodatei existiert
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('pesto_audio_') && (f.endsWith('.wav') || f.endsWith('.mp4')));
      if (!files.length) {
        return { ok: false, error: 'Audio-Export fehlgeschlagen. Exportiere die Timeline manuell als WAV und nutze SRT-Import.' };
      }
    }

    // 2. Whisper finden
    event.sender.send('pesto:transcribeProgress', { percent: 50, message: 'Starte Whisper …' });

    // Audiodatei finden
    const audioFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('pesto_audio_') && (f.endsWith('.wav') || f.endsWith('.mp4') || f.endsWith('.aac')))
      .map(f => path.join(tmpDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (!audioFiles.length) {
      return { ok: false, error: 'Keine Audio-Datei gefunden. Exportiere Timeline als WAV und nutze SRT-Import.' };
    }

    const inputAudio = audioFiles[0];

    // Whisper-Pfad suchen (Hilfsfunktion)
    async function findWhisper() {
      const candidates = [
        'whisper',
        '/usr/local/bin/whisper',
        `${process.env.HOME}/.local/bin/whisper`,
        `${process.env.HOME}/Library/Python/3.11/bin/whisper`,
        `${process.env.HOME}/Library/Python/3.12/bin/whisper`,
        `${process.env.HOME}/Library/Python/3.10/bin/whisper`,
        '/opt/homebrew/bin/whisper',
        '/opt/homebrew/opt/python@3.11/bin/whisper',
      ];
      for (const p of candidates) {
        try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
      }
      // which-Fallback
      for (const p of ['whisper']) {
        try {
          const { stdout } = await execFileAsync('which', [p]);
          if (stdout.trim()) return stdout.trim();
        } catch {}
      }
      return null;
    }

    let whisperBin = await findWhisper();

    // ── Auto-Install wenn nicht gefunden ──────────────────────────
    if (!whisperBin) {
      event.sender.send('pesto:transcribeProgress', {
        percent: 48,
        message: 'Whisper nicht gefunden — installiere openai-whisper …',
      });

      // pip finden
      const pipCandidates = ['pip3', 'pip', '/usr/local/bin/pip3', '/opt/homebrew/bin/pip3'];
      let pipBin = null;
      for (const p of pipCandidates) {
        try { await execFileAsync('which', [p]); pipBin = p; break; } catch {}
        try { fs.accessSync(p, fs.constants.X_OK); pipBin = p; break; } catch {}
      }

      if (!pipBin) {
        return {
          ok: false,
          error: 'pip nicht gefunden. Bitte installiere Python 3: https://python.org\nDann: pip3 install openai-whisper',
        };
      }

      // pip install openai-whisper
      try {
        event.sender.send('pesto:transcribeProgress', {
          percent: 49,
          message: 'Installiere openai-whisper (kann 1-2 Minuten dauern) …',
        });
        await execFileAsync(pipBin, ['install', 'openai-whisper', '--quiet'], {
          timeout: 300000,
          env: { ...process.env, PIP_PROGRESS_BAR: 'off' },
        });
      } catch (e) {
        return {
          ok: false,
          error: `Installation fehlgeschlagen: ${e.message}\nBitte manuell installieren: pip3 install openai-whisper`,
        };
      }

      // Nach Installation nochmal suchen
      whisperBin = await findWhisper();
      if (!whisperBin) {
        return {
          ok: false,
          error: 'Whisper wurde installiert aber nicht gefunden. Starte das Plugin neu.',
        };
      }

      event.sender.send('pesto:transcribeProgress', {
        percent: 50,
        message: 'Whisper installiert ✓ — starte Transkription …',
      });
    }

    // 3. Whisper ausführen
    event.sender.send('pesto:transcribeProgress', { percent: 55, message: 'Whisper läuft …' });

    const outDir = tmpDir;
    const langArg = language === 'auto' ? [] : ['--language', language];
    const args = [inputAudio, '--model', modelSize || 'small', '--output_format', 'json', '--output_dir', outDir, ...langArg];

    await execFileAsync(whisperBin, args, { timeout: 300000 });

    event.sender.send('pesto:transcribeProgress', { percent: 90, message: 'Verarbeite Ergebnisse …' });

    // 4. JSON lesen
    const baseName = path.basename(inputAudio, path.extname(inputAudio));
    const jsonFile = path.join(outDir, `${baseName}.json`);
    if (!fs.existsSync(jsonFile)) {
      return { ok: false, error: 'Whisper-Output nicht gefunden.' };
    }

    const result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const phrases = (result.segments || []).map(s => ({
      start: s.start,
      end:   s.end,
      text:  s.text.trim(),
    })).filter(p => p.text);

    // Aufräumen
    try { fs.unlinkSync(jsonFile); } catch {}
    try { fs.unlinkSync(inputAudio); } catch {}

    event.sender.send('pesto:transcribeProgress', { percent: 100, message: 'Fertig!' });
    return { ok: true, phrases };

  } catch (e) {
    return { ok: false, error: 'Whisper-Fehler: ' + e.message };
  }
}

// ── IPC: Apply ────────────────────────────────────────────────────────
ipcMain.handle('pesto:apply', async (event, { cues, templateClipName, binName, trackTarget }) => {
  try {
    const proj = await getCurrentProject();
    if (!proj) return { ok: false, error: 'Kein Projekt geöffnet' };

    let tl = null;
    try { tl = await proj.GetCurrentTimeline(); } catch {}
    if (!tl) return { ok: false, error: 'Keine Timeline geöffnet' };

    let fps = 24;
    try {
      fps = parseFloat(await proj.GetSetting('timelineFrameRate')) || 24;
    } catch {}

    // ── Bin sicherstellen ────────────────────────────────────────────
    const { folder, created: binCreated } = await ensureBin(binName || 'Pesto Titles');
    if (!folder) return { ok: false, error: `Bin '${binName || 'Pesto Titles'}' konnte nicht erstellt werden` };

    // ── Template-Clip im Media Pool suchen ──────────────────────────
    async function findClipAnywhere(f, name) {
      let clips = [];
      try { clips = await f.GetClipList(); } catch {}
      for (const c of (clips || [])) {
        try { if (await c.GetName() === name) return c; } catch {}
      }
      let subs = [];
      try { subs = await f.GetSubFolderList(); } catch {}
      for (const sub of subs) {
        const found = await findClipAnywhere(sub, name);
        if (found) return found;
      }
      return null;
    }

    const rootFolder = await getRootFolder();
    let templateClip = await findClipAnywhere(rootFolder, templateClipName);
    if (!templateClip) return { ok: false, error: `Template '${templateClipName}' nicht im Media Pool gefunden` };

    // ── Clip in Pesto-Bin verschieben (falls noch nicht dort) ────────
    let clipPlacedInBin = false;
    const mp = await getMediaPool();
    try {
      const binClipList = await folder.GetClipList() || [];
      let alreadyThere = false;
      for (const c of binClipList) {
        try { if (await c.GetName() === templateClipName) { alreadyThere = true; break; } } catch {}
      }
      if (!alreadyThere && mp) {
        await mp.MoveClips([templateClip], folder);
        clipPlacedInBin = true;
        templateClip = await findClipAnywhere(rootFolder, templateClipName) || templateClip;
      }
    } catch { /* non-critical */ }

    // ── Track bestimmen / anlegen ────────────────────────────────────
    let vTrackCount = 1;
    try { vTrackCount = await tl.GetTrackCount('video'); } catch {}
    const track = trackTarget === 0 ? vTrackCount + 1 : Math.min(trackTarget, vTrackCount + 1);

    const errors = [];

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Alle Clips in EINEM AppendToTimeline-Call platzieren
    //
    // WICHTIG: AppendToTimeline in der WI API interpretiert recordFrame
    // falsch wenn es mehrfach in einer Schleife aufgerufen wird —
    // nur der erste Clip landet an der richtigen Position, alle weiteren
    // werden sequenziell ANGEHÄNGT statt an die absolute Position gesetzt.
    //
    // Lösung: alle Clips als einziges Array übergeben, wie es das
    // Snap-Captions-Plugin auch macht (dort: makeTextPlus mit allen Cues
    // in einem Lua-Call).
    // ═══════════════════════════════════════════════════════════════

    // Clip-Array für alle validen Cues aufbauen
    const clipInfos  = [];
    const placedCues = [];
    for (let i = 0; i < cues.length; i++) {
      const cue        = cues[i];
      const startFrame = Math.round(cue.startSec * fps);
      const dur        = Math.round((cue.endSec - cue.startSec) * fps);
      if (dur <= 0) continue;
      clipInfos.push({
        mediaPoolItem: templateClip,
        startFrame:    0,
        endFrame:      dur,
        trackIndex:    track,
        recordFrame:   startFrame,
      });
      placedCues.push({ ...cue, startFrame });
    }

    event.sender.send('pesto:applyProgress', { current: 1, total: 3 });

    // Einmaliger Batch-Call — alle Clips auf einmal
    if (clipInfos.length > 0) {
      try {
        const ok = await mp.AppendToTimeline(clipInfos);
        if (!ok) {
          errors.push('Batch-Platzierung fehlgeschlagen (AppendToTimeline returned false)');
          placedCues.length = 0; // Phase 2 überspringen
        }
      } catch (err) {
        errors.push(`AppendToTimeline-Fehler: ${err.message}`);
        placedCues.length = 0;
      }
    }

    event.sender.send('pesto:applyProgress', { current: 2, total: 3 });


    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Text via Lua (fuscript) oder Python setzen
    // Die WI API hat keinen Zugriff auf Fusion-Node-Internals.
    // fuscript ist Resolves eingebauter Lua-Interpreter — kein Python nötig.
    // ═══════════════════════════════════════════════════════════════
    if (placedCues.length > 0) {
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);

      event.sender.send('pesto:applyProgress', { current: cues.length * 2, total: cues.length * 2 });

      let scriptResult = null;
      const ts = Date.now();

      // ── Variante 1: Lua via fuscript (kein Python, kein bmd.fromjson) ─
      // Daten als Lua-Tabelle schreiben — robust, kein JSON-Parser nötig
      const luaDataFile = path.join(os.tmpdir(), `pesto-cues-${ts}.lua`);
      const luaDataLines = [
        'return {',
        `  trackIndex = ${track},`,
        `  fps = ${fps},`,
        '  cues = {',
        ...placedCues.map(c => `    { startSec = ${c.startSec}, text = ${JSON.stringify(c.text)} },`),
        '  }',
        '}',
      ];
      fs.writeFileSync(luaDataFile, luaDataLines.join('\n'), 'utf-8');

      const luaScript = path.join(__dirname, 'pesto_set_text.lua');
      const fuscriptCandidates = [
        '/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fuscript',
        '/Applications/DaVinci Resolve Studio/DaVinci Resolve Studio.app/Contents/Libraries/Fusion/fuscript',
      ];

      for (const fuscript of fuscriptCandidates) {
        if (!fs.existsSync(fuscript)) continue;
        try {
          const { stdout } = await execFileAsync(fuscript, [luaScript, luaDataFile], { timeout: 60000 });
          // Letztes JSON-Objekt aus stdout nehmen (fuscript kann Debug-Output vorher schreiben)
          const lines = stdout.trim().split('\n');
          for (let li = lines.length - 1; li >= 0; li--) {
            try { scriptResult = JSON.parse(lines[li]); break; } catch {}
          }
          if (scriptResult) break;
        } catch (e) {
          console.warn('[Pesto] fuscript fehlgeschlagen:', e.message);
        }
      }
      try { fs.unlinkSync(luaDataFile); } catch {}

      // ── Variante 2: Python-Fallback (nutzt JSON) ──────────────────
      if (!scriptResult) {
        const tmpJson = path.join(os.tmpdir(), `pesto-cues-${ts}.json`);
        fs.writeFileSync(tmpJson, JSON.stringify({
          trackIndex: track, fps,
          cues: placedCues.map(c => ({ startSec: c.startSec, text: c.text })),
        }), 'utf-8');

        const pyScript = path.join(__dirname, 'pesto_set_text.py');
        for (const py of ['python3', 'python']) {
          try {
            const { stdout } = await execFileAsync(py, [pyScript, tmpJson], { timeout: 60000 });
            const lines = stdout.trim().split('\n');
            for (let li = lines.length - 1; li >= 0; li--) {
              try { scriptResult = JSON.parse(lines[li]); break; } catch {}
            }
            if (scriptResult) break;
          } catch {}
        }
        try { fs.unlinkSync(tmpJson); } catch {}
      }

      if (!scriptResult) {
        errors.push('Text-Setzung fehlgeschlagen: weder fuscript noch Python verfügbar');
      } else if (!scriptResult.ok) {
        errors.push(`Text-Setzung: ${scriptResult.error}`);
      } else if (scriptResult.errors?.length) {
        errors.push(...scriptResult.errors.slice(0, 5));
      }
    }

    return { ok: true, errors, binCreated, clipPlacedInBin };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('pesto:cleanup', async () => {
  await cleanupResolve();
  return { ok: true };
});

// ── Electron Fenster ──────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  // Icon laden
  let icon;
  try {
    icon = nativeImage.createFromPath(ICON_PATH);
    if (icon.isEmpty()) icon = undefined;
  } catch { icon = undefined; }

  mainWindow = new BrowserWindow({
    width: 1100, height: 820,
    minWidth: 800, minHeight: 600,
    title: 'Pesto Titles',
    icon,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox:          true,
    },
  });

  // Dock-Icon setzen (macOS)
  if (icon && process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(icon); } catch {}
  }

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Resolve-Verbindungsüberwachung ────────────────────────────────────
// Prüft alle 3 Sekunden ob Resolve noch läuft.
// WICHTIG: WI-API-Calls hängen unendlich wenn Resolve weg ist (kein Fehler!).
// → Jeder Call wird mit einem Timeout gewrappt.
// → Bei Shutdown: process.exit(0) statt app.quit() (kein Warten auf Hooks).

let _resolveCheckFails = 0;
let _resolveWasConnected = false;
let _shutdownStarted = false;

// Timeout-Wrapper: wirft nach `ms` Millisekunden einen Fehler
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`WI API Timeout nach ${ms}ms`)), ms)
    ),
  ]);
}

async function checkResolveLiveness() {
  if (_shutdownStarted) return;

  // Erst prüfen wenn mindestens einmal verbunden war
  if (!_resolveWasConnected) {
    try {
      const r = await withTimeout(getResolve(), 2000);
      if (r) _resolveWasConnected = true;
    } catch {}
    return;
  }

  try {
    const r = resolveObj;
    if (!r) throw new Error('Kein Resolve-Objekt');
    // 1.5s Timeout — wenn Resolve weg ist, hängt dieser Call sonst für immer
    await withTimeout(r.GetProductName(), 1500);
    _resolveCheckFails = 0;
  } catch (e) {
    _resolveCheckFails++;
    console.warn(`[Pesto] Resolve nicht erreichbar (${_resolveCheckFails}/2): ${e.message}`);
    if (_resolveCheckFails >= 2) {
      _shutdownStarted = true;
      console.log('[Pesto] Resolve geschlossen → sofortiger Exit');
      // process.exit(0) statt app.quit():
      // app.quit() wartet auf beforeunload-Events und CleanUp-Hooks,
      // die bei einem toten Resolve selbst hängen würden.
      try { if (WorkflowIntegration) WorkflowIntegration.CleanUp(); } catch {}
      process.exit(0);
    }
  }
}

app.whenReady().then(() => {
  ensureDirs();
  createWindow();
  // Health-Check alle 3 Sekunden (~6s bis zum Exit nach Resolve-Schließen)
  setInterval(checkResolveLiveness, 3000);
});

app.on('window-all-closed', () => {
  if (!_shutdownStarted) cleanupResolve();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
