import React, { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store'
import TranscriptEditor from './TranscriptEditor'
import type { TranscribeResult, WordToken, PhraseToken } from '@shared/types'
import { segmentCues } from '@shared/segmentation'

const ENGINE_INFO = {
  native: {
    badge: 'Standard',
    name: 'Native Resolve-Transkription',
    desc: 'Schnell, kein Download nötig. Wort-genaues Timing evtl. eingeschränkt (abhängig von Resolve-Version).',
  },
  'whisper-small': {
    badge: 'Whisper small',
    name: 'Whisper (small)',
    desc: 'Benötigt Modell-Download (~450 MB). Garantiert Wort-für-Wort-Timing. Schneller als medium.',
  },
  'whisper-medium': {
    badge: 'Whisper medium',
    name: 'Whisper (medium)',
    desc: 'Benötigt Modell-Download (~1.5 GB). Genaueste Ergebnisse, langsamer. Ideal für schwierige Aufnahmen.',
  },
}

export default function TranscriptionPanel() {
  const {
    config, setConfig,
    connectionState,
    transcribeState, setTranscribeState, setTranscribeProgress,
    transcribeProgress, transcribeError,
    setTranscribeResult,
    cues, setCues,
    wordTimingAvailable,
    rawWords, rawPhrases,
    setActiveTab,
  } = useAppStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  // Listen for progress events from main process
  useEffect(() => {
    if (!window.pesto) return
    const unsub = window.pesto.on('transcribe:progress', (p: unknown) => {
      const prog = p as { current: number; total: number }
      const pct = prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 0
      setTranscribeProgress(pct)
    })
    return unsub
  }, [])

  const handleStartTranscription = useCallback(async () => {
    if (connectionState !== 'connected') return
    abortRef.current = false
    setTranscribeState('running')
    setTranscribeProgress(0)

    try {
      const engine = config.engine
      const modelSize = engine === 'whisper-medium' ? 'medium' : 'small'
      const result = await window.pesto.startTranscription({
        engine: engine === 'native' ? 'native' : 'whisper',
        modelSize: engine !== 'native' ? modelSize : undefined,
        language: config.language,
      })

      if (!result.ok) {
        setTranscribeState('error', result.error || 'Transkription fehlgeschlagen')
        return
      }

      const data = result.data as TranscribeResult
      setTranscribeResult(data)

      // Auto-segment
      const input = data.wordTimingAvailable
        ? { words: data.words as WordToken[] }
        : { phrases: (data.phrases || []) as PhraseToken[] }
      const generatedCues = segmentCues(input, config.segmentation)
      setCues(generatedCues)

    } catch (e) {
      setTranscribeState('error', (e as Error).message)
    }
  }, [connectionState, config, setTranscribeState, setTranscribeProgress, setTranscribeResult, setCues])

  const handleFileImport = useCallback(async (file: File) => {
    const content = await file.text()
    const format = file.name.endsWith('.vtt') ? 'vtt' : 'srt'
    setTranscribeState('running')

    try {
      const result = await window.pesto.importFile(content, format)
      if (!result.ok) {
        setTranscribeState('error', result.error)
        return
      }
      const data = result.data as TranscribeResult
      setTranscribeResult(data)
      const input = { phrases: (data.phrases || []) as PhraseToken[] }
      const generatedCues = segmentCues(input, config.segmentation)
      setCues(generatedCues)
    } catch (e) {
      setTranscribeState('error', (e as Error).message)
    }
  }, [config.segmentation, setTranscribeState, setTranscribeResult, setCues])

  const handleDropzoneClick = () => fileInputRef.current?.click()

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileImport(file)
  }, [handleFileImport])

  const selectedEngine = config.engine
  const engineInfo = ENGINE_INFO[selectedEngine as keyof typeof ENGINE_INFO]

  return (
    <div className="panel fade-in">
      {/* Engine Selection */}
      <div className="card">
        <div className="card-title">Transkriptions-Engine</div>
        <div className="engine-cards" role="radiogroup" aria-label="Transkriptions-Engine wählen">
          {(Object.entries(ENGINE_INFO) as [string, typeof ENGINE_INFO[keyof typeof ENGINE_INFO]][]).map(([id, info]) => (
            <label
              key={id}
              className={`engine-card ${selectedEngine === id ? 'selected' : ''}`}
              htmlFor={`engine-${id}`}
            >
              <input
                type="radio"
                id={`engine-${id}`}
                name="engine"
                value={id}
                checked={selectedEngine === id}
                onChange={() => setConfig({ ...config, engine: id as typeof config.engine })}
              />
              <div className="engine-badge">{info.badge}</div>
              <div className="engine-name">{info.name}</div>
              <div className="engine-desc">{info.desc}</div>
            </label>
          ))}
        </div>

        {/* Language */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="language-select">Sprache</label>
          <select
            id="language-select"
            value={config.language}
            onChange={e => setConfig({ ...config, language: e.target.value })}
            style={{ width: 220 }}
          >
            <option value="auto">🌍 Automatisch erkennen</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="en">🇬🇧 English</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="es">🇪🇸 Español</option>
            <option value="it">🇮🇹 Italiano</option>
            <option value="ja">🇯🇵 日本語</option>
            <option value="zh">🇨🇳 中文</option>
            <option value="pt">🇵🇹 Português</option>
            <option value="ru">🇷🇺 Русский</option>
            <option value="ko">🇰🇷 한국어</option>
          </select>
        </div>
      </div>

      {/* Action Row */}
      <div className="card">
        <div className="flex gap-2 items-center" style={{ marginBottom: 12 }}>
          <button
            id="start-transcription-btn"
            className="btn btn-primary btn-lg"
            onClick={handleStartTranscription}
            disabled={connectionState !== 'connected' || transcribeState === 'running'}
            aria-label="Transkription starten"
          >
            {transcribeState === 'running' ? (
              <><span className="spinner" aria-hidden="true" /> Transkribiere …</>
            ) : (
              <><span aria-hidden="true">🎙️</span> Transkription starten</>
            )}
          </button>

          {connectionState !== 'connected' && (
            <span className="text-sm text-muted">Bitte zuerst mit Resolve verbinden.</span>
          )}
        </div>

        {/* Progress */}
        {transcribeState === 'running' && (
          <div aria-live="polite" aria-label={`Fortschritt: ${transcribeProgress}%`}>
            <div className="progress-wrap" role="progressbar" aria-valuenow={transcribeProgress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${transcribeProgress}%` }} />
            </div>
            <div className="progress-label">{transcribeProgress}% — {engineInfo.name} läuft …</div>
          </div>
        )}

        {/* Error */}
        {transcribeState === 'error' && transcribeError && (
          <div className="alert alert-error" role="alert">
            <span className="alert-icon">⚠️</span>
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: 12 }}>{transcribeError}</pre>
          </div>
        )}

        {/* Word-timing warning */}
        {transcribeState === 'done' && !wordTimingAvailable && (
          <div className="alert alert-warning" role="status">
            <span className="alert-icon">ℹ️</span>
            <div>
              <strong>Wort-genaues Timing nicht verfügbar.</strong><br />
              Die native Transkription dieser Resolve-Version liefert keine Wort-Zeitstempel.
              Wortbasierte Funktionen (Emphasis-Markup) sind für diesen Lauf deaktiviert.<br />
              <span className="text-sm">Für garantiertes Wort-Timing: <strong>Whisper small oder medium</strong> wählen.</span>
            </div>
          </div>
        )}

        {transcribeState === 'done' && wordTimingAvailable && (
          <div className="alert alert-success" role="status">
            <span className="alert-icon">✅</span>
            Wort-genaues Timing verfügbar — Emphasis-Markup (<code>**Wort**</code>) nutzbar.
          </div>
        )}
      </div>

      {/* SRT/VTT Import */}
      <div className="card">
        <div className="card-title">Datei-Import (SRT / VTT)</div>
        <div
          className="drop-zone"
          onClick={handleDropzoneClick}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          role="button"
          tabIndex={0}
          aria-label="SRT oder VTT Datei importieren — hier klicken oder Datei hineinziehen"
          onKeyDown={e => e.key === 'Enter' && handleDropzoneClick()}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
          <div className="font-medium mb-2">SRT oder VTT Datei importieren</div>
          <div className="text-sm text-muted">Klicken oder Datei hierher ziehen</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.vtt"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFileImport(file)
            }}
            aria-label="Datei auswählen"
          />
        </div>
      </div>

      {/* Transcript Editor */}
      {cues.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="card-title" style={{ margin: 0 }}>
              Transkript bearbeiten ({cues.length} Cues)
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('style')}
              aria-label="Weiter zu Stil und Templates"
            >
              Weiter: Stil & Templates →
            </button>
          </div>
          <TranscriptEditor />
        </div>
      )}
    </div>
  )
}
