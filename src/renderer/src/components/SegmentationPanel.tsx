import React, { useCallback } from 'react'
import { useAppStore } from '../store'
import { segmentCues } from '@shared/segmentation'
import type { SegmentationConfig, CasingMode, WordToken, PhraseToken } from '@shared/types'

const PUNCT_LABELS: Record<string, string> = {
  comma: ', Komma',
  period: '. Punkt',
  questionMark: '? Fragezeichen',
  exclamationMark: '! Ausrufezeichen',
  quotes: '„" Anführung',
  dash: '– Gedankenstrich',
  semicolon: '; Semikolon',
  colon: ': Doppelpunkt',
}

export default function SegmentationPanel() {
  const { config, setConfig, rawWords, rawPhrases, wordTimingAvailable, setCues } = useAppStore()
  const seg = config.segmentation

  const update = useCallback((patch: Partial<SegmentationConfig>) => {
    const newSeg = { ...seg, ...patch }
    const newConfig = { ...config, segmentation: newSeg }
    setConfig(newConfig)

    // Re-segment live if we have transcription data
    if (rawWords.length > 0 || rawPhrases.length > 0) {
      const input = wordTimingAvailable
        ? { words: rawWords as WordToken[] }
        : { phrases: rawPhrases as PhraseToken[] }
      try {
        const newCues = segmentCues(input, newSeg)
        setCues(newCues)
      } catch (_) { /* ignore */ }
    }
  }, [seg, config, setConfig, rawWords, rawPhrases, wordTimingAvailable, setCues])

  return (
    <div className="card">
      <div className="card-title">Phrasenbildung & Stilregeln</div>

      {/* Max chars / words */}
      <div className="two-col">
        <div className="form-group">
          <label htmlFor="max-chars">Max. Zeichen pro Caption</label>
          <div className="slider-row">
            <input
              id="max-chars"
              type="range"
              min={20}
              max={120}
              value={seg.maxChars}
              onChange={e => update({ maxChars: Number(e.target.value) })}
              aria-label={`Max. Zeichen: ${seg.maxChars}`}
            />
            <span className="slider-val">{seg.maxChars}</span>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="max-words">Max. Wörter pro Caption</label>
          <div className="slider-row">
            <input
              id="max-words"
              type="range"
              min={2}
              max={20}
              value={seg.maxWords}
              onChange={e => update({ maxWords: Number(e.target.value) })}
              aria-label={`Max. Wörter: ${seg.maxWords}`}
            />
            <span className="slider-val">{seg.maxWords}</span>
          </div>
        </div>
      </div>

      {/* Duration */}
      <div className="two-col">
        <div className="form-group">
          <label htmlFor="min-dur">Min. Anzeigedauer (ms)</label>
          <input
            id="min-dur"
            type="number"
            min={100}
            max={5000}
            step={100}
            value={seg.minDurationMs}
            onChange={e => update({ minDurationMs: Number(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label htmlFor="max-dur">Max. Anzeigedauer (ms)</label>
          <input
            id="max-dur"
            type="number"
            min={1000}
            max={30000}
            step={500}
            value={seg.maxDurationMs}
            onChange={e => update({ maxDurationMs: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* Gap fill */}
      <div className="form-group">
        <label htmlFor="fill-gaps">Lücken auffüllen bis (ms, 0 = aus)</label>
        <div className="slider-row">
          <input
            id="fill-gaps"
            type="range"
            min={0}
            max={2000}
            step={50}
            value={seg.fillGapsMs}
            onChange={e => update({ fillGapsMs: Number(e.target.value) })}
            aria-label={`Lücken auffüllen: ${seg.fillGapsMs} ms`}
          />
          <span className="slider-val">{seg.fillGapsMs} ms</span>
        </div>
      </div>

      {/* Casing */}
      <div className="form-group">
        <label htmlFor="casing-select">Groß-/Kleinschreibung</label>
        <select
          id="casing-select"
          value={seg.casing}
          onChange={e => update({ casing: e.target.value as CasingMode })}
          style={{ width: 200 }}
        >
          <option value="unchanged">Unverändert</option>
          <option value="uppercase">GROSSBUCHSTABEN</option>
          <option value="lowercase">kleinbuchstaben</option>
          <option value="sentence">Satzmodus (erster Buchstabe groß)</option>
        </select>
      </div>

      {/* Punctuation */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Interpunktions-Normalisierung (deaktivieren = entfernen)</label>
        <div className="punct-grid" role="group" aria-label="Interpunktions-Einstellungen">
          {Object.entries(PUNCT_LABELS).map(([key, label]) => {
            const isActive = seg.punctuation[key as keyof typeof seg.punctuation]
            return (
              <button
                key={key}
                id={`punct-${key}`}
                className={`punct-toggle ${isActive ? 'active' : ''}`}
                onClick={() => update({
                  punctuation: {
                    ...seg.punctuation,
                    [key]: !isActive,
                  },
                })}
                aria-pressed={isActive}
                aria-label={`${label} ${isActive ? 'aktiviert' : 'deaktiviert'}`}
                type="button"
              >
                <span aria-hidden="true">{isActive ? '✓' : '✕'}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
