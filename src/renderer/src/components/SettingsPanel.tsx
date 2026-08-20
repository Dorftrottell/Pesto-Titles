import React, { useState, useCallback } from 'react'
import { useAppStore } from '../store'
import { DEFAULT_CONFIG, DEFAULT_SEGMENTATION } from '@shared/types'
import type { SegmentationConfig } from '@shared/types'

export default function SettingsPanel() {
  const { config, setConfig } = useAppStore()
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [diagnosticsMsg, setDiagnosticsMsg] = useState<string | null>(null)
  const [newPresetName, setNewPresetName] = useState('')

  const save = useCallback(async (cfg = config) => {
    await window.pesto.setConfig(cfg)
    setSavedMsg('Gespeichert ✓')
    setTimeout(() => setSavedMsg(null), 2000)
  }, [config])

  const handleSavePreset = useCallback(() => {
    if (!newPresetName.trim()) return
    const newConfig = {
      ...config,
      presets: {
        ...config.presets,
        [newPresetName.trim()]: { ...config.segmentation },
      },
    }
    setConfig(newConfig)
    save(newConfig)
    setNewPresetName('')
  }, [config, newPresetName, save, setConfig])

  const handleLoadPreset = useCallback((name: string) => {
    const preset = config.presets[name]
    if (!preset) return
    const newConfig = { ...config, segmentation: preset }
    setConfig(newConfig)
    save(newConfig)
  }, [config, save, setConfig])

  const handleDeletePreset = useCallback((name: string) => {
    const newPresets = { ...config.presets }
    delete newPresets[name]
    const newConfig = { ...config, presets: newPresets }
    setConfig(newConfig)
    save(newConfig)
  }, [config, save, setConfig])

  const handleExportPreset = useCallback((name: string) => {
    const preset = config.presets[name]
    if (!preset) return
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pesto-preset-${name.replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [config.presets])

  const handleImportPreset = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(text => {
      const preset = JSON.parse(text) as SegmentationConfig
      const name = file.name.replace(/\.json$/, '').replace(/^pesto-preset-/, '')
      const newConfig = {
        ...config,
        presets: { ...config.presets, [name]: preset },
      }
      setConfig(newConfig)
      save(newConfig)
    }).catch(console.error)
  }, [config, save, setConfig])

  const handleDiagnosticsExport = useCallback(async () => {
    const result = await window.pesto.exportDiagnostics()
    if (result.ok) {
      setDiagnosticsMsg(`Exportiert nach: ${result.path}`)
    } else {
      setDiagnosticsMsg(`Fehler: ${result.error}`)
    }
  }, [])

  const handleResetDefaults = useCallback(() => {
    const newConfig = { ...config, segmentation: DEFAULT_SEGMENTATION }
    setConfig(newConfig)
    save(newConfig)
  }, [config, save, setConfig])

  return (
    <div className="panel fade-in">
      {/* Connection Settings */}
      <div className="settings-section">
        <div className="settings-title">Resolve-Anbindung</div>
        <div className="card">
          <div className="form-group">
            <label htmlFor="bin-name-input">Name des Template-Bins (PowerBin / lokal)</label>
            <div className="flex gap-2 items-center">
              <input
                id="bin-name-input"
                type="text"
                value={config.binName}
                onChange={e => setConfig({ ...config, binName: e.target.value })}
                placeholder="Pesto Captions"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => save()}
                aria-label="Bin-Namen speichern"
              >
                Speichern
              </button>
            </div>
            <div className="text-sm text-muted">
              Erstelle in DaVinci Resolve einen PowerBin mit genau diesem Namen.
            </div>
          </div>
        </div>
      </div>

      {/* Default Engine */}
      <div className="settings-section">
        <div className="settings-title">Standard-Engine</div>
        <div className="card">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="default-engine">Standard-Transkriptions-Engine</label>
            <select
              id="default-engine"
              value={config.engine}
              onChange={e => {
                const newConfig = { ...config, engine: e.target.value as typeof config.engine }
                setConfig(newConfig)
                save(newConfig)
              }}
              style={{ width: 260 }}
            >
              <option value="native">Native Resolve-Transkription (empfohlen)</option>
              <option value="whisper-small">Whisper small</option>
              <option value="whisper-medium">Whisper medium</option>
            </select>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="settings-section">
        <div className="settings-title">Konfigurationspresets</div>
        <div className="card">
          {Object.keys(config.presets).length === 0 && (
            <div className="text-sm text-muted mb-3">Noch keine Presets gespeichert.</div>
          )}

          {Object.entries(config.presets).map(([name]) => (
            <div key={name} className="flex items-center gap-2 mb-2">
              <span style={{ flex: 1 }}>{name}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleLoadPreset(name)}
                aria-label={`Preset "${name}" laden`}
              >
                Laden
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleExportPreset(name)}
                aria-label={`Preset "${name}" exportieren`}
              >
                Export
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeletePreset(name)}
                aria-label={`Preset "${name}" löschen`}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="flex gap-2 items-center" style={{ marginTop: 12 }}>
            <input
              id="new-preset-name"
              type="text"
              placeholder="Preset-Name …"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
              style={{ flex: 1 }}
              aria-label="Name für neues Preset"
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSavePreset}
              disabled={!newPresetName.trim()}
              aria-label="Aktuelles Segmentierungs-Preset speichern"
            >
              Preset speichern
            </button>
          </div>

          <div className="flex gap-2 items-center" style={{ marginTop: 8 }}>
            <label
              htmlFor="import-preset-file"
              className="btn btn-ghost btn-sm"
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              📂 Preset importieren
            </label>
            <input
              id="import-preset-file"
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportPreset}
              aria-label="Preset-Datei auswählen"
            />
            <button className="btn btn-ghost btn-sm" onClick={handleResetDefaults}>
              ↺ Standardwerte
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostics */}
      <div className="settings-section">
        <div className="settings-title">Diagnose</div>
        <div className="card">
          <p className="text-sm text-muted mb-3">
            Exportiert die lokalen Log-Dateien (keine Nutzerdaten, keine Audio/Video) als ZIP-Datei.
            Ideal zum Anhängen an GitHub-Issues.
          </p>
          <button
            id="export-diagnostics-btn"
            className="btn btn-secondary"
            onClick={handleDiagnosticsExport}
            aria-label="Diagnosebericht exportieren"
          >
            📋 Diagnosebericht exportieren
          </button>
          {diagnosticsMsg && (
            <div
              className="alert alert-info"
              style={{ marginTop: 10, marginBottom: 0 }}
              role="status"
            >
              {diagnosticsMsg}
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="settings-section">
        <div className="settings-title">Über Pesto Captions</div>
        <div className="card">
          <div className="text-sm" style={{ lineHeight: 1.8 }}>
            <div><strong>Lizenz:</strong> AGPL-3.0</div>
            <div><strong>Version:</strong> 0.1.0 (Phase 1 MVP)</div>
            <div style={{ marginTop: 8, color: 'var(--c-text-3)' }}>
              Freie, quelloffene Caption-Integration für DaVinci Resolve Studio.<br />
              Kein Feature hinter einer Bezahlschranke. Kein Login. Keine Gerätebindung.
            </div>
            <div style={{ marginTop: 8 }}>
              <a
                href="https://github.com/pesto-captions"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--c-accent)' }}
              >
                GitHub →
              </a>
            </div>
          </div>
        </div>
      </div>

      {savedMsg && (
        <div
          className="alert alert-success"
          role="status"
          style={{ position: 'fixed', bottom: 20, right: 20, width: 'auto', zIndex: 9999 }}
        >
          <span className="alert-icon">✅</span> {savedMsg}
        </div>
      )}
    </div>
  )
}
