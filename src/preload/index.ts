import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, CaptionCue } from '@shared/types'

// Expose a type-safe API to the renderer process
contextBridge.exposeInMainWorld('pesto', {
  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (config: AppConfig): Promise<{ ok: boolean }> => ipcRenderer.invoke('config:set', config),

  // Resolve connection
  connectResolve: () => ipcRenderer.invoke('resolve:connect'),

  // Templates
  scanTemplates: (binName: string) => ipcRenderer.invoke('templates:scan', { binName }),

  // Transcription
  startTranscription: (params: { engine: string; modelSize?: string; language: string }) =>
    ipcRenderer.invoke('transcribe:start', params),
  importFile: (content: string, format: 'srt' | 'vtt') =>
    ipcRenderer.invoke('transcribe:import-file', { content, format }),

  // Segmentation
  computeSegments: (input: unknown, config: unknown) =>
    ipcRenderer.invoke('segment:compute', { input, config }),

  // Apply
  applyCaptions: (cues: CaptionCue[], templateClipName: string, trackTarget: number, binName?: string) =>
    ipcRenderer.invoke('captions:apply', { cues, templateClipName, trackTarget, binName }),

  // Delivery
  listPresets: () => ipcRenderer.invoke('deliver:presets:list'),
  startRender: (presetName: string) => ipcRenderer.invoke('deliver:render:start', { presetName }),

  // Diagnostics
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),

  // IPC event listeners
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const subscription = (_: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
})
