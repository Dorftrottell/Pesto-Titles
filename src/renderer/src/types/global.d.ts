import type { AppConfig, CaptionCue } from '@shared/types'

declare global {
  interface Window {
    pesto: {
      getConfig: () => Promise<AppConfig>
      setConfig: (config: AppConfig) => Promise<{ ok: boolean }>
      connectResolve: () => Promise<{ ok: boolean; data?: unknown; error?: string }>
      scanTemplates: (binName: string) => Promise<{ ok: boolean; data?: unknown; error?: string }>
      startTranscription: (params: { engine: string; modelSize?: string; language: string }) =>
        Promise<{ ok: boolean; data?: unknown; error?: string }>
      importFile: (content: string, format: 'srt' | 'vtt') =>
        Promise<{ ok: boolean; data?: unknown; error?: string }>
      computeSegments: (input: unknown, config: unknown) =>
        Promise<{ ok: boolean; data?: unknown; error?: string }>
      applyCaptions: (cues: CaptionCue[], templateClipName: string, trackTarget: number) =>
        Promise<{ ok: boolean; data?: unknown; error?: string }>
      listPresets: () => Promise<{ ok: boolean; data?: unknown; error?: string }>
      startRender: (presetName: string) => Promise<{ ok: boolean; data?: unknown; error?: string }>
      exportDiagnostics: () => Promise<{ ok: boolean; path?: string; error?: string }>
      on: (channel: string, cb: (...args: unknown[]) => void) => () => void
    }
  }
}

export {}
