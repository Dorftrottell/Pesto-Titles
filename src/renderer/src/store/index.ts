import { create } from 'zustand'
import type {
  AppConfig,
  TimelineInfo,
  TemplateInfo,
  CaptionCue,
  TranscribeResult,
  WordToken,
  PhraseToken,
} from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

export type Tab = 'transcribe' | 'style' | 'apply' | 'settings'
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
export type TranscribeState = 'idle' | 'running' | 'done' | 'error'
export type ApplyState = 'idle' | 'running' | 'done' | 'error'

interface AppStore {
  // Navigation
  activeTab: Tab
  setActiveTab: (tab: Tab) => void

  // Config
  config: AppConfig
  setConfig: (config: AppConfig) => void

  // Resolve Connection
  connectionState: ConnectionState
  connectionError: string | null
  timeline: TimelineInfo | null
  setConnectionState: (state: ConnectionState, error?: string | null, timeline?: TimelineInfo | null) => void

  // Templates
  templates: TemplateInfo[]
  selectedTemplate: TemplateInfo | null
  templatesLoading: boolean
  templatesError: string | null
  setTemplates: (t: TemplateInfo[]) => void
  setTemplatesLoading: (b: boolean) => void
  setTemplatesError: (e: string | null) => void
  setSelectedTemplate: (t: TemplateInfo | null) => void

  // Transcription
  transcribeState: TranscribeState
  transcribeProgress: number
  transcribeError: string | null
  transcribeResult: TranscribeResult | null
  wordTimingAvailable: boolean
  rawWords: WordToken[]
  rawPhrases: PhraseToken[]
  setTranscribeState: (s: TranscribeState, err?: string | null) => void
  setTranscribeProgress: (p: number) => void
  setTranscribeResult: (r: TranscribeResult) => void

  // Cues (after segmentation + manual edit)
  cues: CaptionCue[]
  setCues: (cues: CaptionCue[]) => void
  updateCue: (index: number, patch: Partial<CaptionCue>) => void

  // Apply
  applyState: ApplyState
  applyProgress: { current: number; total: number }
  applyError: string | null
  setApplyState: (s: ApplyState, err?: string | null) => void
  setApplyProgress: (p: { current: number; total: number }) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Navigation
  activeTab: 'transcribe',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Config
  config: DEFAULT_CONFIG,
  setConfig: (config) => set({ config }),

  // Resolve Connection
  connectionState: 'disconnected',
  connectionError: null,
  timeline: null,
  setConnectionState: (state, error = null, timeline = null) =>
    set({ connectionState: state, connectionError: error, timeline }),

  // Templates
  templates: [],
  selectedTemplate: null,
  templatesLoading: false,
  templatesError: null,
  setTemplates: (templates) => set({ templates }),
  setTemplatesLoading: (b) => set({ templatesLoading: b }),
  setTemplatesError: (e) => set({ templatesError: e }),
  setSelectedTemplate: (t) => set({ selectedTemplate: t }),

  // Transcription
  transcribeState: 'idle',
  transcribeProgress: 0,
  transcribeError: null,
  transcribeResult: null,
  wordTimingAvailable: false,
  rawWords: [],
  rawPhrases: [],
  setTranscribeState: (s, err = null) => set({ transcribeState: s, transcribeError: err }),
  setTranscribeProgress: (p) => set({ transcribeProgress: p }),
  setTranscribeResult: (r) => {
    set({
      transcribeResult: r,
      wordTimingAvailable: r.wordTimingAvailable,
      rawWords: r.words || [],
      rawPhrases: r.phrases || [],
      transcribeState: 'done',
    })
  },

  // Cues
  cues: [],
  setCues: (cues) => set({ cues }),
  updateCue: (index, patch) => {
    const cues = [...get().cues]
    cues[index] = { ...cues[index], ...patch }
    set({ cues })
  },

  // Apply
  applyState: 'idle',
  applyProgress: { current: 0, total: 0 },
  applyError: null,
  setApplyState: (s, err = null) => set({ applyState: s, applyError: err }),
  setApplyProgress: (p) => set({ applyProgress: p }),
}))
