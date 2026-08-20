/**
 * Pesto Titles — Frontend App (Electron Edition)
 * Vanilla JS, kein Framework
 * AGPL-3.0 | Offline-first
 *
 * API: window.pesto.* (via preload.js IPC-Bridge)
 * Keine fetch() / WebSocket — alles via Electron IPC
 */

'use strict';

// ── State ────────────────────────────────────────────────────────
const state = {
  connected:    false,
  resolveInfo:  null,
  config:       {},
  templates:    [],       // aus Resolve Bin
  savedStyles:  [],       // von Festplatte
  rawPhrases:   [],       // aus Transkription
  cues:         [],       // segmentierte Captions (editierbar)
  selectedCard: null,     // {entry, el}
  activeTab:    'transcription',
};

// ── Helpers ───────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)            e.className = cls;
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

function setVal(id, val) {
  const e = $(id);
  if (e) e.value = val;
}

// ── Tab Navigation ─────────────────────────────────────────────────
function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const panel = $(`panel-${name}`);
  const tab   = document.querySelector(`[data-tab="${name}"]`);
  if (panel) panel.classList.add('active');
  if (tab)   { tab.classList.add('active'); moveIndicator(tab); }
  if (name === 'apply') updateApplySummary();
}

function moveIndicator(tabEl) {
  const ind = $('tab-indicator');
  ind.style.left  = tabEl.offsetLeft + 'px';
  ind.style.width = tabEl.offsetWidth + 'px';
}

// ── Connection / Status ─────────────────────────────────────────────
function setBadge(st, text) {
  const badge = $('badge');
  badge.className = `badge badge--${st}`;
  $('badge-text').textContent = text;
}

async function checkStatus() {
  try {
    const data = await window.pesto.getStatus();
    if (data.connected) {
      state.connected   = true;
      state.resolveInfo = data;
      setBadge('connected',
        `${data.projectName || '—'} · ${data.timelineName || '—'} @ ${data.frameRate || '?'} fps`);

      // Timeline-Daten in einem Batch-Call laden (FPS, Tracks, StartFrame)
      try {
        const tlData = await window.pesto.getTimelineData();
        if (tlData?.ok) {
          state.timelineData = tlData;
          // Track-Dropdown sofort befüllen
          populateTrackSelect(tlData.videoTrackCount || 0);
        }
      } catch {}
    } else {
      setBadge('', data.error || 'Nicht verbunden');
    }
  } catch (e) {
    setBadge('', 'Resolve nicht erreichbar');
  }
}

async function doConnect() {
  const btn = $('connect-btn');
  btn.disabled = true;
  btn.textContent = '⌛ Verbinde …';
  await checkStatus();
  btn.disabled = false;
  btn.textContent = ' Verbinden';
}

// ── Config ─────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    state.config = await window.pesto.getConfig();
  } catch {
    state.config = {};
  }
  applyConfigToUI();
}

function applyConfigToUI() {
  const seg = state.config.segmentation || {};
  const p   = seg.punctuation || {};

  setVal('maxChars',    seg.maxChars       ?? 42);
  setVal('maxWords',    seg.maxWords        ?? 8);
  setVal('minDur',      seg.minDurationMs  ?? 500);
  setVal('maxDur',      seg.maxDurationMs  ?? 5000);
  setVal('fillGaps',    seg.fillGapsMs     ?? 0);
  setVal('casing',      seg.casing         ?? 'unchanged');
  setVal('binName',     state.config.binName ?? 'Pesto Titles');
  setVal('lang-select', state.config.language ?? 'auto');

  const engine = state.config.engine ?? 'native';
  const engineInp = document.querySelector(`input[name="engine"][value="${engine}"]`);
  if (engineInp) engineInp.checked = true;
  updateEngineUI(engine);

  for (const [k, v] of Object.entries(p)) {
    const cb = $(`p-${k}`);
    if (cb) cb.checked = v;
  }

  if ($('maxChars-val'))  $('maxChars-val').textContent  = seg.maxChars  ?? 42;
  if ($('maxWords-val'))  $('maxWords-val').textContent  = seg.maxWords  ?? 8;
  if ($('fillGaps-val'))  $('fillGaps-val').textContent  = seg.fillGapsMs ?? 0;
}

function setVal(id, val) {
  const e = $(id);
  if (!e) return;
  e.value = val;
}

function collectConfig() {
  return {
    binName:  $('binName').value.trim() || 'Pesto Titles',
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
  $('card-native')?.classList.toggle('selected', engine === 'native');
  $('card-whisper')?.classList.toggle('selected', engine === 'whisper');
  if ($('model-row')) $('model-row').style.display = engine === 'whisper' ? '' : 'none';
}

// ── Transkription ──────────────────────────────────────────────────
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

  // Progress-Events empfangen
  const progressCb = (data) => showProgress(data.percent || 50, data.message || '');
  window.pesto.onTranscribeProgress(progressCb);

  try {
    const result = await window.pesto.transcribe({
      engine:    document.querySelector('input[name="engine"]:checked')?.value ?? 'native',
      language:  $('lang-select').value,
      modelSize: $('model-select')?.value,
    });
    window.pesto.offTranscribeProgress(progressCb);

    if (result.ok) {
      onTranscribeDone(result);
    } else {
      hideProgress();
      showAlert('transcribe-alert', 'error', result.error || 'Transkription fehlgeschlagen.');
    }
  } catch (e) {
    hideProgress();
    showAlert('transcribe-alert', 'error', e.message);
  }

  $('transcribe-btn').disabled = false;
}

function onTranscribeDone(result) {
  hideProgress();
  state.rawPhrases = result.phrases || [];

  if (!state.rawPhrases.length) {
    showAlert('transcribe-alert', 'warn',
      'Keine Untertitel gefunden. Bitte stelle sicher, dass die Timeline Audio enthält.');
    return;
  }

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
  // Zähle nur nicht-leere Cues für die Anzeige
  const visibleCount = state.cues.filter(c => c.text.trim()).length;
  $('cue-count').textContent = `${state.cues.length} (${visibleCount} aktiv)`;

  state.cues.forEach((cue, i) => {
    const isEmpty = !cue.text.trim();
    const row = el('div', `cue-row${isEmpty ? ' cue-row--empty' : ''}`);

    const idx = el('span', 'cue-idx', String(i + 1));
    if (isEmpty) idx.style.opacity = '0.35';

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
    if (isEmpty) {
      textEl.textContent = '— leer —';
      textEl.style.cssText = 'opacity:.3;font-style:italic;';
      // Klick auf leeren Platzhalter → Text wieder editierbar machen
      textEl.addEventListener('click', () => {
        state.cues[i].text = ' ';
        state.cues[i].runs = [{ text: ' ', emphasis: false }];
        renderCueList();
        // Fokus auf die neue Zeile
        setTimeout(() => {
          const rows = $('cue-list').querySelectorAll('.cue-row');
          rows[i]?.querySelector('.cue-text')?.click();
        }, 30);
      });
    } else {
      textEl.textContent = cue.text;
      makeEditable(textEl, cue.text, (v) => {
        state.cues[i].text = v;
        state.cues[i].runs = [{ text: v, emphasis: false }];
        textEl.textContent = v;
        if (!v.trim()) {
          // Text geleert → Zeile als leer markieren
          row.classList.add('cue-row--empty');
          textEl.textContent = '— leer —';
          textEl.style.cssText = 'opacity:.3;font-style:italic;';
        }
      }, true);
    }

    // Löschen-Button: Text leeren, Timestamps bleiben
    const delBtn = el('button', 'cue-del-btn');
    delBtn.title = isEmpty ? 'Zeile entfernen' : 'Text löschen (Timestamps bleiben)';
    delBtn.innerHTML = isEmpty
      ? '<svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'  // × entfernen
      : '<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'; // Mülleimer leeren

    delBtn.addEventListener('click', () => {
      if (isEmpty) {
        // Leere Zeile komplett entfernen
        state.cues.splice(i, 1);
      } else {
        // Text leeren, Timestamps behalten
        state.cues[i].text = '';
        state.cues[i].runs = [];
      }
      renderCueList();
    });

    row.appendChild(idx);
    row.appendChild(startEl);
    row.appendChild(endEl);
    row.appendChild(textEl);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}


function makeEditable(spanEl, initVal, onSave, isText = false) {
  spanEl.addEventListener('click', () => {
    if (spanEl.querySelector('input,textarea')) return;
    // Aktuelle Breite/Höhe fixieren vor dem Editieren → kein Layout-Shift
    const rect = spanEl.getBoundingClientRect();
    spanEl.style.minWidth  = rect.width  + 'px';
    spanEl.style.minHeight = rect.height + 'px';
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
      spanEl.style.minWidth  = '';
      spanEl.style.minHeight = '';
      onSave(inp.value.trim() || initVal);
    };
    inp.addEventListener('blur', finish);
    inp.addEventListener('keydown', (e) => {
      if (!isText && e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = initVal; inp.blur(); }
    });
  });
}

// ── SRT Import ─────────────────────────────────────────────────────
function parseSRT(text) {
  const blocks  = text.trim().split(/\n\n+/);
  const phrases = [];
  for (const block of blocks) {
    const lines    = block.trim().split('\n');
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const m = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!m) continue;
    const toSec = (h,mi,s,ms) => +h*3600 + +mi*60 + +s + +ms/1000;
    const start  = toSec(m[1],m[2],m[3],m[4]);
    const end    = toSec(m[5],m[6],m[7],m[8]);
    const txt    = lines.slice(2).join(' ').replace(/<[^>]+>/g,'').trim();
    if (txt) phrases.push({ start, end, text: txt });
  }
  return phrases;
}

// ── Templates & Styles ─────────────────────────────────────────────
async function loadStyles() {
  try {
    const data     = await window.pesto.getStyles();
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
    const binName = state.config.binName || 'Pesto Titles';
    const data    = await window.pesto.getTemplates(binName);

    if (data.ok) {
      state.templates = (data.templates || []);

      if (data.binCreated) {
        $('gallery-status').textContent =
          `✓ Bin automatisch angelegt. Ziehe Fusion-Title-Clips hinein, dann Aktualisieren.`;
      }
      renderGallery();
    } else {
      showAlert('styles-alert', 'error', data.error || 'Fehler beim Laden');
    }
  } catch (e) {
    showAlert('styles-alert', 'error', e.message);
  }

  btn.disabled = false;
  btn.textContent = '↺';
}

function makeThumbnailSrc(b64) {
  if (!b64) return '';
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
    $('gallery-status').textContent = 'Klicke Aktualisieren, um Bin-Templates zu laden.';
    return;
  }

  gallery.style.display = 'flex';
  empty.style.display   = 'none';

  allCards.forEach(entry => {
    const isSaved = entry._source === 'saved';
    const card    = el('div', `template-card${isSaved ? ' saved' : ''}`);

    // ── Thumbnail ──────────────────────────────────────────────────
    const thumb = el('div', 'template-card__thumb');
    const src   = makeThumbnailSrc(entry.thumbnail || '');
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = entry.name || '';
      thumb.appendChild(img);
    } else {
      // Schöner SVG-Platzhalter (bleibt bis echtes Thumbnail da ist)
      thumb.innerHTML = `<svg viewBox="0 0 160 90" xmlns="http://www.w3.org/2000/svg">
        <rect width="160" height="90" fill="#1a1a2e"/>
        <text x="80" y="40" text-anchor="middle" fill="#6b6bff" font-size="22" font-family="sans-serif">Aa</text>
        <text x="80" y="62" text-anchor="middle" fill="#555" font-size="9" font-family="sans-serif">${escHtml(entry.clipName || '')}</text>
      </svg>`;
    }
    card.appendChild(thumb);

    // ── Badge ──────────────────────────────────────────────────────
    const badge = el('div', `template-card__badge${isSaved ? ' saved' : ''}`);
    badge.textContent = isSaved ? 'Gespeichert' : 'Bin';
    card.appendChild(badge);

    // ── Name ───────────────────────────────────────────────────────
    const nameEl = el('div', 'template-card__name');
    nameEl.textContent = entry.name || entry.clipName || '';
    card.appendChild(nameEl);

    // ── Hover-Aktionen ─────────────────────────────────────────────
    const actions = el('div', 'card-actions');

    if (isSaved) {
      const renBtn = el('button', 'card-action-btn', '✎');
      renBtn.title = 'Umbenennen';
      renBtn.addEventListener('click', (e) => { e.stopPropagation(); startInlineRename(card, nameEl, entry); });

      const delBtn = el('button', 'card-action-btn del', '×️');
      delBtn.title = 'Löschen';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteStyle(entry); });

      actions.appendChild(renBtn);
      actions.appendChild(delBtn);
    } else {
      const saveBtn = el('button', 'card-action-btn save', '');
      saveBtn.title = 'Mit Clip-Name speichern';
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        quickSaveStyle(entry, entry.clipName || entry.name || '', saveBtn);
      });

      const renBtn = el('button', 'card-action-btn', '✎');
      renBtn.title = 'Umbenennen & Speichern';
      renBtn.addEventListener('click', (e) => { e.stopPropagation(); startInlineRename(card, nameEl, entry); });

      actions.appendChild(saveBtn);
      actions.appendChild(renBtn);
    }

    card.appendChild(actions);
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

async function quickSaveStyle(entry, name, btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳'; }
  const data = await window.pesto.saveStyle({
    name:        name.trim() || entry.clipName,
    clipName:    entry.clipName || entry.name || '',
    binName:     state.config.binName || 'Pesto Titles',
    thumbnailB64: entry.thumbnail || '',
  });
  if (btnEl) { btnEl.disabled = false; btnEl.textContent = data.ok ? '✓' : ''; }
  if (data.ok) {
    await loadStyles();
    renderGallery();
    if (state.selectedCard?.entry?.clipName === entry.clipName) {
      $('detail-sub').textContent = `Gespeichert · ${state.config.binName || 'Pesto Titles'}`;
    }
  }
}

function startInlineRename(card, nameEl, entry) {
  if (card.querySelector('.card-rename-input')) return;
  const original = entry.name || entry.clipName || '';
  const inp = el('input', 'card-rename-input');
  inp.type  = 'text';
  inp.value = original;
  nameEl.innerHTML = '';
  nameEl.appendChild(inp);
  inp.focus();
  inp.select();

  const commit = () => {
    const newName = inp.value.trim() || original;
    nameEl.textContent = newName;
    if (entry._source === 'saved') {
      const styleId = (entry.path || '').split('/').pop().replace(/\.json$/, '');
      window.pesto.deleteStyle(styleId).then(() =>
        quickSaveStyle({ ...entry, name: newName }, newName, null)
      );
    } else {
      quickSaveStyle(entry, newName, null);
    }
  };

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = original; }
  });
}

function selectCard(entry, cardEl) {
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  state.selectedCard = { entry, el: cardEl };

  // Thumbnail direkt zeigen
  const src = makeThumbnailSrc(entry.thumbnail || '');
  $('preview-error').classList.add('hidden');
  $('preview-spinner').classList.add('hidden');
  if (src) {
    $('preview-img').src           = src;
    $('preview-img').style.display = '';
    $('preview-placeholder').style.display = 'none';
  } else {
    $('preview-img').style.display         = 'none';
    $('preview-placeholder').style.display = '';
  }

  $('detail-panel').classList.add('visible');
  $('detail-name').textContent = entry.name || entry.clipName || '';
  $('detail-sub').textContent  =
    `${entry._source === 'saved' ? 'Gespeichert' : 'Bin'} · ${state.config.binName || 'Pesto Titles'}`;
  $('detail-save-input').value    = entry.name || entry.clipName || '';
  $('detail-save-status').textContent = '';
  $('detail-save-status').className   = 'save-status';

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
  const data = await window.pesto.saveStyle({
    name,
    clipName:    entry.clipName || entry.name || '',
    binName:     state.config.binName || 'Pesto Titles',
    thumbnailB64: entry.thumbnail || '',
  });
  if (data.ok) {
    $('detail-save-status').textContent = `✓ '${name}' gespeichert.`;
    $('detail-save-status').className = 'save-status text-accent';
    await loadStyles();
    renderGallery();
  } else {
    $('detail-save-status').textContent = data.error || 'Fehler.';
    $('detail-save-status').style.color = 'var(--error)';
  }
}

async function deleteStyle(entry) {
  if (!confirm(`Stil '${entry.name}' wirklich löschen?`)) return;
  const styleId = (entry.path || '').split('/').pop().replace(/\.json$/, '');
  if (!styleId) return;
  await window.pesto.deleteStyle(styleId);
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

  // Pre-Flight: Timeline prüfen
  const tlData = state.timelineData || {};
  if (!tlData.ok && tlData.error === 'NO_TIMELINE') {
    showAlert('apply-alert', 'error', 'Keine Timeline geöffnet. Bitte erst eine Timeline in Resolve öffnen.');
    return;
  }

  // 500-Clip-Warnung (wie Snap Captions)
  const activeCues = state.cues.filter(c => c.text.trim());
  if (activeCues.length > 500) {
    const ok = confirm(
      `Du hast ${activeCues.length} Cues. Über 500 kann Resolve bei der Wiedergabe ins Stocken geraten.\n\n` +
      `Empfehlung: maximal 500 Cues pro Apply, danach Resolve neu starten.\n\n` +
      `Trotzdem fortfahren?`
    );
    if (!ok) return;
  }

  hideAlert('apply-alert');
  $('apply-btn').disabled = true;
  $('apply-progress-card').classList.remove('hidden');
  $('apply-progress-fill').style.width = '0%';
  $('apply-progress-label').textContent = 'Starte …';
  $('apply-log').innerHTML = '';
  $('apply-log-card').classList.add('hidden');

  const progressCb = (data) => {
    const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
    $('apply-progress-fill').style.width = pct + '%';
    $('apply-progress-label').textContent = `${data.current} von ${data.total} …`;
  };
  window.pesto.onApplyProgress(progressCb);

  try {
    const entry  = state.selectedCard.entry;
    const result = await window.pesto.apply({
      cues:             activeCues,
      templateClipName: entry.clipName || entry.name || '',
      binName:          state.config.binName || 'Pesto Titles',
      trackTarget:      parseInt($('track-select').value),
    });
    window.pesto.offApplyProgress(progressCb);
    onApplyDone(result);
  } catch (e) {
    window.pesto.offApplyProgress(progressCb);
    $('apply-progress-card').classList.add('hidden');
    showAlert('apply-alert', 'error', e.message);
    $('apply-btn').disabled = false;
  }
}

function onApplyDone(result) {
  $('apply-progress-fill').style.width = '100%';
  $('apply-progress-label').textContent = result.ok ? '✓ Fertig!' : '✗ Fehler';
  $('apply-btn').disabled = false;

  const errors = result.errors || [];
  if (!result.ok) {
    showAlert('apply-alert', 'error', result.error || 'Fehler.');
  } else if (errors.length) {
    $('apply-log-card').classList.remove('hidden');
    errors.forEach(err => {
      $('apply-log').appendChild(el('div', 'apply-log-item error', escHtml(err)));
    });
    showAlert('apply-alert', 'warn', `${errors.length} Fehler aufgetreten.`);
  } else {
    showAlert('apply-alert', 'success',
      `✓ ${state.cues.length} Captions erfolgreich auf die Timeline angewendet.`);
    $('apply-log').appendChild(el('div', 'apply-log-item ok',
      `✓ ${state.cues.length} Cues angewendet — ${new Date().toLocaleTimeString()}`));
    $('apply-log-card').classList.remove('hidden');
  }
}

// ── Settings ───────────────────────────────────────────────────────
async function saveSettings() {
  state.config = collectConfig();
  await window.pesto.saveConfig(state.config);
  const s = $('settings-status');
  s.textContent = '✓ Einstellungen gespeichert.';
  s.className = 'text-sm text-accent';
  s.classList.remove('hidden');
  setTimeout(() => s.classList.add('hidden'), 2500);

  if (state.rawPhrases.length) {
    state.cues = segment(state.rawPhrases, state.config.segmentation);
    renderCueList();
    updateApplySummary();
  }
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
  );
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) requestAnimationFrame(() => moveIndicator(activeTab));

  // Buttons
  $('connect-btn').addEventListener('click', doConnect);
  $('transcribe-btn').addEventListener('click', startTranscription);
  $('refresh-templates-btn').addEventListener('click', refreshTemplates);
  $('detail-save-btn').addEventListener('click', saveStyle);
  $('apply-btn').addEventListener('click', applyToTimeline);
  $('save-settings-btn').addEventListener('click', saveSettings);
  $('reseg-btn')?.addEventListener('click', () => {
    if (state.rawPhrases.length) {
      state.cues = segment(state.rawPhrases, collectConfig().segmentation);
      renderCueList();
      updateApplySummary();
    }
  });
  $('clear-log-btn')?.addEventListener('click', () => {
    $('apply-log').innerHTML = '';
    $('apply-log-card').classList.add('hidden');
  });

  // SRT Import
  $('import-srt-btn')?.addEventListener('click', () => $('srt-file-input').click());
  $('srt-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.rawPhrases = parseSRT(ev.target.result);
      state.cues = segment(state.rawPhrases, collectConfig().segmentation);
      renderCueList();
      $('cue-card').classList.remove('hidden');
      showAlert('transcribe-alert', 'success', `✓ ${state.cues.length} Cues aus SRT importiert.`);
      updateApplySummary();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Von Resolve lesen (bestehenden Subtitle-Track importieren)
  $('import-resolve-btn')?.addEventListener('click', async () => {
    $('import-resolve-btn').disabled = true;
    $('progress-card').classList.remove('hidden');
    $('progress-fill').style.width = '50%';
    $('progress-label').textContent = 'Lese Subtitle-Track …';
    try {
      const result = await window.pesto.importSubtitles();
      $('progress-card').classList.add('hidden');
      if (result.ok) {
        state.rawPhrases = result.phrases || [];
        state.cues = segment(state.rawPhrases, collectConfig().segmentation);
        renderCueList();
        $('cue-card').classList.remove('hidden');
        updateApplySummary();
        showAlert('transcribe-alert', 'success',
          `✓ ${state.cues.length} Cues aus bestehendem Resolve-Subtitle-Track geladen.`);
      } else {
        showAlert('transcribe-alert', 'error', result.error || 'Import fehlgeschlagen.');
      }
    } catch (e) {
      $('progress-card').classList.add('hidden');
      showAlert('transcribe-alert', 'error', e.message);
    }
    $('import-resolve-btn').disabled = false;
  });

  // Track select → Summary aktualisieren
  $('track-select')?.addEventListener('change', updateApplySummary);

  // Spur-Dropdown dynamisch befüllen
  function populateTrackSelect(count) {
    const sel = $('track-select');
    if (!sel) return;
    const prev = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    for (let i = 1; i <= count; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `V${i}`;
      sel.appendChild(opt);
    }
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }

  async function refreshTrackList() {
    try {
      // getTimelineData gibt alles auf einmal zurück (ein IPC-Call statt zwei)
      const tlData = await window.pesto.getTimelineData();
      if (tlData?.ok) {
        state.timelineData = tlData;
        populateTrackSelect(tlData.videoTrackCount || 0);
      }
    } catch {}
  }
  $('refresh-tracks-btn')?.addEventListener('click', refreshTrackList);
  // Beim Start einmal laden
  refreshTrackList();

  // Slider Live-Badges
  [['maxChars','maxChars-val'], ['maxWords','maxWords-val'], ['fillGaps','fillGaps-val']].forEach(
    ([id, badge]) => $(id)?.addEventListener('input', () => { $(badge).textContent = $(id).value; })
  );

  // Engine-Karten
  document.querySelectorAll('input[name="engine"]').forEach(inp =>
    inp.addEventListener('change', () => updateEngineUI(inp.value))
  );

  // Initial laden
  await loadConfig();
  await loadStyles();
  await checkStatus();

  // Gallery mit gespeicherten Stilen zeigen
  renderGallery();
}

document.addEventListener('DOMContentLoaded', init);
