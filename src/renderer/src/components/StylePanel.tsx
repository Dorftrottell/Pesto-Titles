import React, { useCallback, useEffect } from 'react'
import { useAppStore } from '../store'
import SegmentationPanel from './SegmentationPanel'
import type { TemplateInfo } from '@shared/types'

export default function StylePanel() {
  const {
    config,
    templates, selectedTemplate, templatesLoading, templatesError,
    setTemplates, setTemplatesLoading, setTemplatesError, setSelectedTemplate,
    connectionState,
    setActiveTab,
  } = useAppStore()

  const scanTemplates = useCallback(async () => {
    if (connectionState !== 'connected') return
    setTemplatesLoading(true)
    setTemplatesError(null)
    try {
      const result = await window.pesto.scanTemplates(config.binName)
      if (result.ok) {
        // Bridge now returns {templates, binCreated} instead of a plain array
        const payload = result.data as { templates?: TemplateInfo[]; binCreated?: boolean } | TemplateInfo[]
        const templateList: TemplateInfo[] = Array.isArray(payload)
          ? payload
          : (payload?.templates ?? [])
        const binCreated = !Array.isArray(payload) && payload?.binCreated

        setTemplates(templateList)

        if (binCreated) {
          setTemplatesError(
            `✅ Bin „${config.binName}“ wurde automatisch angelegt.\n\n` +
            'Der Bin ist noch leer. Wende jetzt Captions an — ' +
            'der verwendete Template-Clip wird automatisch dort abgelegt.'
          )
        } else if (templateList.length === 0) {
          setTemplatesError(
            `Bin „${config.binName}“ ist leer.\n\n` +
            'Füge Fusion-Title-Clips in den Bin ein und klicke auf „Aktualisieren“.'
          )
        }
      } else {
        setTemplatesError(result.error || 'Template-Scan fehlgeschlagen')
      }
    } catch (e) {
      setTemplatesError((e as Error).message)
    } finally {
      setTemplatesLoading(false)
    }
  }, [connectionState, config.binName, setTemplates, setTemplatesLoading, setTemplatesError])

  // Auto-scan when tab becomes active and connected
  useEffect(() => {
    if (connectionState === 'connected' && templates.length === 0) {
      scanTemplates()
    }
  }, [connectionState])

  return (
    <div className="panel fade-in">
      {/* Template Gallery */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="card-title" style={{ margin: 0 }}>
            Templates aus DaVinci Bin „{config.binName}"
          </div>
          <button
            id="refresh-templates-btn"
            className="btn btn-secondary btn-sm"
            onClick={scanTemplates}
            disabled={templatesLoading || connectionState !== 'connected'}
            aria-label="Template-Liste aktualisieren"
          >
            {templatesLoading ? (
              <><span className="spinner" aria-hidden="true" /> …</>
            ) : '↺ Aktualisieren'}
          </button>
        </div>

        {connectionState !== 'connected' && (
          <div className="alert alert-info" role="status">
            <span className="alert-icon">ℹ️</span>
            Bitte zuerst mit DaVinci Resolve verbinden, dann Templates laden.
          </div>
        )}

        {templatesError && (
          <div className="alert alert-warning" role="alert">
            <span className="alert-icon">📁</span>
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {templatesError}
            </pre>
          </div>
        )}

        {!templatesError && templates.length > 0 && (
          <div
            className="template-grid"
            role="listbox"
            aria-label="Templates"
            aria-multiselectable="false"
          >
            {templates.map(tmpl => (
              <div
                key={tmpl.clipName}
                id={`template-${tmpl.clipName.replace(/\s+/g, '-')}`}
                className={`template-card ${selectedTemplate?.clipName === tmpl.clipName ? 'selected' : ''}`}
                role="option"
                aria-selected={selectedTemplate?.clipName === tmpl.clipName}
                tabIndex={0}
                onClick={() => setSelectedTemplate(tmpl)}
                onKeyDown={e => e.key === 'Enter' && setSelectedTemplate(tmpl)}
                aria-label={`Template: ${tmpl.clipName} (${tmpl.sourceBinType === 'power' ? 'PowerBin' : 'lokaler Bin'})`}
              >
                <div className="template-thumb" aria-hidden="true">
                  {tmpl.thumbnail ? (
                    <img src={`data:image/png;base64,${tmpl.thumbnail}`} alt="" />
                  ) : (
                    <span className="template-thumb-placeholder">🎬</span>
                  )}
                  <span
                    className={`template-badge ${tmpl.sourceBinType === 'power' ? 'badge-power' : ''}`}
                  >
                    {tmpl.sourceBinType === 'power' ? 'PowerBin' : 'Lokal'}
                  </span>
                </div>
                <div className="template-name" title={tmpl.clipName}>{tmpl.clipName}</div>
              </div>
            ))}
          </div>
        )}

        {!templatesLoading && templates.length === 0 && connectionState === 'connected' && !templatesError && (
          <div className="empty-state">
            <span className="empty-icon">📂</span>
            <span className="empty-title">Kein Bin gefunden</span>
            <span className="empty-desc">
              Erstelle in Resolve einen PowerBin namens „{config.binName}" mit Fusion-Title-Clips
              und klicke auf Aktualisieren.
            </span>
            <button className="btn btn-secondary btn-sm" onClick={scanTemplates}>
              ↺ Erneut suchen
            </button>
          </div>
        )}

        {selectedTemplate && (
          <div className="alert alert-success" style={{ marginTop: 12, marginBottom: 0 }} role="status">
            <span className="alert-icon">✅</span>
            <div>
              <strong>{selectedTemplate.clipName}</strong> ausgewählt
              {!selectedTemplate.nodeNameOk && (
                <div className="text-sm" style={{ marginTop: 4, color: 'var(--c-warning)' }}>
                  ⚠️ Kein <code>PestoText</code>-Node gefunden — Fallback auf ersten Text+-Node:
                  <em> {selectedTemplate.fallbackNodeName}</em>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Segmentation Settings */}
      <SegmentationPanel />

      {/* Navigation */}
      <div className="flex justify-between" style={{ marginTop: 4 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setActiveTab('transcribe')}
        >
          ← Transkription
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setActiveTab('apply')}
          disabled={!selectedTemplate}
        >
          Weiter: Anwenden →
        </button>
      </div>
    </div>
  )
}
