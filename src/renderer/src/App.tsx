import React, { useEffect } from 'react'
import { useAppStore } from './store'
import ConnectionStatus from './components/ConnectionStatus'
import TranscriptionPanel from './components/TranscriptionPanel'
import StylePanel from './components/StylePanel'
import ApplyPanel from './components/ApplyPanel'
import SettingsPanel from './components/SettingsPanel'
import type { Tab } from './store'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'transcribe', icon: '🎙️', label: 'Transkription' },
  { id: 'style',      icon: '🎨', label: 'Stil & Templates' },
  { id: 'apply',      icon: '✨', label: 'Anwenden' },
  { id: 'settings',   icon: '⚙️', label: 'Einstellungen' },
]

export default function App() {
  const { activeTab, setActiveTab, setConfig } = useAppStore()

  // Load config on startup
  useEffect(() => {
    if (window.pesto) {
      window.pesto.getConfig().then(cfg => setConfig(cfg)).catch(console.error)
    }
  }, [])

  return (
    <div className="app">
      <div className="titlebar">
        <span className="app-logo">🌿 Pesto Captions</span>
        <span className="titlebar-spacer" />
      </div>

      <ConnectionStatus />

      <nav className="tabs" role="tablist" aria-label="Hauptnavigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="main-content">
        <div
          id="panel-transcribe"
          role="tabpanel"
          aria-labelledby="tab-transcribe"
          hidden={activeTab !== 'transcribe'}
          style={{ height: '100%' }}
        >
          {activeTab === 'transcribe' && <TranscriptionPanel />}
        </div>
        <div
          id="panel-style"
          role="tabpanel"
          aria-labelledby="tab-style"
          hidden={activeTab !== 'style'}
          style={{ height: '100%' }}
        >
          {activeTab === 'style' && <StylePanel />}
        </div>
        <div
          id="panel-apply"
          role="tabpanel"
          aria-labelledby="tab-apply"
          hidden={activeTab !== 'apply'}
          style={{ height: '100%' }}
        >
          {activeTab === 'apply' && <ApplyPanel />}
        </div>
        <div
          id="panel-settings"
          role="tabpanel"
          aria-labelledby="tab-settings"
          hidden={activeTab !== 'settings'}
          style={{ height: '100%' }}
        >
          {activeTab === 'settings' && <SettingsPanel />}
        </div>
      </main>
    </div>
  )
}
