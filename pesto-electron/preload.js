/**
 * Pesto Titles — preload.js
 * IPC-Bridge: exponiert window.pesto.* an den Renderer (ersetzt HTTP-fetch)
 * Läuft in isoliertem Kontext (contextIsolation: true)
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pesto', {

  // ── Status ──────────────────────────────────────────────────────────
  getStatus: () =>
    ipcRenderer.invoke('pesto:status'),

  // ── Config ──────────────────────────────────────────────────────────
  getConfig: () =>
    ipcRenderer.invoke('pesto:getConfig'),

  saveConfig: (config) =>
    ipcRenderer.invoke('pesto:saveConfig', config),

  // ── Templates (Resolve Bin) ─────────────────────────────────────────
  getTemplates: (binName) =>
    ipcRenderer.invoke('pesto:getTemplates', binName),

  // ── Styles (Festplatte) ─────────────────────────────────────────────
  getStyles: () =>
    ipcRenderer.invoke('pesto:getStyles'),

  saveStyle: (data) =>
    ipcRenderer.invoke('pesto:saveStyle', data),

  deleteStyle: (styleId) =>
    ipcRenderer.invoke('pesto:deleteStyle', styleId),

  // ── Transkription ────────────────────────────────────────────────────
  transcribe: (opts) =>
    ipcRenderer.invoke('pesto:transcribe', opts),

  // ── Apply ────────────────────────────────────────────────────────────
  apply: (opts) =>
    ipcRenderer.invoke('pesto:apply', opts),

  // ── Progress-Events (Renderer abonniert diese) ───────────────────────
  onTranscribeProgress: (cb) =>
    ipcRenderer.on('pesto:transcribeProgress', (_e, data) => cb(data)),

  onApplyProgress: (cb) =>
    ipcRenderer.on('pesto:applyProgress', (_e, data) => cb(data)),

  // ── Aufräumen ────────────────────────────────────────────────────────
  offTranscribeProgress: (cb) =>
    ipcRenderer.removeListener('pesto:transcribeProgress', cb),

  offApplyProgress: (cb) =>
    ipcRenderer.removeListener('pesto:applyProgress', cb),

  // ── Timeline-Infos ───────────────────────────────────────────────────
  getTrackCount: () =>
    ipcRenderer.invoke('pesto:getTrackCount'),

  importSubtitles: () =>
    ipcRenderer.invoke('pesto:importSubtitles'),
});
