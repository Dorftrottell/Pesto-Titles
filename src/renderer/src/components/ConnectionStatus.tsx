import React, { useCallback } from 'react'
import { useAppStore } from '../store'
import type { TimelineInfo } from '@shared/types'

export default function ConnectionStatus() {
  const { connectionState, connectionError, timeline, setConnectionState } = useAppStore()

  const handleConnect = useCallback(async () => {
    setConnectionState('connecting')
    try {
      const result = await window.pesto.connectResolve()
      if (result.ok && result.data) {
        setConnectionState('connected', null, result.data as TimelineInfo)
      } else {
        setConnectionState('error', result.error || 'Verbindung fehlgeschlagen')
      }
    } catch (e) {
      setConnectionState('error', (e as Error).message)
    }
  }, [setConnectionState])

  const statusLabel = {
    disconnected: 'Nicht verbunden',
    connecting: 'Verbinde …',
    connected: 'Verbunden',
    error: 'Fehler',
  }[connectionState]

  return (
    <div className="connection-bar" role="status" aria-live="polite">
      <span
        className={`status-dot ${connectionState}`}
        aria-label={`Status: ${statusLabel}`}
      />
      <span className="connection-label">{statusLabel}</span>

      {connectionState === 'connected' && timeline && (
        <>
          <span className="connection-project">{timeline.projectName}</span>
          <span className="connection-timeline">/ {timeline.timelineName}</span>
          <span className="text-muted text-sm mono">
            {timeline.frameRate} fps
          </span>
        </>
      )}

      {connectionState === 'error' && connectionError && (
        <span
          className="text-sm"
          style={{ color: 'var(--c-error)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}
          title={connectionError}
        >
          {connectionError.split('\n')[0]}
        </span>
      )}

      <button
        id="connect-resolve-btn"
        className="btn btn-secondary btn-sm connect-btn"
        onClick={handleConnect}
        disabled={connectionState === 'connecting'}
        aria-label="Mit DaVinci Resolve verbinden"
      >
        {connectionState === 'connecting' ? (
          <><span className="spinner" aria-hidden="true" /> Verbinde …</>
        ) : connectionState === 'connected' ? (
          '↺ Aktualisieren'
        ) : (
          '⚡ Verbinden'
        )}
      </button>
    </div>
  )
}
