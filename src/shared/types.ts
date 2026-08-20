// ============================================================
// Pesto Captions — Shared Types
// Used by both main process and renderer.
// ============================================================

export type TranscriptionEngine = 'native' | 'whisper-small' | 'whisper-medium'

export type CasingMode = 'unchanged' | 'uppercase' | 'lowercase' | 'sentence'

export interface PunctuationConfig {
  comma: boolean
  period: boolean
  questionMark: boolean
  exclamationMark: boolean
  quotes: boolean
  dash: boolean
  semicolon: boolean
  colon: boolean
}

export interface SegmentationConfig {
  maxChars: number
  maxWords: number
  minDurationMs: number
  maxDurationMs: number
  fillGapsMs: number
  casing: CasingMode
  punctuation: PunctuationConfig
}

export interface AppConfig {
  binName: string
  engine: TranscriptionEngine
  language: string
  segmentation: SegmentationConfig
  presets: Record<string, SegmentationConfig>
}

export interface WordToken {
  word: string
  start: number   // seconds
  end: number     // seconds
  confidence?: number
}

export interface PhraseToken {
  text: string
  start: number   // seconds
  end: number     // seconds
}

export interface TextRun {
  text: string
  emphasis: boolean
}

export interface CaptionCue {
  cueIndex: number
  startSec: number
  endSec: number
  runs: TextRun[]
  /** Whether timing boundaries can be edited (requires word-timing) */
  timingEditable: boolean
}

export interface TimelineInfo {
  projectName: string
  timelineName: string
  frameRate: number
  startTimecode: string
  videoTrackCount: number
  audioTrackCount: number
}

export interface TemplateInfo {
  clipName: string
  thumbnail: string | null   // base64 PNG or null
  sourceBinType: 'power' | 'local'
  nodeNameOk: boolean       // true if PestoText node found
  fallbackNodeName?: string // name of fallback node used
}

export interface RenderPreset {
  name: string
}

export interface TranscribeResult {
  wordTimingAvailable: boolean
  words?: WordToken[]
  phrases?: PhraseToken[]
}

export interface ApplyCaptionsPayload {
  cueListPath: string
  templateClipName: string
  trackTarget: number
}

export interface BridgeCommand {
  id: string
  cmd: string
  params?: Record<string, unknown>
}

export interface BridgeResponse {
  id: string
  ok: boolean
  data?: unknown
  error?: string
  progress?: { current: number; total: number }
}

/** Feature gates — intentionally empty. See spec §6.5 */
export const FEATURE_GATES: Record<string, never> = {}

export const DEFAULT_PUNCTUATION: PunctuationConfig = {
  comma: true,
  period: true,
  questionMark: true,
  exclamationMark: true,
  quotes: true,
  dash: true,
  semicolon: true,
  colon: true,
}

export const DEFAULT_SEGMENTATION: SegmentationConfig = {
  maxChars: 42,
  maxWords: 8,
  minDurationMs: 500,
  maxDurationMs: 5000,
  fillGapsMs: 0,
  casing: 'unchanged',
  punctuation: DEFAULT_PUNCTUATION,
}

export const DEFAULT_CONFIG: AppConfig = {
  binName: 'Pesto Captions',
  engine: 'native',
  language: 'auto',
  segmentation: DEFAULT_SEGMENTATION,
  presets: {},
}
