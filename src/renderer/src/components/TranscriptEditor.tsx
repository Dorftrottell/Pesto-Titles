import React, { useCallback } from 'react'
import { useAppStore } from '../store'
import { formatSRTTimestamp } from '@shared/segmentation'
import type { TextRun } from '@shared/types'

function runsToText(runs: TextRun[]): string {
  return runs.map(r => r.emphasis ? `**${r.text}**` : r.text).join('')
}

function textToRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) runs.push({ text: text.slice(lastIndex, match.index), emphasis: false })
    runs.push({ text: match[1], emphasis: true })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex), emphasis: false })
  return runs.length > 0 ? runs : [{ text, emphasis: false }]
}

export default function TranscriptEditor() {
  const { cues, updateCue, wordTimingAvailable } = useAppStore()

  const handleTextChange = useCallback((index: number, value: string) => {
    updateCue(index, { runs: textToRuns(value) })
  }, [updateCue])

  const handleTimingChange = useCallback((index: number, field: 'startSec' | 'endSec', value: string) => {
    const sec = parseTimestamp(value)
    if (!isNaN(sec)) updateCue(index, { [field]: sec })
  }, [updateCue])

  if (cues.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📝</span>
        <span className="empty-title">Noch kein Transkript</span>
        <span className="empty-desc">Starte die Transkription oder importiere eine SRT/VTT-Datei.</span>
      </div>
    )
  }

  return (
    <div
      className="transcript-list"
      role="list"
      aria-label={`Transkript mit ${cues.length} Cues`}
    >
      {cues.map((cue, i) => (
        <div
          key={cue.cueIndex}
          className="cue-row"
          role="listitem"
          aria-label={`Cue ${cue.cueIndex}`}
        >
          <span className="cue-index mono" aria-hidden="true">{String(cue.cueIndex).padStart(3, '0')}</span>

          <textarea
            id={`cue-text-${cue.cueIndex}`}
            className="cue-text-input w-full"
            value={runsToText(cue.runs)}
            onChange={e => handleTextChange(i, e.target.value)}
            rows={runsToText(cue.runs).length > 60 ? 2 : 1}
            aria-label={`Text für Cue ${cue.cueIndex}`}
            style={{ userSelect: 'text' }}
          />

          <div className="cue-timing">
            {cue.timingEditable ? (
              <>
                <input
                  id={`cue-start-${cue.cueIndex}`}
                  type="text"
                  defaultValue={formatSRTTimestamp(cue.startSec)}
                  onBlur={e => handleTimingChange(i, 'startSec', e.target.value)}
                  aria-label={`Startzeit Cue ${cue.cueIndex}`}
                  style={{ width: 90, textAlign: 'center' }}
                />
                <span aria-hidden="true">→</span>
                <input
                  id={`cue-end-${cue.cueIndex}`}
                  type="text"
                  defaultValue={formatSRTTimestamp(cue.endSec)}
                  onBlur={e => handleTimingChange(i, 'endSec', e.target.value)}
                  aria-label={`Endzeit Cue ${cue.cueIndex}`}
                  style={{ width: 90, textAlign: 'center' }}
                />
              </>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                {formatSRTTimestamp(cue.startSec)}<br />{formatSRTTimestamp(cue.endSec)}
              </span>
            )}
          </div>
        </div>
      ))}

      {!wordTimingAvailable && (
        <div className="text-sm text-muted" style={{ padding: '4px 2px' }}>
          ℹ️ Timing-Grenzen nicht bearbeitbar — kein Wort-Timing verfügbar.
        </div>
      )}
    </div>
  )
}

function parseTimestamp(ts: string): number {
  // Accepts HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS or SS
  const clean = ts.trim().replace(',', '.')
  const parts = clean.split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}
