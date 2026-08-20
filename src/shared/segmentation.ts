// ============================================================
// Pesto Captions — Segmentation Engine
// Pure function: no side effects, fully unit-testable.
// Converts word/phrase tokens into CaptionCues with casing
// and punctuation normalization applied.
// ============================================================

import type {
  WordToken,
  PhraseToken,
  CaptionCue,
  TextRun,
  SegmentationConfig,
  CasingMode,
  PunctuationConfig,
} from './types'

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function applyCasing(text: string, mode: CasingMode): string {
  switch (mode) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'sentence': {
      const trimmed = text.trimStart()
      if (!trimmed) return text
      return text.slice(0, text.length - trimmed.length) + trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase()
    }
    default:
      return text
  }
}

function normalizePunctuation(text: string, cfg: PunctuationConfig): string {
  let t = text
  // Remove punctuation types that are disabled (set to false → strip from text)
  if (!cfg.comma) t = t.replace(/,/g, '')
  if (!cfg.period) t = t.replace(/\./g, '')
  if (!cfg.questionMark) t = t.replace(/\?/g, '')
  if (!cfg.exclamationMark) t = t.replace(/!/g, '')
  if (!cfg.quotes) t = t.replace(/["""'']/g, '')
  if (!cfg.dash) t = t.replace(/[-–—]/g, '')
  if (!cfg.semicolon) t = t.replace(/;/g, '')
  if (!cfg.colon) t = t.replace(/:/g, '')
  // Collapse double spaces produced by stripping
  t = t.replace(/  +/g, ' ').trim()
  return t
}

function parseEmphasisRuns(text: string): TextRun[] {
  // Parse **word** markup into runs
  const runs: TextRun[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index), emphasis: false })
    }
    runs.push({ text: match[1], emphasis: true })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), emphasis: false })
  }

  return runs.length > 0 ? runs : [{ text, emphasis: false }]
}

// ------------------------------------------------------------------
// Word-timed segmentation (Whisper path)
// ------------------------------------------------------------------

export function segmentFromWords(
  words: WordToken[],
  config: SegmentationConfig,
): CaptionCue[] {
  const cues: CaptionCue[] = []
  let group: WordToken[] = []
  let charCount = 0

  const flush = () => {
    if (group.length === 0) return

    let text = group.map(w => w.word).join(' ')
    text = normalizePunctuation(text, config.punctuation)
    text = applyCasing(text, config.casing)

    const startSec = group[0].start
    const endSec = group[group.length - 1].end
    const durationMs = (endSec - startSec) * 1000

    // Enforce minimum duration
    const effectiveEnd = durationMs < config.minDurationMs
      ? startSec + config.minDurationMs / 1000
      : endSec

    cues.push({
      cueIndex: cues.length + 1,
      startSec,
      endSec: effectiveEnd,
      runs: parseEmphasisRuns(text),
      timingEditable: true,
    })
    group = []
    charCount = 0
  }

  for (const word of words) {
    const wordText = word.word.trim()
    const wouldExceedChars = charCount + wordText.length + (group.length > 0 ? 1 : 0) > config.maxChars
    const wouldExceedWords = group.length >= config.maxWords

    if (group.length > 0 && (wouldExceedChars || wouldExceedWords)) {
      flush()
    }

    group.push(word)
    charCount += wordText.length + (group.length > 1 ? 1 : 0)
  }
  flush()

  // Gap filling: extend end of each cue to fill gap to next cue
  if (config.fillGapsMs > 0) {
    for (let i = 0; i < cues.length - 1; i++) {
      const gap = (cues[i + 1].startSec - cues[i].endSec) * 1000
      if (gap > 0 && gap <= config.fillGapsMs) {
        cues[i] = { ...cues[i], endSec: cues[i + 1].startSec }
      }
    }
  }

  // Enforce max duration (split long cues if needed — simple clamp)
  return cues.map(cue => {
    const dur = (cue.endSec - cue.startSec) * 1000
    if (dur > config.maxDurationMs) {
      return { ...cue, endSec: cue.startSec + config.maxDurationMs / 1000 }
    }
    return cue
  })
}

// ------------------------------------------------------------------
// Phrase-only segmentation (native Resolve path when no word-timing)
// ------------------------------------------------------------------

export function segmentFromPhrases(
  phrases: PhraseToken[],
  config: SegmentationConfig,
): CaptionCue[] {
  return phrases.map((phrase, i) => {
    let text = normalizePunctuation(phrase.text, config.punctuation)
    text = applyCasing(text, config.casing)

    const durationMs = (phrase.end - phrase.start) * 1000
    const effectiveEnd = durationMs < config.minDurationMs
      ? phrase.start + config.minDurationMs / 1000
      : phrase.end

    return {
      cueIndex: i + 1,
      startSec: phrase.start,
      endSec: effectiveEnd,
      runs: [{ text, emphasis: false }],  // No emphasis without word-timing
      timingEditable: false,
    }
  })
}

// ------------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------------

export function segmentCues(
  input: { words: WordToken[] } | { phrases: PhraseToken[] },
  config: SegmentationConfig,
): CaptionCue[] {
  if ('words' in input) {
    return segmentFromWords(input.words, config)
  }
  return segmentFromPhrases(input.phrases, config)
}

// ------------------------------------------------------------------
// SRT/VTT parsing
// ------------------------------------------------------------------

export function parseSRT(content: string): PhraseToken[] {
  const blocks = content.trim().split(/\n\n+/)
  const phrases: PhraseToken[] = []

  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 3) continue

    const timingLine = lines.find(l => l.includes('-->'))
    if (!timingLine) continue

    const [startStr, endStr] = timingLine.split('-->')
    const start = parseSRTTimestamp(startStr.trim())
    const end = parseSRTTimestamp(endStr.trim())
    const text = lines.slice(lines.indexOf(timingLine) + 1).join(' ').trim()

    if (!isNaN(start) && !isNaN(end) && text) {
      phrases.push({ text, start, end })
    }
  }

  return phrases
}

export function parseVTT(content: string): PhraseToken[] {
  const body = content.replace(/^WEBVTT.*\n/, '').trim()
  return parseSRT(body)
}

function parseSRTTimestamp(ts: string): number {
  // HH:MM:SS,mmm or HH:MM:SS.mmm
  const clean = ts.replace(',', '.')
  const parts = clean.split(':')
  if (parts.length !== 3) return NaN
  const [h, m, s] = parts.map(Number)
  return h * 3600 + m * 60 + s
}

// ------------------------------------------------------------------
// Utility: format seconds to SRT timestamp string
// ------------------------------------------------------------------

export function formatSRTTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${padMs(ms)}`
}

function pad(n: number) { return String(n).padStart(2, '0') }
function padMs(n: number) { return String(n).padStart(3, '0') }

export function exportSRT(cues: CaptionCue[]): string {
  return cues.map(cue => {
    const text = cue.runs.map(r => r.text).join('')
    return `${cue.cueIndex}\n${formatSRTTimestamp(cue.startSec)} --> ${formatSRTTimestamp(cue.endSec)}\n${text}`
  }).join('\n\n')
}
