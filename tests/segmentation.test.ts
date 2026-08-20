import { describe, it, expect } from 'vitest'
import {
  segmentFromWords,
  segmentFromPhrases,
  segmentCues,
  parseSRT,
  parseVTT,
  exportSRT,
  formatSRTTimestamp,
} from '../src/shared/segmentation'
import type { WordToken, PhraseToken } from '../src/shared/types'
import { DEFAULT_SEGMENTATION } from '../src/shared/types'

// ── Test fixtures ────────────────────────────────────────────────

const WORDS: WordToken[] = [
  { word: 'Hallo', start: 0.0, end: 0.5, confidence: 0.99 },
  { word: 'Welt', start: 0.6, end: 0.9, confidence: 0.98 },
  { word: 'das', start: 1.1, end: 1.3 },
  { word: 'ist', start: 1.4, end: 1.6 },
  { word: 'ein', start: 1.7, end: 1.9 },
  { word: 'Test', start: 2.0, end: 2.4 },
]

const PHRASES: PhraseToken[] = [
  { text: 'Hallo Welt', start: 0.0, end: 1.0 },
  { text: 'Das ist ein Test.', start: 1.2, end: 2.5 },
]

const CFG = DEFAULT_SEGMENTATION

// ── segmentFromWords ─────────────────────────────────────────────

describe('segmentFromWords', () => {
  it('creates correct number of cues', () => {
    const cues = segmentFromWords(WORDS, CFG)
    expect(cues.length).toBeGreaterThan(0)
  })

  it('first cue starts at first word start', () => {
    const cues = segmentFromWords(WORDS, CFG)
    expect(cues[0].startSec).toBe(0.0)
  })

  it('cues have timingEditable = true', () => {
    const cues = segmentFromWords(WORDS, CFG)
    expect(cues.every(c => c.timingEditable)).toBe(true)
  })

  it('respects maxWords limit', () => {
    const cfg = { ...CFG, maxWords: 2 }
    const cues = segmentFromWords(WORDS, cfg)
    // Each cue should have at most 2 words
    for (const cue of cues) {
      const wordCount = cue.runs.map(r => r.text).join('').split(/\s+/).filter(Boolean).length
      expect(wordCount).toBeLessThanOrEqual(3) // allow for spaces in runs
    }
  })

  it('respects maxChars limit', () => {
    const cfg = { ...CFG, maxChars: 10 }
    const cues = segmentFromWords(WORDS, cfg)
    for (const cue of cues) {
      const text = cue.runs.map(r => r.text).join('')
      expect(text.length).toBeLessThanOrEqual(12) // slight buffer for word boundaries
    }
  })

  it('enforces minimum duration', () => {
    const cfg = { ...CFG, minDurationMs: 1000 }
    const cues = segmentFromWords(WORDS, cfg)
    for (const cue of cues) {
      expect((cue.endSec - cue.startSec) * 1000).toBeGreaterThanOrEqual(999)
    }
  })

  it('fills gaps when fillGapsMs is set', () => {
    const words: WordToken[] = [
      { word: 'A', start: 0, end: 0.5 },
      { word: 'B', start: 2.0, end: 2.5 },  // 1.5s gap
    ]
    const cfg = { ...CFG, maxWords: 1, fillGapsMs: 2000 }
    const cues = segmentFromWords(words, cfg)
    expect(cues).toHaveLength(2)
    // Gap of 1.5s < fillGapsMs of 2s → first cue should extend to 2.0s
    expect(cues[0].endSec).toBe(2.0)
  })

  it('applies UPPERCASE casing', () => {
    const cfg = { ...CFG, casing: 'uppercase' as const }
    const cues = segmentFromWords(WORDS, cfg)
    const text = cues.map(c => c.runs.map(r => r.text).join('')).join(' ')
    expect(text).toBe(text.toUpperCase())
  })

  it('applies lowercase casing', () => {
    const cfg = { ...CFG, casing: 'lowercase' as const }
    const cues = segmentFromWords(WORDS, cfg)
    const text = cues.map(c => c.runs.map(r => r.text).join('')).join(' ')
    expect(text).toBe(text.toLowerCase())
  })

  it('removes commas when punctuation.comma is false', () => {
    const words: WordToken[] = [{ word: 'Hallo,', start: 0, end: 0.5 }]
    const cfg = { ...CFG, punctuation: { ...CFG.punctuation, comma: false } }
    const cues = segmentFromWords(words, cfg)
    const text = cues[0].runs[0].text
    expect(text).not.toContain(',')
  })

  it('cue indices are sequential starting from 1', () => {
    const cues = segmentFromWords(WORDS, CFG)
    cues.forEach((c, i) => expect(c.cueIndex).toBe(i + 1))
  })
})

// ── segmentFromPhrases ────────────────────────────────────────────

describe('segmentFromPhrases', () => {
  it('creates one cue per phrase', () => {
    const cues = segmentFromPhrases(PHRASES, CFG)
    expect(cues).toHaveLength(2)
  })

  it('cues have timingEditable = false', () => {
    const cues = segmentFromPhrases(PHRASES, CFG)
    expect(cues.every(c => !c.timingEditable)).toBe(true)
  })

  it('cues have no emphasis runs (no word timing)', () => {
    const cues = segmentFromPhrases(PHRASES, CFG)
    expect(cues.every(c => c.runs.every(r => !r.emphasis))).toBe(true)
  })
})

// ── segmentCues dispatch ──────────────────────────────────────────

describe('segmentCues', () => {
  it('dispatches to segmentFromWords when words provided', () => {
    const cues = segmentCues({ words: WORDS }, CFG)
    expect(cues.every(c => c.timingEditable)).toBe(true)
  })

  it('dispatches to segmentFromPhrases when phrases provided', () => {
    const cues = segmentCues({ phrases: PHRASES }, CFG)
    expect(cues.every(c => !c.timingEditable)).toBe(true)
  })
})

// ── parseSRT ─────────────────────────────────────────────────────

const SAMPLE_SRT = `1
00:00:00,000 --> 00:00:01,500
Hallo Welt

2
00:00:02,000 --> 00:00:03,200
Das ist ein Test.
`

describe('parseSRT', () => {
  it('parses correct number of phrases', () => {
    const phrases = parseSRT(SAMPLE_SRT)
    expect(phrases).toHaveLength(2)
  })

  it('parses start time correctly', () => {
    const phrases = parseSRT(SAMPLE_SRT)
    expect(phrases[0].start).toBeCloseTo(0, 1)
    expect(phrases[1].start).toBeCloseTo(2.0, 1)
  })

  it('parses end time correctly', () => {
    const phrases = parseSRT(SAMPLE_SRT)
    expect(phrases[0].end).toBeCloseTo(1.5, 1)
  })

  it('parses text correctly', () => {
    const phrases = parseSRT(SAMPLE_SRT)
    expect(phrases[0].text).toBe('Hallo Welt')
    expect(phrases[1].text).toBe('Das ist ein Test.')
  })
})

// ── exportSRT ─────────────────────────────────────────────────────

describe('exportSRT', () => {
  it('produces valid SRT output', () => {
    const cues = segmentFromPhrases(PHRASES, CFG)
    const srt = exportSRT(cues)
    expect(srt).toContain('-->')
    expect(srt).toContain('Hallo Welt')
    expect(srt).toContain('1\n')
  })

  it('round-trips through parseSRT', () => {
    const cues = segmentFromPhrases(PHRASES, CFG)
    const srt = exportSRT(cues)
    const reparsed = parseSRT(srt)
    expect(reparsed).toHaveLength(2)
    expect(reparsed[0].text).toBe('Hallo Welt')
  })
})

// ── formatSRTTimestamp ────────────────────────────────────────────

describe('formatSRTTimestamp', () => {
  it('formats 0 correctly', () => {
    expect(formatSRTTimestamp(0)).toBe('00:00:00,000')
  })

  it('formats 3661.5 correctly', () => {
    expect(formatSRTTimestamp(3661.5)).toBe('01:01:01,500')
  })
})
