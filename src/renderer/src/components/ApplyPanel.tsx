import React, { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../store'

export default function ApplyPanel() {
  const {
    config,
    cues,
    selectedTemplate,
    applyState, setApplyState,
    applyProgress, setApplyProgress,
    applyError,
    connectionState,
    setActiveTab,
  } = useAppStore()

  const [trackTarget, setTrackTarget] = useState(0)  // 0 = new track
  const [presets, setPresets] = useState<string[]>([])
  const [selectedPreset, setSelectedPreset] = useState('')
  const [renderStarted, setRenderStarted] = useState(false)

  // Listen for apply progress events
  useEffect(() => {
    if (!window.pesto) return
    const unsub = window.pesto.on('captions:apply:progress', (p: unknown) => {
      const prog = p as { cueIndex: number; total: number }
      setApplyProgress({ current: prog.cueIndex, total: prog.total })
    })
    return unsub
  }, [])

  // Load render presets
  useEffect(() => {
    if (connectionState !== 'connected') return
    window.pesto.listPresets().then(r => {
      if (r.ok && Array.isArray(r.data)) {
        setPresets((r.data as { name: string }[]).map(p => p.name))
      }
    }).catch(console.error)
  }, [connectionState])

  const handleApply = useCallback(async () => {
    if (!selectedTemplate || cues.length === 0) return
    setApplyState('running')
    setApplyProgress({ current: 0, total: cues.length })

    try {
      const result = await window.pesto.applyCaptions(cues, selectedTemplate.clipName, trackTarget, config.binName)
      if (result.ok) {
        setApplyState('done')
      } else {
        setApplyState('error', result.error || 'Anwenden fehlgeschlagen')
      }
    } catch (e) {
      setApplyState('error', (e as Error).message)
    }
  }, [selectedTemplate, cues, trackTarget, setApplyState, setApplyProgress])

  const handleRender = useCallback(async () => {
    if (!selectedPreset) return
    setRenderStarted(true)
    await window.pesto.startRender(selectedPreset)
  }, [selectedPreset])

  const pct = applyProgress.total > 0
    ? Math.round((applyProgress.current / applyProgress.total) * 100)
    : 0

  const canApply = connectionState === 'connected' &&
    cues.length > 0 &&
    !!selectedTemplate &&
    applyState !== 'running'

  return (
    <div className="panel fade-in">
      {/* Summary */}
      <div className="card">
        <div className="card-title">Zusammenfassung</div>
        <div className="apply-summary">
          <div className="apply-stat">
            <div className="apply-stat-val">{cues.length}</div>
            <div className="apply-stat-label">Cues</div>
          </div>
          <div className="apply-stat">
            <div className="apply-stat-val" style={{ color: selectedTemplate ? 'var(--c-accent)' : 'var(--c-text-3)' }}>
              {selectedTemplate ? '✓' : '–'}
            </div>
            <div className="apply-stat-label">Template</div>
          </div>
          <div className="apply-stat">
            <div className="apply-stat-val" style={{ color: connectionState === 'connected' ? 'var(--c-accent)' : 'var(--c-text-3)' }}>
              {connectionState === 'connected' ? '✓' : '✕'}
            </div>
            <div className="apply-stat-label">Resolve</div>
          </div>
        </div>

        {selectedTemplate && (
          <div className="text-sm text-muted mb-2">
            Template: <strong style={{ color: 'var(--c-text)' }}>{selectedTemplate.clipName}</strong>
          </div>
        )}

        {!selectedTemplate && (
          <div className="alert alert-warning" role="status">
            <span className="alert-icon">⚠️</span>
            Kein Template ausgewählt.{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('style')}>
              → Template wählen
            </button>
          </div>
        )}

        {cues.length === 0 && (
          <div className="alert alert-info" role="status">
            <span className="alert-icon">ℹ️</span>
            Kein Transkript.{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('transcribe')}>
              → Transkription starten
            </button>
          </div>
        )}
      </div>

      {/* Target Track */}
      <div className="card">
        <div className="card-title">Ziel-Videospur</div>
        <div className="track-select">
          <label htmlFor="track-target">Spur-Index</label>
          <select
            id="track-target"
            value={trackTarget}
            onChange={e => setTrackTarget(Number(e.target.value))}
            style={{ width: 200 }}
          >
            <option value={0}>Neue Spur anlegen (empfohlen)</option>
            {[1,2,3,4,5,6,7,8].map(n => (
              <option key={n} value={n}>Spur {n} (überschreiben)</option>
            ))}
          </select>
        </div>
      </div>

      {/* Apply Button + Progress */}
      <div className="card">
        <div className="flex gap-2 items-center mb-3">
          <button
            id="apply-captions-btn"
            className="btn btn-primary btn-lg"
            onClick={handleApply}
            disabled={!canApply}
            aria-label={`${cues.length} Captions auf Timeline anwenden`}
          >
            {applyState === 'running' ? (
              <><span className="spinner" aria-hidden="true" /> Wende an … ({applyProgress.current}/{applyProgress.total})</>
            ) : (
              <><span aria-hidden="true">✨</span> {cues.length} Captions anwenden</>
            )}
          </button>
        </div>

        {applyState === 'running' && (
          <div aria-live="polite" aria-label={`Fortschritt: ${pct}%`}>
            <div className="progress-wrap" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-label">
              Cue {applyProgress.current} von {applyProgress.total}
            </div>
          </div>
        )}

        {applyState === 'done' && (
          <div className="alert alert-success" role="status">
            <span className="alert-icon">🎉</span>
            Alle {cues.length} Captions erfolgreich auf die Timeline angewendet!
          </div>
        )}

        {applyState === 'error' && applyError && (
          <div className="alert alert-error" role="alert">
            <span className="alert-icon">⚠️</span>
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: 12 }}>{applyError}</pre>
          </div>
        )}
      </div>

      {/* Re-style */}
      {applyState === 'done' && (
        <div className="card">
          <div className="card-title">Nachträgliches Re-Styling</div>
          <p className="text-sm text-muted mb-3">
            Wähle ein anderes Template und wende es erneut an — das Timing und die Texte bleiben erhalten.
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setActiveTab('style')}
          >
            🎨 Anderes Template wählen
          </button>
        </div>
      )}

      {/* Deliver */}
      {presets.length > 0 && (
        <div className="card">
          <div className="card-title">Render starten (optional)</div>
          <div className="flex gap-2 items-center">
            <select
              id="render-preset-select"
              value={selectedPreset}
              onChange={e => setSelectedPreset(e.target.value)}
              style={{ flex: 1 }}
              aria-label="Render-Preset auswählen"
            >
              <option value="">— Preset wählen —</option>
              {presets.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              id="start-render-btn"
              className="btn btn-secondary"
              onClick={handleRender}
              disabled={!selectedPreset || renderStarted}
              aria-label="Render-Queue starten"
            >
              {renderStarted ? '⏳ Render läuft …' : '▶ Render starten'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
