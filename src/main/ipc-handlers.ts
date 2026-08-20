import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { createWriteStream } from 'fs'
import log from 'electron-log'
import { getConfig, setConfig } from './config-store'
import { sendBridgeCommand } from './resolve-bridge'
import { segmentCues, parseSRT, parseVTT, exportSRT } from '@shared/segmentation'
import type { AppConfig, CaptionCue } from '@shared/types'

// ---------------------------------------------------------------
// Helper — get all Electron windows to broadcast progress
// ---------------------------------------------------------------
function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload))
}

function getTempDir(): string {
  const dir = join(app.getPath('temp'), 'pesto-captions')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function registerIPCHandlers(): void {
  // ---- Config -------------------------------------------------------
  ipcMain.handle('config:get', async () => {
    return getConfig()
  })

  ipcMain.handle('config:set', async (_, config: AppConfig) => {
    setConfig(config)
    return { ok: true }
  })

  // ---- Resolve Connection -------------------------------------------
  ipcMain.handle('resolve:connect', async () => {
    try {
      const data = await sendBridgeCommand('connect')
      return { ok: true, data }
    } catch (err) {
      log.warn('resolve:connect failed:', err)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Template Scanning -------------------------------------------
  ipcMain.handle('templates:scan', async (_, { binName }: { binName: string }) => {
    try {
      const data = await sendBridgeCommand('templates_scan', { binName })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Transcription -----------------------------------------------
  ipcMain.handle('transcribe:start', async (_, params: {
    engine: string
    modelSize?: string
    language: string
  }) => {
    try {
      // Send progress updates back to renderer
      const progressCb = (p: { current: number; total: number }) => {
        broadcast('transcribe:progress', p)
      }

      let result: unknown
      if (params.engine === 'native') {
        result = await sendBridgeCommand('transcribe_native', { language: params.language }, progressCb)
      } else {
        // Whisper path: check if whisper.cpp binary available
        result = await sendBridgeCommand('transcribe_whisper', {
          modelSize: params.modelSize || 'small',
          language: params.language,
        }, progressCb)
      }

      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- SRT/VTT Import ----------------------------------------------
  ipcMain.handle('transcribe:import-file', async (_, { content, format }: { content: string; format: 'srt' | 'vtt' }) => {
    try {
      const phrases = format === 'srt' ? parseSRT(content) : parseVTT(content)
      return { ok: true, data: { wordTimingAvailable: false, phrases } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Segmentation ------------------------------------------------
  ipcMain.handle('segment:compute', async (_, {
    input,
    config,
  }: {
    input: { words?: unknown[]; phrases?: unknown[] }
    config: unknown
  }) => {
    try {
      const cues = segmentCues(input as Parameters<typeof segmentCues>[0], config as Parameters<typeof segmentCues>[1])
      return { ok: true, data: cues }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Apply Captions to Timeline ----------------------------------
  ipcMain.handle('captions:apply', async (_, {
    cues,
    templateClipName,
    trackTarget,
    binName,
  }: {
    cues: CaptionCue[]
    templateClipName: string
    trackTarget: number
    binName?: string
  }) => {
    try {
      // Write cue list to temp file for the bridge script
      const cueListPath = join(getTempDir(), 'cue-list.json')
      writeFileSync(cueListPath, JSON.stringify({
        templateClipName,
        wordTimingAvailable: cues.some(c => c.timingEditable),
        cues: cues.map(c => ({
          cueIndex: c.cueIndex,
          startSec: c.startSec,
          endSec: c.endSec,
          runs: c.runs,
        })),
      }), 'utf-8')

      // Also export a plain SRT for reference
      const srtPath = join(getTempDir(), 'captions.srt')
      writeFileSync(srtPath, exportSRT(cues), 'utf-8')

      const progressCb = (p: { current: number; total: number }) => {
        broadcast('captions:apply:progress', p)
      }

      const data = await sendBridgeCommand('captions_apply', {
        cueListPath,
        templateClipName,
        trackTarget,
        binName: binName || 'Pesto Captions',
      }, progressCb)

      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Deliver Presets ---------------------------------------------
  ipcMain.handle('deliver:presets:list', async () => {
    try {
      const data = await sendBridgeCommand('presets_list')
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('deliver:render:start', async (_, { presetName }: { presetName: string }) => {
    try {
      const data = await sendBridgeCommand('render_start', { presetName })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Diagnostics Export ------------------------------------------
  ipcMain.handle('diagnostics:export', async () => {
    try {
      const archiver = await import('archiver')
      const logDir = join(app.getPath('userData'), 'logs')
      const outPath = join(app.getPath('downloads'), `pesto-diagnostics-${Date.now()}.zip`)
      const output = createWriteStream(outPath)
      const archive = archiver.default('zip')
      archive.pipe(output)
      archive.directory(logDir, 'logs')
      await archive.finalize()
      return { ok: true, path: outPath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
