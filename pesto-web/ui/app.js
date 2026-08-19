/**
 * Pesto Captions — Frontend App
 * Vanilla JS, kein Framework
 * AGPL-3.0 | Offline-first
 */

'use strict';

// ── State ────────────────────────────────────────────────────────
const state = {
  connected: false,
  resolveInfo: null,
  config: {},
  templates: [],       // from bin scan
  savedStyles: [],     // from /api/styles
  rawPhrases: [],      // from transcription
  cues: [],            // segmented captions (editable)
  selectedCard: null,  // {entry, el}
  activeTab: 'transcription',
};

// ── WebSocket ─────────────────────────────────────────────────────
let ws = null;

function connectWS() {
  try {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (e) => handleWSMessage(JSON.parse(e.data));
    ws.onclose   = () => setTimeout(connectWS, 2500);
    ws.onerror   = () => {};
  } catch {}
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'transcribe_progress':
      showProgress(msg.percent, msg.message);
      break;
    case 'transcribe_done':
      onTranscribeDone(msg);
      break;
    case 'transcribe_error':
      hideProgress();
      showAlert('transcribe-alert', 'error', msg.message);
      $('transcribe-btn').disabled = false;
      break;
    case 'apply_progress':
      const pct = msg.total > 0 ? Math.round((msg.current / msg.total) * 100) : 0;
      $('apply-progress-fill').style.width = pct + '%';
      $('apply-progress-label').textContent = `Cue ${msg.current} von ${msg.total} …`;
      break;
    case 'apply_done':
      onApplyDone(msg);
      break;
    case 'apply_error':
      $('apply-progress-card').classList.add('hidden');
      showAlert('apply-alert', 'error', msg.message);
      $('apply-btn').disabled = false;
      break;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

function showAlert(containerId, type, message) {
  const c = $(containerId);
  c.innerHTML = '';
  const a = el('div', `alert alert--${type}`, escHtml(message).replace(/\n/g, '<br>'));
  c.appendChild(a);
  c.classList.remove('hidden');
}
function hideAlert(containerId) {
  const c = $(containerId);
  c.innerHTML = '';
  c.classList.add('hidden');
}
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00.000';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

function parseFmtTime(s) {
  const m = s.match(/^(\d+):(\d+\.\d+)$/);
  if (!m) return null;
  return parseFloat(m[1]) * 60 + parseFloat(m[2]);
}

// ── Tab Navigation ─────────────────────────────────────────────────
function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const panel = $(`panel-${name}`);
  const tab = document.querySelector(`[data-tab="${name}"]`);
  if (panel) panel.classList.add('active');
  if (tab) {
    tab.classList.add('active');
    moveIndicator(tab);
  }
  // Side-effects
  if (name === 'apply') updateApplySummary();
}

function moveIndicator(tabEl) {
  const ind = $('tab-indicator');
  ind.style.left  = tabEl.offsetLeft + 'px';
  ind.style.width = tabEl.offsetWidth + 'px';
}

// ── Connection ─────────────────────────────────────────────────────
function setBadge(state, text) {
  const badge = $('badge');
  badge.className = `badge badge--${state}`;
  $('badge-text').textContent = text;
}

async function checkStatus() {
  try {
    const data = await api('GET', '/api/status');
    if (data.connected) {
      state.connected = true;
      state.resolveInfo = data;
      setBadge('connected',
        `${data.projectName || '—'} · ${data.timelineName || '—'} @ ${data.frameRate || '?'} fps`);
    } else {
      setBadge('', 'Nicht verbunden');
    }
  } catch {
    setBadge('', 'Server nicht erreichbar');
  }
}

async function doConnect() {
  const btn = $('connect-btn');
  btn.disabled = true;
  btn.textContent = '⌛ Verbinde …';
  try {
    const data = await api('POST', '/api/connect');
    if (data.ok) {
      state.connected = true;
      state.resolveInfo = data;
      setBadge('connected',
        `${data.projectName || '—'} · ${data.timelineName || '—'} @ ${data.frameRate || '?'} fps`);
    } else {
      setBadge('error', 'Fehler');
      showAlert('transcribe-alert', 'error', data.error || 'Verbindung fehlgeschlagen.');
    }
  } catch(e) {
    setBadge('error', 'Fehler');
    showAlert('transcribe-alert', 'error', 'Server nicht erreichbar.');
  }
  btn.disabled = false;
  btn.textContent = '⚡ Verbinden';
}

// ── Config ─────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    state.config = await api('GET', '/api/config');
  } catch {
    state.config = {};
  }
  applyConfigToUI();
}

function applyConfigToUI() {
  const seg = state.config.segmentation || {};
  const p   = seg.punctuation || {};

  setVal('maxChars',  seg.maxChars  ?? 42);
  setVal('maxWords',  seg.maxWords  ?? 8);
  setVal('minDur',    seg.minDurationMs ?? 500);
  setVal('maxDur',    seg.maxDurationMs ?? 5000);
  setVal('fillGaps',  seg.fillGapsMs ?? 0);
  setVal('casing',    seg.casing  ?? 'unchanged');
  setVal('binName',   state.config.binName ?? 'Pesto Captions');
  setVal('lang-select', state.config.language ?? 'auto');

  // Engine
  const engine = state.config.engine ?? 'native';
  document.querySelector(`input[name="engine"][value="${engine}"]`).checked = true;
  updateEngineUI(engine);

  // Punctuation
  for (const [k, v] of Object.entries(p)) {
    const cb = $(`p-${k}`);
    if (cb) cb.checked = v;
  }

  // Slider value badges
  $('maxChars-val').textContent = seg.maxChars  ?? 42;
  $('maxWords-val').textContent  = seg.maxWords  ?? 8;
  $('fillGaps-val').textContent  = seg.fillGapsMs ?? 0;
}

function setVal(id, val) {
  const el = $(id);
  if (!el) return;
  el.value = val;
}

function collectConfig() {
  return {
    binName:  $('binName').value.trim() || 'Pesto Captions',
    engine:   document.querySelector('input[name="engine"]:checked')?.value ?? 'native',
    language: $('lang-select').value,
    segmentation: {
      maxChars:      parseInt($('maxChars').value),
      maxWords:      parseInt($('maxWords').value),
      minDurationMs: parseInt($('minDur').value),
      maxDurationMs: parseInt($('maxDur').value),
      fillGapsMs:    parseInt($('fillGaps').value),
      casing:        $('casing').value,
      punctuation: {
        comma:           $('p-comma').checked,
        period:          $('p-period').checked,
        questionMark:    $('p-questionMark').checked,
        exclamationMark: $('p-exclamationMark').checked,
        quotes:          $('p-quotes').checked,
        dash:            $('p-dash').checked,
        semicolon:       $('p-semicolon').checked,
        colon:           $('p-colon').checked,
      },
    },
  };
}

function updateEngineUI(engine) {
  $('card-native').classList.toggle('selected', engine === 'native');
  $('card-whisper').classList.toggle('selected', engine === 'whisper');
  $('model-row').style.display = engine === 'whisper' ? '' : 'none !important';
}

// ── Transcription ──────────────────────────────────────────────────
function showProgress(pct, msg) {
  $('progress-card').classList.remove('hidden');
  $('progress-fill').style.width = pct + '%';
  $('progress-label').textContent = msg || '';
}
function hideProgress() {
  $('progress-card').classList.add('hidden');
  $('progress-fill').style.width = '0%';
}

async function startTranscription() {
  hideAlert('transcribe-alert');
  $('transcribe-btn').disabled = true;
  showProgress(2, 'Verbinde mit Resolve …');

  const engine = document.querySelector('input[name="engine"]:checked')?.value ?? 'native';
  const language = $('lang-select').value;
  const modelSize = $('model-select').value;

  await api('POST', '/api/transcribe', { engine, language, modelSize });
  // Progress comes via WS
}

function onTranscribeDone(msg) {
  hideProgress();
  $('transcribe-btn').disabled = false;
  state.rawPhrases = msg.phrases || [];

  if (!state.rawPhrases.length) {
    showAlert('transcribe-alert', 'warn',
      'Keine Untertitel gefunden. Bitte stelle sicher, dass die Timeline Audio enthält.');
    return;
  }

  // Segment and render
  state.cues = segment(state.rawPhrases, collectConfig().segmentation);
  renderCueList();
  $('cue-card').classList.remove('hidden');
  updateApplySummary();
  showAlert('transcribe-alert', 'success',
    `✓ ${state.cues.length} Caption-Cues aus ${state.rawPhrases.length} Phrasen erstellt.`);
}

// ── Segmentation (client-side, pure function) ───────────────────────
function applyCasing(text, casing) {
  switch (casing) {
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    case 'sentence':  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    default:          return text;
  }
}

function normalizePunctuation(text, punct) {
  if (!punct) return text;
  if (!punct.comma)           text = text.replace(/,/g, '');
  if (!punct.period)          text = text.replace(/\./g, '');
  if (!punct.questionMark)    text = text.replace(/\?/g, '');
  if (!punct.exclamationMark) text = text.replace(/!/g, '');
  if (!punct.semicolon)       text = text.replace(/;/g, '');
  if (!punct.colon)           text = text.replace(/:/g, '');
  if (!punct.dash)            text = text.replace(/[-–—]/g, '');
  if (!punct.quotes)          text = text.replace(/["'"«»„"'']/g, '');
  return text.trim();
}

function segment(phrases, seg) {
  const cues = [];
  for (const phrase of phrases) {
    let text = normalizePunctuation(phrase.text || '', seg.punctuation);
    text = applyCasing(text, seg.casing || 'unchanged');
    if (!text) continue;
    cues.push({
      cueIndex: cues.length + 1,
      startSec: phrase.start ?? 0,
      endSec:   phrase.end   ?? 0,
      text,
      runs: [{ text, emphasis: false }],
    });
  }
  return cues;
}

// ── Cue List ───────────────────────────────────────────────────────
function renderCueList() {
  const list = $('cue-list');
  list.innerHTML = '';
  $('cue-count').textContent = state.cues.length;

  state.cues.forEach((cue, i) => {
    const row = el('div', 'cue-row');

    const idx = el('span', 'cue-idx', String(i + 1));

    const startEl = el('span', 'cue-time font-mono');
    startEl.textContent = fmtTime(cue.startSec);
    makeEditable(startEl, fmtTime(cue.startSec), (v) => {
      const t = parseFmtTime(v);
      if (t !== null) { state.cues[i].startSec = t; startEl.textContent = fmtTime(t); }
    });

    const endEl = el('span', 'cue-time font-mono');
    endEl.textContent = fmtTime(cue.endSec);
    makeEditable(endEl, fmtTime(cue.endSec), (v) => {
      const t = parseFmtTime(v);
      if (t !== null) { state.cues[i].endSec = t; endEl.textContent = fmtTime(t); }
    });

    const textEl = el('span', 'cue-text');
    textEl.textContent = cue.text;
    makeEditable(textEl, cue.text, (v) => {
      state.cues[i].text = v;
      state.cues[i].runs = [{ text: v, emphasis: false }];
      textEl.textContent = v;
    }, true);

    row.appendChild(idx);
    row.appendChild(startEl);
    row.appendChild(endEl);
    row.appendChild(textEl);
    list.appendChild(row);
  });
}

function makeEditable(spanEl, initVal, onSave, isText = false) {
  spanEl.addEventListener('click', () => {
    if (spanEl.querySelector('input,textarea')) return;
    spanEl.classList.add('editing');
    let inp;
    if (isText) {
      inp = el('textarea', 'cue-input');
      inp.rows = 2;
    } else {
      inp = el('input', 'cue-input');
      inp.type = 'text';
    }
    inp.value = spanEl.textContent;
    spanEl.textContent = '';
    spanEl.appendChild(inp);
    inp.focus();
    inp.select();

    const finish = () => {
      spanEl.classList.remove('editing');
      onSave(inp.value.trim() || initVal);
    };
    inp.addEventListener('blur', finish);
    inp.addEventListener('keydown', (e) => {
      if (!isText && e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = initVal; inp.blur(); }
    });
  });
}

// ── SRT import ─────────────────────────────────────────────────────
function parseSRT(text) {
  const blocks = text.trim().split(/\n\n+/);
  const phrases = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const m = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!m) continue;
    const toSec = (h,mi,s,ms) => +h*3600 + +mi*60 + +s + +ms/1000;
    const start = toSec(m[1],m[2],m[3],m[4]);
    const end   = toSec(m[5],m[6],m[7],m[8]);
    const txt = lines.slice(2).join(' ').replace(/<[^>]+>/g,'').trim();
    if (txt) phrases.push({ start, end, text: txt });
  }
  return phrases;
}

// ── Templates & Styles ─────────────────────────────────────────────
async function loadStyles() {
  try {
    const data = await api('GET', '/api/styles');
    state.savedStyles = data.styles || [];
  } catch { state.savedStyles = []; }
}

async function refreshTemplates() {
  hideAlert('styles-alert');
  const btn = $('refresh-templates-btn');
  btn.disabled = true;
  btn.textContent = '⌛ Suche …';
  $('gallery-status').textContent = 'Scanne Bin …';

  await loadStyles();

  try {
    const data = await api('GET', '/api/templates');
    if (data.ok) {
      state.templates = (data.templates || []).filter(t => t.clipName !== '__BIN_CREATED__');
      const created = (data.templates || []).find(t => t.clipName === '__BIN_CREATED__');
      if (created) {
        $('gallery-status').textContent =
          `✓ Bin automatisch angelegt. Ziehe Fusion-Title-Clips hinein, dann Aktualisieren.`;
      }
      renderGallery();
    } else {
      showAlert('styles-alert', 'error',
        (data.error || 'Fehler beim Laden') + '\n\nSichtbare Bins: ' + (data.bins || []).join(', '));
    }
  } catch(e) {
    showAlert('styles-alert', 'error', 'Server nicht erreichbar.');
  }

  btn.disabled = false;
  btn.textContent = '↺ Aktualisieren';
}

function makeThumbnailSrc(b64) {
  if (!b64) return '';
  // Detect if it's SVG
  try {
    const decoded = atob(b64);
    if (decoded.trim().startsWith('<svg') || decoded.trim().startsWith('<?xml')) {
      return `data:image/svg+xml;base64,${b64}`;
    }
  } catch {}
  return `data:image/png;base64,${b64}`;
}

function renderGallery() {
  const gallery = $('gallery');
  const empty   = $('gallery-empty');
  gallery.innerHTML = '';

  // Saved styles first (with ⭐ badge)
  const savedNames = new Set(state.savedStyles.map(s => s.clipName));

  const allCards = [
    ...state.savedStyles.map(s => ({ ...s, _source: 'saved' })),
    ...state.templates
      .filter(t => !savedNames.has(t.clipName))
      .map(t => ({ ...t, name: t.clipName, _source: 'bin' })),
  ];

  if (!allCards.length) {
    gallery.style.display = 'none';
    empty.style.display   = '';
    $('gallery-status').textContent = 'Klicke ↺ Aktualisieren, um Bin-Templates zu laden.';
    return;
  }

  gallery.style.display = 'flex';
  empty.style.display   = 'none';

  allCards.forEach(entry => {
    const card = el('div', `template-card${entry._source === 'saved' ? ' saved' : ''}`);

    // Thumbnail
    const thumb = el('div', 'template-card__thumb');
    const src = makeThumbnailSrc(entry.thumbnail || '');
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = entry.name || '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = '—';
    }
    card.appendChild(thumb);

    // Badge
    const badge = el('div', `template-card__badge${entry._source === 'saved' ? ' saved' : ''}`);
    badge.textContent = entry._source === 'saved' ? '⭐ Gespeichert' : '📁 Bin';
    card.appendChild(badge);

    // Name
    const name = el('div', 'template-card__name', escHtml(entry.name || entry.clipName || ''));
    card.appendChild(name);

    // Delete button (saved only)
    if (entry._source === 'saved') {
      const del = el('button', 'template-card__del', '✕ Löschen');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStyle(entry);
      });
      card.appendChild(del);
    }

    // Select on click
    card.addEventListener('click', () => selectCard(entry, card));
    gallery.appendChild(card);
  });

  // Status
  const nBin   = state.templates.filter(t => !savedNames.has(t.clipName)).length;
  const nSaved = state.savedStyles.length;
  const nSkip  = state.templates.length - nBin;
  let status = `${nSaved} gespeicherte${nSaved !== 1 ? ' Stile' : 'r Stil'}`;
  if (nBin)  status += `  ·  ${nBin} neue${nBin !== 1 ? 's' : ''} Bin-Template${nBin !== 1 ? 's' : ''}`;
  if (nSkip) status += `  (✓ ${nSkip} bereits gespeichert)`;
  $('gallery-status').textContent = status;
}

function selectCard(entry, cardEl) {
  // Deselect previous
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  state.selectedCard = { entry, el: cardEl };

  // Show detail panel
  const panel = $('detail-panel');
  panel.classList.add('visible');

  $('detail-name').textContent = entry.name || entry.clipName || '';
  $('detail-sub').textContent  =
    `${entry._source === 'saved' ? '⭐ Gespeichert' : '📁 Bin'} · ${state.config.binName || 'Pesto Captions'}`;

  const src = makeThumbnailSrc(entry.thumbnail || '');
  $('detail-img').src = src || '';
  $('detail-img').style.display = src ? '' : 'none';

  $('detail-save-input').value = entry.name || entry.clipName || '';
  $('detail-save-status').textContent = '';
  $('detail-save-status').className = 'save-status';

  updateApplySummary();
}

async function saveStyle() {
  const entry = state.selectedCard?.entry;
  if (!entry) return;
  const name = $('detail-save-input').value.trim();
  if (!name) {
    $('detail-save-status').textContent = 'Bitte einen Stilnamen eingeben.';
    $('detail-save-status').className = 'save-status text-warn';
    return;
  }
  const data = await api('POST', '/api/styles', {
    name,
    clipName:     entry.clipName || entry.name || '',
    binName:      state.config.binName || 'Pesto Captions',
    thumbnailB64: entry.thumbnail || '',
  });
  if (data.ok) {
    $('detail-save-status').textContent = `✓ '${name}' gespeichert.`;
    $('detail-save-status').className = 'save-status text-accent';
    await loadStyles();
    renderGallery();
  } else {
    $('detail-save-status').textContent = data.error || 'Fehler.';
    $('detail-save-status').className = 'save-status';
    $('detail-save-status').style.color = 'var(--error)';
  }
}

async function deleteStyle(entry) {
  if (!confirm(`Stil '${entry.name}' wirklich löschen?`)) return;
  const styleId = (entry.path || '').split('/').pop().replace(/\.json$/, '');
  if (!styleId) return;
  await api('DELETE', `/api/styles/${styleId}`);
  await loadStyles();
  $('detail-panel').classList.remove('visible');
  state.selectedCard = null;
  renderGallery();
}

// ── Apply ──────────────────────────────────────────────────────────
function updateApplySummary() {
  $('sum-cues').textContent     = state.cues.length || '0';
  $('sum-template').textContent = state.selectedCard?.entry?.name
    || state.selectedCard?.entry?.clipName || '—';
  const trackVal = parseInt($('track-select').value);
  $('sum-track').textContent = trackVal === 0 ? 'V+1' : `V${trackVal}`;
}

async function applyToTimeline() {
  if (!state.cues.length) {
    showAlert('apply-alert', 'warn', 'Bitte erst eine Transkription durchführen.');
    return;
  }
  if (!state.selectedCard) {
    showAlert('apply-alert', 'warn', 'Bitte erst ein Template/Stil in "Stile & Templates" auswählen.');
    return;
  }
  hideAlert('apply-alert');
  $('apply-btn').disabled = true;
  $('apply-progress-card').classList.remove('hidden');
  $('apply-progress-fill').style.width = '0%';
  $('apply-progress-label').textContent = 'Starte …';
  $('apply-log').innerHTML = '';
  $('apply-log-card').classList.add('hidden');

  const entry = state.selectedCard.entry;
  await api('POST', '/api/apply', {
    cues: state.cues,
    templateClipName: entry.clipName || entry.name || '',
    trackTarget: parseInt($('track-select').value),
  });
}

function onApplyDone(msg) {
  $('apply-progress-fill').style.width = '100%';
  $('apply-progress-label').textContent = '✓ Fertig!';
  $('apply-btn').disabled = false;

  const errors = msg.errors || [];
  if (errors.length) {
    $('apply-log-card').classList.remove('hidden');
    errors.forEach(err => {
      const item = el('div', 'apply-log-item error', escHtml(err));
      $('apply-log').appendChild(item);
    });
    showAlert('apply-alert', 'warn',
      `${errors.length} Fehler aufgetreten. Details im Protokoll oben.`);
  } else {
    showAlert('apply-alert', 'success',
      `✓ ${state.cues.length} Captions erfolgreich auf die Timeline angewendet.`);
    const item = el('div', 'apply-log-item ok',
      `✓ ${state.cues.length} Cues angewendet — ${new Date().toLocaleTimeString()}`);
    $('apply-log').appendChild(item);
    $('apply-log-card').classList.remove('hidden');
  }
}

// ── Settings ───────────────────────────────────────────────────────
async function saveSettings() {
  state.config = collectConfig();
  await api('POST', '/api/config', { config: state.config });
  const s = $('settings-status');
  s.textContent = '✓ Einstellungen gespeichert.';
  s.className = 'text-sm text-accent';
  s.classList.remove('hidden');
  setTimeout(() => s.classList.add('hidden'), 2500);

  // Re-segment if we have phrases
  if (state.rawPhrases.length) {
    state.cues = segment(state.rawPhrases, state.config.segmentation);
    renderCueList();
    updateApplySummary();
  }
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  // Tab navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Set initial indicator
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) {
    requestAnimationFrame(() => moveIndicator(activeTab));
  }

  // Buttons
  $('connect-btn').addEventListener('click', doConnect);
  $('transcribe-btn').addEventListener('click', startTranscription);
  $('refresh-templates-btn').addEventListener('click', refreshTemplates);
  $('detail-save-btn').addEventListener('click', saveStyle);
  $('apply-btn').addEventListener('click', applyToTimeline);
  $('save-settings-btn').addEventListener('click', saveSettings);
  $('reseg-btn').addEventListener('click', () => {
    if (state.rawPhrases.length) {
      state.cues = segment(state.rawPhrases, collectConfig().segmentation);
      renderCueList();
      updateApplySummary();
    }
  });
  $('clear-log-btn').addEventListener('click', () => {
    $('apply-log').innerHTML = '';
    $('apply-log-card').classList.add('hidden');
  });

  // SRT import
  $('import-srt-btn').addEventListener('click', () => $('srt-file-input').click());
  $('srt-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.rawPhrases = parseSRT(ev.target.result);
      state.cues = segment(state.rawPhrases, collectConfig().segmentation);
      renderCueList();
      $('cue-card').classList.remove('hidden');
      showAlert('transcribe-alert', 'success',
        `✓ ${state.cues.length} Cues aus SRT importiert.`);
      updateApplySummary();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Track select → update summary
  $('track-select').addEventListener('change', updateApplySummary);

  // Sliders → live badge update
  [['maxChars','maxChars-val'], ['maxWords','maxWords-val'], ['fillGaps','fillGaps-val']].forEach(
    ([id, badge]) => $(id).addEventListener('input', () => { $(badge).textContent = $(id).value; })
  );

  // Engine cards
  document.querySelectorAll('input[name="engine"]').forEach(inp =>
    inp.addEventListener('change', () => updateEngineUI(inp.value))
  );

  // Load initial data
  await loadConfig();
  await loadStyles();
  checkStatus();
  connectWS();

  // Auto-load gallery with saved styles
  renderGallery();
}

document.addEventListener('DOMContentLoaded', init);
