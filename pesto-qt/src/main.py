#!/usr/bin/env python3
"""
Pesto Captions — PySide6 Desktop App
AGPL-3.0

Standalone desktop app for DaVinci Resolve caption automation.
No Electron, no Node.js — pure Python + Qt.

Run: python3 main.py
"""

import sys
import os
import base64

# Add src/ to path
sys.path.insert(0, os.path.dirname(__file__))

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QTabWidget, QLabel, QPushButton, QComboBox, QSlider, QSpinBox,
    QTextEdit, QLineEdit, QCheckBox, QGroupBox, QScrollArea,
    QProgressBar, QFileDialog, QMessageBox, QSizePolicy,
    QFrame, QGridLayout, QListWidget, QListWidgetItem, QSplitter,
    QStatusBar, QToolBar, QDoubleSpinBox,
)
from PySide6.QtCore import (
    Qt, QThread, Signal, QObject, QTimer, QSize, QSettings
)
from PySide6.QtGui import (
    QFont, QPalette, QColor, QIcon, QPixmap, QAction,
    QFontDatabase,
)

from config_store import load_config, save_config
from segmentation import (
    segment_cues, parse_srt, parse_vtt, export_srt, format_ts,
    DEFAULT_SEGMENTATION, DEFAULT_PUNCTUATION,
)
import resolve_bridge as rb

# ─── Color palette ─────────────────────────────────────────────────
BG         = "#0f1117"
SURFACE    = "#181c24"
SURFACE2   = "#1e2330"
SURFACE3   = "#252b3a"
BORDER     = "#2a3040"
ACCENT     = "#4ade80"       # Pesto green
ACCENT_DIM = "#2d7a4f"
TEXT       = "#dde3ee"
TEXT2      = "#8b95a8"
TEXT3      = "#505870"
ERROR      = "#f87171"
WARNING    = "#fbbf24"
SUCCESS    = "#4ade80"

QSS = f"""
QMainWindow, QWidget {{
    background: #0f1117;
    color: #dde3ee;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
}}
QTabWidget::pane {{
    border: none;
    background: {BG};
}}
QTabBar::tab {{
    background: {SURFACE};
    color: {TEXT2};
    padding: 9px 20px;
    border: none;
    border-bottom: 2px solid transparent;
    margin-right: 2px;
    font-size: 13px;
    font-weight: 500;
}}
QTabBar::tab:selected {{
    color: {ACCENT};
    background: {BG};
    border-bottom: 2px solid {ACCENT};
}}
QTabBar::tab:hover:!selected {{
    color: {TEXT};
    background: {SURFACE2};
}}
QGroupBox {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 10px;
    margin-top: 8px;
    padding: 14px 16px 12px 16px;
    font-weight: 600;
    font-size: 11px;
    color: {TEXT3};
    letter-spacing: 1px;
    text-transform: uppercase;
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    left: 14px;
    top: -1px;
    color: {TEXT3};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.2px;
}}
QPushButton {{
    background: {SURFACE3};
    color: {TEXT};
    border: 1px solid {BORDER};
    border-radius: 8px;
    padding: 7px 18px;
    font-size: 13px;
    font-weight: 500;
}}
QPushButton:hover {{
    background: {SURFACE2};
    border-color: #3a4460;
}}
QPushButton:pressed {{
    background: {SURFACE};
}}
QPushButton:disabled {{
    color: {TEXT3};
    border-color: {BORDER};
}}
QPushButton#primary {{
    background: {ACCENT};
    color: #0a0f0a;
    border: none;
    font-weight: 600;
    padding: 9px 22px;
}}
QPushButton#primary:hover {{
    background: #6ef79e;
}}
QPushButton#primary:disabled {{
    background: {ACCENT_DIM};
    color: #1a2a1a;
}}
QPushButton#danger {{
    background: #3d1414;
    color: {ERROR};
    border-color: #5a1a1a;
}}
QPushButton#danger:hover {{
    background: #4d1a1a;
}}
QComboBox, QLineEdit, QTextEdit, QSpinBox, QDoubleSpinBox {{
    background: {SURFACE2};
    color: {TEXT};
    border: 1px solid {BORDER};
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 13px;
    selection-background-color: {ACCENT_DIM};
}}
QComboBox:focus, QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {{
    border-color: {ACCENT_DIM};
}}
QComboBox::drop-down {{
    border: none;
    width: 20px;
}}
QComboBox QAbstractItemView {{
    background: {SURFACE2};
    color: {TEXT};
    border: 1px solid {BORDER};
    selection-background-color: {ACCENT_DIM};
}}
QSlider::groove:horizontal {{
    height: 4px;
    background: {SURFACE3};
    border-radius: 2px;
}}
QSlider::handle:horizontal {{
    background: {ACCENT};
    width: 14px;
    height: 14px;
    margin: -5px 0;
    border-radius: 7px;
}}
QSlider::sub-page:horizontal {{
    background: {ACCENT_DIM};
    border-radius: 2px;
}}
QProgressBar {{
    background: {SURFACE3};
    border: none;
    border-radius: 4px;
    height: 6px;
    text-align: center;
    font-size: 11px;
    color: {TEXT2};
}}
QProgressBar::chunk {{
    background: {ACCENT};
    border-radius: 4px;
}}
QScrollArea, QScrollBar:vertical {{
    background: transparent;
    border: none;
    width: 6px;
}}
QScrollBar::handle:vertical {{
    background: {BORDER};
    border-radius: 3px;
    min-height: 20px;
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0px;
}}
QListWidget {{
    background: {SURFACE2};
    border: 1px solid {BORDER};
    border-radius: 8px;
    color: {TEXT};
}}
QListWidget::item:selected {{
    background: {ACCENT_DIM};
    color: {TEXT};
}}
QListWidget::item:hover {{
    background: {SURFACE3};
}}
QLabel#heading {{
    font-size: 11px;
    font-weight: 700;
    color: {TEXT3};
    letter-spacing: 1.2px;
}}
QLabel#muted {{
    color: {TEXT2};
    font-size: 12px;
}}
QLabel#accent {{
    color: {ACCENT};
    font-weight: 600;
}}
QCheckBox {{
    color: {TEXT};
    spacing: 8px;
}}
QCheckBox::indicator {{
    width: 16px;
    height: 16px;
    border: 1px solid {BORDER};
    border-radius: 4px;
    background: {SURFACE2};
}}
QCheckBox::indicator:checked {{
    background: {ACCENT};
    border-color: {ACCENT};
}}
QStatusBar {{
    background: {SURFACE};
    color: {TEXT2};
    border-top: 1px solid {BORDER};
    font-size: 12px;
}}
QFrame#separator {{
    background: {BORDER};
    max-height: 1px;
}}
"""


# ─── Worker threads ─────────────────────────────────────────────────

class ConnectWorker(QThread):
    done = Signal(dict)
    error = Signal(str)

    def run(self):
        try:
            info = rb.connect()
            self.done.emit(info)
        except Exception as e:
            self.error.emit(str(e))


class TranscribeWorker(QThread):
    progress = Signal(int, int)
    done = Signal(dict)
    error = Signal(str)

    def __init__(self, engine: str, language: str, model_size: str = "small"):
        super().__init__()
        self.engine = engine
        self.language = language
        self.model_size = model_size

    def run(self):
        try:
            def cb(cur, total):
                self.progress.emit(cur, total)

            if self.engine == "native":
                result = rb.transcribe_native(self.language, progress_cb=cb)
            else:
                # Whisper stub — not yet bundled
                self.error.emit(
                    "Whisper-Binary nicht gefunden.\n\n"
                    "Bitte:\n"
                    "1. Lade whisper.cpp herunter und kompiliere es\n"
                    "2. Platziere die 'main'-Binary auf deinem PATH\n"
                    "3. Lade das Modell nach ~/.pesto-captions/models/\n\n"
                    "Alternative: Nutze die native Resolve-Transkription\n"
                    "oder importiere eine SRT/VTT-Datei."
                )
                return
            self.done.emit(result)
        except Exception as e:
            self.error.emit(str(e))


class ApplyWorker(QThread):
    progress = Signal(int, int)
    done = Signal(dict)
    error = Signal(str)

    def __init__(self, cues, template_name, track_target, bin_name="Pesto Captions"):
        super().__init__()
        self.cues = cues
        self.template_name = template_name
        self.track_target = track_target
        self.bin_name = bin_name

    def run(self):
        try:
            def cb(cur, total):
                self.progress.emit(cur, total)
            result = rb.apply_captions(
                self.cues, self.template_name, self.track_target,
                progress_cb=cb, bin_name=self.bin_name,
            )
            self.done.emit(result)
        except Exception as e:
            self.error.emit(str(e))


class TemplateScanWorker(QThread):
    done = Signal(list)
    error = Signal(str)

    def __init__(self, bin_name):
        super().__init__()
        self.bin_name = bin_name

    def run(self):
        try:
            templates = rb.scan_templates(self.bin_name)
            self.done.emit(templates)
        except Exception as e:
            self.error.emit(str(e))


# ─── Connection Bar ─────────────────────────────────────────────────

class ConnectionBar(QWidget):
    connected = Signal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.timeline_info = None
        self._build()

    def _build(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 6, 14, 6)
        layout.setSpacing(10)

        self.dot = QLabel("●")
        self.dot.setStyleSheet(f"color: {TEXT3}; font-size: 10px;")
        layout.addWidget(self.dot)

        self.status_lbl = QLabel("Nicht verbunden")
        self.status_lbl.setStyleSheet(f"color: {TEXT2}; font-size: 12px;")
        layout.addWidget(self.status_lbl)

        self.project_lbl = QLabel("")
        self.project_lbl.setStyleSheet(f"color: {TEXT}; font-weight: 600; font-size: 12px;")
        layout.addWidget(self.project_lbl)

        self.timeline_lbl = QLabel("")
        self.timeline_lbl.setStyleSheet(f"color: {TEXT3}; font-size: 12px;")
        layout.addWidget(self.timeline_lbl)

        layout.addStretch()

        self.connect_btn = QPushButton("⚡  Verbinden")
        self.connect_btn.setFixedHeight(28)
        self.connect_btn.clicked.connect(self._do_connect)
        layout.addWidget(self.connect_btn)

        self.setStyleSheet(f"""
            QWidget {{
                background: {SURFACE};
                border-bottom: 1px solid {BORDER};
            }}
        """)
        self.setFixedHeight(40)

    def _do_connect(self):
        self.connect_btn.setEnabled(False)
        self.connect_btn.setText("Verbinde …")
        self.dot.setStyleSheet(f"color: {WARNING}; font-size: 10px;")
        self.status_lbl.setText("Verbinde …")

        self._worker = ConnectWorker()
        self._worker.done.connect(self._on_connected)
        self._worker.error.connect(self._on_error)
        self._worker.start()

    def _on_connected(self, info: dict):
        self.timeline_info = info
        self.dot.setStyleSheet(f"color: {ACCENT}; font-size: 10px;")
        self.status_lbl.setText("Verbunden  ·")
        self.project_lbl.setText(info["projectName"])
        self.timeline_lbl.setText(f" / {info['timelineName']}  {info['frameRate']} fps")
        self.connect_btn.setText("↺  Aktualisieren")
        self.connect_btn.setEnabled(True)
        self.connected.emit(info)

    def _on_error(self, msg: str):
        self.dot.setStyleSheet(f"color: {ERROR}; font-size: 10px;")
        self.status_lbl.setText("Fehler")
        self.project_lbl.setText("")
        self.timeline_lbl.setText("")
        self.connect_btn.setText("⚡  Verbinden")
        self.connect_btn.setEnabled(True)
        QMessageBox.critical(self, "Resolve-Verbindung fehlgeschlagen", msg)

    def is_connected(self) -> bool:
        return self.timeline_info is not None


# ─── Transcription Tab ──────────────────────────────────────────────

class TranscriptionTab(QWidget):
    transcription_done = Signal(dict, list)  # result, cues

    def __init__(self, config: dict, parent=None):
        super().__init__(parent)
        self.config = config
        self.result = None
        self.cues = []
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # ── Engine selector ──
        engine_box = QGroupBox("Transkriptions-Engine")
        e_layout = QVBoxLayout(engine_box)

        engine_inner = QHBoxLayout()
        engine_inner.setSpacing(10)

        self.engine_combo = QComboBox()
        self.engine_combo.addItem("🔵  Native Resolve (Standard)", "native")
        self.engine_combo.addItem("🎙  Whisper small", "whisper-small")
        self.engine_combo.addItem("🎙  Whisper medium", "whisper-medium")
        current_engine = self.config.get("engine", "native")
        for i in range(self.engine_combo.count()):
            if self.engine_combo.itemData(i) == current_engine:
                self.engine_combo.setCurrentIndex(i)
                break
        self.engine_combo.currentIndexChanged.connect(self._update_engine_hint)
        engine_inner.addWidget(self.engine_combo, 1)

        self.lang_combo = QComboBox()
        langs = [
            ("🌍  Automatisch", "auto"), ("🇩🇪  Deutsch", "de"),
            ("🇬🇧  English", "en"), ("🇫🇷  Français", "fr"),
            ("🇪🇸  Español", "es"), ("🇮🇹  Italiano", "it"),
            ("🇯🇵  日本語", "ja"), ("🇨🇳  中文", "zh"),
            ("🇵🇹  Português", "pt"), ("🇷🇺  Русский", "ru"),
            ("🇰🇷  한국어", "ko"),
        ]
        for label, val in langs:
            self.lang_combo.addItem(label, val)
        cur_lang = self.config.get("language", "auto")
        for i in range(self.lang_combo.count()):
            if self.lang_combo.itemData(i) == cur_lang:
                self.lang_combo.setCurrentIndex(i)
        engine_inner.addWidget(self.lang_combo)
        e_layout.addLayout(engine_inner)

        self.engine_hint = QLabel()
        self.engine_hint.setObjectName("muted")
        self.engine_hint.setWordWrap(True)
        e_layout.addWidget(self.engine_hint)
        self._update_engine_hint()

        layout.addWidget(engine_box)

        # ── Start button + progress ──
        action_box = QGroupBox("Transkription")
        a_layout = QVBoxLayout(action_box)

        btn_row = QHBoxLayout()
        self.start_btn = QPushButton("🎙  Transkription starten")
        self.start_btn.setObjectName("primary")
        self.start_btn.setMinimumHeight(40)
        self.start_btn.clicked.connect(self._start_transcription)
        btn_row.addWidget(self.start_btn, 1)

        import_btn = QPushButton("📄  SRT / VTT importieren")
        import_btn.clicked.connect(self._import_file)
        btn_row.addWidget(import_btn)
        a_layout.addLayout(btn_row)

        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setFixedHeight(6)
        a_layout.addWidget(self.progress_bar)

        self.progress_lbl = QLabel("")
        self.progress_lbl.setObjectName("muted")
        self.progress_lbl.setAlignment(Qt.AlignCenter)
        a_layout.addWidget(self.progress_lbl)

        self.status_lbl = QLabel("")
        self.status_lbl.setWordWrap(True)
        a_layout.addWidget(self.status_lbl)

        layout.addWidget(action_box)

        # ── Transcript editor ──
        editor_box = QGroupBox("Transkript bearbeiten")
        ed_layout = QVBoxLayout(editor_box)

        self.cue_count_lbl = QLabel("Kein Transkript")
        self.cue_count_lbl.setObjectName("muted")
        ed_layout.addWidget(self.cue_count_lbl)

        # Editable table: Index | Text | Start | End
        from PySide6.QtWidgets import QTableWidget, QTableWidgetItem, QHeaderView, QAbstractItemView
        self.transcript_table = QTableWidget()
        self.transcript_table.setColumnCount(4)
        self.transcript_table.setHorizontalHeaderLabels(["#", "Text", "Start", "Ende"])
        self.transcript_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.transcript_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
        self.transcript_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Fixed)
        self.transcript_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Fixed)
        self.transcript_table.setColumnWidth(0, 58)
        self.transcript_table.setColumnWidth(2, 118)
        self.transcript_table.setColumnWidth(3, 118)
        self.transcript_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.transcript_table.setAlternatingRowColors(True)
        self.transcript_table.verticalHeader().setVisible(False)
        self.transcript_table.setEditTriggers(
            QAbstractItemView.DoubleClicked | QAbstractItemView.EditKeyPressed
        )
        # Single click -> navigate Resolve playhead
        self.transcript_table.cellClicked.connect(self._on_cell_clicked)
        # Cell changed -> update cue data
        self.transcript_table.cellChanged.connect(self._on_cell_changed)
        self.transcript_table.setStyleSheet("""
            QTableWidget {
                background: #181c24;
                alternate-background-color: #1e2330;
                border: 1px solid #2a3040;
                border-radius: 8px;
                gridline-color: #2a3040;
            }
            QTableWidget::item {
                padding: 6px 8px;
                color: #dde3ee;
                border: none;
            }
            QTableWidget::item:selected {
                background: #2d7a4f;
                color: #dde3ee;
            }
            QHeaderView::section {
                background: #252b3a;
                color: #8b95a8;
                border: none;
                border-right: 1px solid #2a3040;
                border-bottom: 1px solid #2a3040;
                padding: 5px 8px;
                font-weight: 600;
                font-size: 11px;
                letter-spacing: 0.5px;
            }
        """)
        ed_layout.addWidget(self.transcript_table)

        hint = QLabel("Einfachklick: Resolve-Playhead springt zur Stelle  ·  Doppelklick: Text/Timing bearbeiten")
        hint.setObjectName("muted")
        hint.setAlignment(Qt.AlignCenter)
        ed_layout.addWidget(hint)

        layout.addWidget(editor_box, 1)

    def _update_engine_hint(self):
        engine = self.engine_combo.currentData()
        hints = {
            "native": "Native Transkription: Schnell, kein Download — Wort-genaues Timing evtl. eingeschränkt.",
            "whisper-small": "Whisper small: Benötigt Modell-Download (~450 MB). Garantiert Wort-für-Wort-Timing.",
            "whisper-medium": "Whisper medium: Benötigt Modell-Download (~1.5 GB). Genaueste Ergebnisse.",
        }
        self.engine_hint.setText(hints.get(engine, ""))

    def _start_transcription(self):
        self.start_btn.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        self.progress_lbl.setText("Transkribiere …")
        self.status_lbl.setText("")

        engine = self.engine_combo.currentData()
        language = self.lang_combo.currentData()

        self._worker = TranscribeWorker(engine, language)
        self._worker.progress.connect(self._on_progress)
        self._worker.done.connect(self._on_done)
        self._worker.error.connect(self._on_error)
        self._worker.start()

    def _on_progress(self, cur, total):
        if total > 0:
            self.progress_bar.setValue(int(cur / total * 100))

    def _on_done(self, result: dict):
        self.result = result
        self.start_btn.setEnabled(True)
        self.progress_bar.setVisible(False)

        # Segment
        seg_cfg = self.config.get("segmentation", {})
        self.cues = segment_cues(result, seg_cfg)
        self._populate_list()

        word_ok = result.get("wordTimingAvailable", False)
        if word_ok:
            self.status_lbl.setStyleSheet(f"color: {SUCCESS};")
            self.status_lbl.setText("✓ Wort-genaues Timing verfügbar — **Emphasis**-Markup nutzbar.")
        else:
            self.status_lbl.setStyleSheet(f"color: {WARNING};")
            self.status_lbl.setText(
                "⚠ Kein Wort-Timing — Emphasis-Markup deaktiviert.\n"
                "Für Wort-Timing: Whisper wählen."
            )

        self.progress_lbl.setText(f"{len(self.cues)} Cues generiert")
        self.transcription_done.emit(result, self.cues)

    def _on_error(self, msg: str):
        self.start_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        self.progress_lbl.setText("Fehler")
        self.status_lbl.setStyleSheet(f"color: {ERROR};")
        self.status_lbl.setText(msg)

    def _import_file(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "SRT oder VTT importieren", "", "Untertitel (*.srt *.vtt)"
        )
        if not path:
            return
        with open(path, encoding="utf-8") as f:
            content = f.read()
        if path.endswith(".vtt"):
            phrases = parse_vtt(content)
        else:
            phrases = parse_srt(content)

        result = {"wordTimingAvailable": False, "phrases": phrases}
        self._on_done(result)

    def _on_cell_clicked(self, row: int, col: int):
        """Single click: navigate Resolve playhead to this cue's start."""
        if row < len(self.cues):
            import threading
            cue = self.cues[row]
            threading.Thread(
                target=rb.navigate_to_timecode,
                args=(cue["startSec"],),
                daemon=True,
            ).start()

    def _on_cell_changed(self, row: int, col: int):
        """Cell edited by user: sync change back to cues data."""
        if row >= len(self.cues):
            return
        item = self.transcript_table.item(row, col)
        if not item:
            return
        value = item.text().strip()

        self.transcript_table.blockSignals(True)
        try:
            if col == 1:  # Text
                self.cues[row]["runs"] = [{"text": value, "emphasis": False}]
            elif col == 2:  # Start
                sec = self._parse_ts_input(value)
                if sec is not None:
                    self.cues[row]["startSec"] = sec
                    item.setText(format_ts(sec))
            elif col == 3:  # End
                sec = self._parse_ts_input(value)
                if sec is not None:
                    self.cues[row]["endSec"] = sec
                    item.setText(format_ts(sec))
        finally:
            self.transcript_table.blockSignals(False)

        self.transcription_done.emit(self.result or {}, self.cues)

    @staticmethod
    def _parse_ts_input(ts: str) -> float | None:
        """Parse HH:MM:SS,mmm or HH:MM:SS.mmm timecode into seconds."""
        import re
        ts = ts.strip().replace(",", ".")
        parts = ts.split(":")
        try:
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            if len(parts) == 2:
                return int(parts[0]) * 60 + float(parts[1])
            return float(parts[0])
        except Exception:
            return None

    def _populate_list(self):
        from PySide6.QtWidgets import QTableWidgetItem
        from PySide6.QtCore import Qt
        self.transcript_table.blockSignals(True)
        self.transcript_table.setRowCount(0)
        self.transcript_table.setRowCount(len(self.cues))
        self.cue_count_lbl.setText(f"{len(self.cues)} Cues  \u00b7  Doppelklick zum Bearbeiten")

        for i, cue in enumerate(self.cues):
            text = "".join(r["text"] for r in cue["runs"])

            idx_item = QTableWidgetItem(f"{cue['cueIndex']:03d}")
            idx_item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)  # not editable
            idx_item.setTextAlignment(Qt.AlignCenter | Qt.AlignVCenter)
            idx_item.setForeground(QColor(TEXT3))

            text_item = QTableWidgetItem(text)
            text_item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable | Qt.ItemIsEditable)

            start_item = QTableWidgetItem(format_ts(cue["startSec"]))
            timing_editable = cue.get("timingEditable", False)
            if timing_editable:
                start_item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable | Qt.ItemIsEditable)
            else:
                start_item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
                start_item.setForeground(QColor(TEXT3))

            end_item = QTableWidgetItem(format_ts(cue["endSec"]))
            if timing_editable:
                end_item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable | Qt.ItemIsEditable)
            else:
                end_item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
                end_item.setForeground(QColor(TEXT3))

            self.transcript_table.setItem(i, 0, idx_item)
            self.transcript_table.setItem(i, 1, text_item)
            self.transcript_table.setItem(i, 2, start_item)
            self.transcript_table.setItem(i, 3, end_item)
            self.transcript_table.setRowHeight(i, 44)

        self.transcript_table.blockSignals(False)

    def resegment(self, seg_cfg: dict):
        """Re-run segmentation with new settings."""
        if not self.result:
            return
        self.config["segmentation"] = seg_cfg
        self.cues = segment_cues(self.result, seg_cfg)
        self._populate_list()
        self.transcription_done.emit(self.result, self.cues)

    def get_cues(self) -> list:
        return self.cues


# ─── Style Tab ──────────────────────────────────────────────────────

class StyleCard(QWidget):
    """Clickable style/template card. Emits load_clicked on click, delete_clicked for saved styles."""
    load_clicked = Signal(dict)
    delete_clicked = Signal(str)   # emits path (only for saved styles)

    def __init__(self, style: dict, parent=None):
        super().__init__(parent)
        self.style = style
        self._selected = False
        self._build()
        self.setCursor(Qt.PointingHandCursor)

    def _build(self):
        is_saved = bool(self.style.get("path") or self.style.get("_source") == "saved")
        badge_text = "⭐ Gespeichert" if is_saved else "📁 Bin"
        display_name = self.style.get("name") or self.style.get("clipName", "")

        self.setFixedSize(170, 200)
        self._base_style = f"""
            StyleCard {{
                background: {SURFACE2};
                border: 1px solid {BORDER};
                border-radius: 10px;
            }}
            StyleCard:hover {{
                border-color: {ACCENT_DIM};
                background: {SURFACE3};
            }}
        """
        self._sel_style = f"""
            StyleCard {{
                background: {SURFACE2};
                border: 2px solid {ACCENT};
                border-radius: 10px;
            }}
        """
        self.setStyleSheet(self._base_style)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(7, 7, 7, 7)
        layout.setSpacing(5)

        # Thumbnail
        thumb_lbl = QLabel()
        thumb_lbl.setFixedSize(156, 90)
        thumb_lbl.setAlignment(Qt.AlignCenter)
        thumb_lbl.setStyleSheet(f"""
            background: {SURFACE3};
            border: 1px solid {BORDER};
            border-radius: 5px;
            color: {TEXT3};
            font-size: 10px;
        """)
        thumb_b64 = self.style.get("thumbnail", "")
        if thumb_b64:
            try:
                raw = base64.b64decode(thumb_b64)
                # SVG data
                if raw.strip().startswith(b'<svg') or raw.strip().startswith(b'<?xml'):
                    from PySide6.QtSvg import QSvgRenderer
                    from PySide6.QtGui import QPainter
                    renderer = QSvgRenderer(raw)
                    pixmap = QPixmap(156, 90)
                    pixmap.fill(Qt.transparent)
                    painter = QPainter(pixmap)
                    renderer.render(painter)
                    painter.end()
                    thumb_lbl.setPixmap(pixmap)
                else:
                    pixmap = QPixmap()
                    pixmap.loadFromData(raw)
                    if not pixmap.isNull():
                        thumb_lbl.setPixmap(pixmap.scaled(156, 90, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                    else:
                        thumb_lbl.setText("Vorschau\nnicht verfügbar")
            except Exception:
                thumb_lbl.setText("Vorschau\nnicht verfügbar")
        else:
            thumb_lbl.setText("Kein\nThumbnail")
        layout.addWidget(thumb_lbl)

        # Badge
        badge_lbl = QLabel(badge_text)
        badge_lbl.setAlignment(Qt.AlignCenter)
        badge_lbl.setStyleSheet(f"color: {ACCENT_DIM}; font-size: 9px; font-weight: 600; letter-spacing: 0.5px;")
        layout.addWidget(badge_lbl)

        # Name
        name_lbl = QLabel(display_name)
        name_lbl.setWordWrap(True)
        name_lbl.setAlignment(Qt.AlignCenter)
        name_lbl.setStyleSheet(f"color: {TEXT}; font-weight: 600; font-size: 11px;")
        layout.addWidget(name_lbl)

        layout.addStretch()

        # Delete button (only for saved styles)
        if is_saved:
            del_btn = QPushButton("✕ Löschen")
            del_btn.setFixedHeight(22)
            del_btn.setStyleSheet(f"""
                QPushButton {{
                    background: transparent;
                    color: {ERROR};
                    border: 1px solid #5a1a1a;
                    border-radius: 4px;
                    font-size: 10px;
                }}
                QPushButton:hover {{ background: #3d1414; }}
            """)
            del_btn.clicked.connect(lambda: self.delete_clicked.emit(self.style.get("path", "")))
            layout.addWidget(del_btn)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.load_clicked.emit(self.style)
        super().mousePressEvent(event)

    def set_selected(self, selected: bool):
        self._selected = selected
        self.setStyleSheet(self._sel_style if selected else self._base_style)




class StyleTab(QWidget):
    def __init__(self, config: dict, parent=None):
        super().__init__(parent)
        self.config = config
        self.templates = []
        self.selected_template = None
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # ── Unified gallery (bin templates + saved styles) ────────────
        gallery_box = QGroupBox("Stile & Templates")
        g_layout = QVBoxLayout(gallery_box)
        g_layout.setSpacing(8)

        top_row = QHBoxLayout()
        self.refresh_btn = QPushButton("↺  Aktualisieren")
        self.refresh_btn.clicked.connect(self._scan_and_refresh)
        top_row.addWidget(self.refresh_btn)
        top_row.addStretch()
        g_layout.addLayout(top_row)

        self.gallery_area = QScrollArea()
        self.gallery_area.setWidgetResizable(True)
        self.gallery_area.setFixedHeight(225)
        self.gallery_area.setFrameShape(QFrame.NoFrame)
        self.gallery_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.gallery_area.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.gallery_area.setStyleSheet(f"""
            QScrollArea {{ background: {SURFACE3}; border: 1px solid {BORDER}; border-radius: 8px; }}
        """)
        self.gallery_widget = QWidget()
        self.gallery_flow = QHBoxLayout(self.gallery_widget)
        self.gallery_flow.setContentsMargins(8, 8, 8, 8)
        self.gallery_flow.setSpacing(10)
        self.gallery_flow.addStretch()
        self.gallery_area.setWidget(self.gallery_widget)
        g_layout.addWidget(self.gallery_area)

        self.gallery_status = QLabel("Klicke auf ↺ Aktualisieren, um Templates zu laden.")
        self.gallery_status.setObjectName("muted")
        self.gallery_status.setWordWrap(True)
        g_layout.addWidget(self.gallery_status)

        layout.addWidget(gallery_box)

        # ── Detail panel (hidden until a card is clicked) ─────────────
        self.detail_box = QGroupBox("Ausgewählt")
        self.detail_box.setVisible(False)
        d_layout = QHBoxLayout(self.detail_box)
        d_layout.setSpacing(14)

        self.detail_thumb = QLabel("—")
        self.detail_thumb.setFixedSize(160, 90)
        self.detail_thumb.setAlignment(Qt.AlignCenter)
        self.detail_thumb.setStyleSheet(f"""
            background: {SURFACE3};
            border: 1px solid {BORDER};
            border-radius: 6px;
            color: {TEXT3};
            font-size: 11px;
        """)
        d_layout.addWidget(self.detail_thumb)

        d_right = QVBoxLayout()
        d_right.setSpacing(6)

        self.detail_name = QLabel("")
        self.detail_name.setStyleSheet(f"color: {TEXT}; font-weight: 700; font-size: 14px;")
        d_right.addWidget(self.detail_name)

        self.detail_sub = QLabel("")
        self.detail_sub.setStyleSheet(f"color: {TEXT3}; font-size: 11px;")
        d_right.addWidget(self.detail_sub)

        d_right.addStretch()

        save_row = QHBoxLayout()
        save_row.setSpacing(8)
        self.style_name_input = QLineEdit()
        self.style_name_input.setPlaceholderText("Als Stil speichern …")
        save_row.addWidget(self.style_name_input, 1)
        self.save_style_btn = QPushButton("💾  Speichern")
        self.save_style_btn.setObjectName("primary")
        self.save_style_btn.clicked.connect(self._save_current_style)
        save_row.addWidget(self.save_style_btn)
        d_right.addLayout(save_row)

        self.save_status_lbl = QLabel("")
        self.save_status_lbl.setObjectName("muted")
        self.save_status_lbl.setWordWrap(True)
        d_right.addWidget(self.save_status_lbl)

        d_layout.addLayout(d_right, 1)
        layout.addWidget(self.detail_box)

        # ── Phrasenbildung ───────────────────────────────────────────
        seg_box = QGroupBox("Phrasenbildung & Stilregeln")
        s_layout = QGridLayout(seg_box)
        s_layout.setHorizontalSpacing(16)
        s_layout.setVerticalSpacing(10)
        seg = self.config.get("segmentation", {})

        s_layout.addWidget(QLabel("Max. Zeichen"), 0, 0)
        self.chars_slider = QSlider(Qt.Horizontal)
        self.chars_slider.setRange(20, 120)
        self.chars_slider.setValue(seg.get("maxChars", 42))
        self.chars_val = QLabel(str(seg.get("maxChars", 42)))
        self.chars_val.setObjectName("accent")
        self.chars_val.setFixedWidth(34)
        self.chars_slider.valueChanged.connect(lambda v: self.chars_val.setText(str(v)))
        self.chars_slider.valueChanged.connect(self._emit_seg_change)
        s_layout.addWidget(self.chars_slider, 0, 1)
        s_layout.addWidget(self.chars_val, 0, 2)

        s_layout.addWidget(QLabel("Max. Wörter"), 1, 0)
        self.words_slider = QSlider(Qt.Horizontal)
        self.words_slider.setRange(2, 20)
        self.words_slider.setValue(seg.get("maxWords", 8))
        self.words_val = QLabel(str(seg.get("maxWords", 8)))
        self.words_val.setObjectName("accent")
        self.words_val.setFixedWidth(34)
        self.words_slider.valueChanged.connect(lambda v: self.words_val.setText(str(v)))
        self.words_slider.valueChanged.connect(self._emit_seg_change)
        s_layout.addWidget(self.words_slider, 1, 1)
        s_layout.addWidget(self.words_val, 1, 2)

        s_layout.addWidget(QLabel("Min. Dauer (ms)"), 2, 0)
        self.min_dur = QSpinBox()
        self.min_dur.setRange(100, 5000)
        self.min_dur.setSingleStep(100)
        self.min_dur.setValue(seg.get("minDurationMs", 500))
        self.min_dur.valueChanged.connect(self._emit_seg_change)
        s_layout.addWidget(self.min_dur, 2, 1, 1, 2)

        s_layout.addWidget(QLabel("Max. Dauer (ms)"), 3, 0)
        self.max_dur = QSpinBox()
        self.max_dur.setRange(1000, 30000)
        self.max_dur.setSingleStep(500)
        self.max_dur.setValue(seg.get("maxDurationMs", 5000))
        self.max_dur.valueChanged.connect(self._emit_seg_change)
        s_layout.addWidget(self.max_dur, 3, 1, 1, 2)

        s_layout.addWidget(QLabel("Lücken füllen (ms)"), 4, 0)
        self.gap_slider = QSlider(Qt.Horizontal)
        self.gap_slider.setRange(0, 2000)
        self.gap_slider.setSingleStep(50)
        self.gap_slider.setValue(seg.get("fillGapsMs", 0))
        self.gap_val = QLabel(str(seg.get("fillGapsMs", 0)))
        self.gap_val.setObjectName("accent")
        self.gap_val.setFixedWidth(44)
        self.gap_slider.valueChanged.connect(lambda v: self.gap_val.setText(str(v)))
        self.gap_slider.valueChanged.connect(self._emit_seg_change)
        s_layout.addWidget(self.gap_slider, 4, 1)
        s_layout.addWidget(self.gap_val, 4, 2)

        s_layout.addWidget(QLabel("Schreibweise"), 5, 0)
        self.casing_combo = QComboBox()
        self.casing_combo.addItems(["Unverändert", "GROSSBUCHSTABEN", "kleinbuchstaben", "Satzmodus"])
        casing_map = {"unchanged": 0, "uppercase": 1, "lowercase": 2, "sentence": 3}
        self.casing_combo.setCurrentIndex(casing_map.get(seg.get("casing", "unchanged"), 0))
        self.casing_combo.currentIndexChanged.connect(self._emit_seg_change)
        s_layout.addWidget(self.casing_combo, 5, 1, 1, 2)
        layout.addWidget(seg_box)

        # ── Interpunktion ────────────────────────────────────────────
        punct_box = QGroupBox("Interpunktions-Normalisierung")
        p_layout = QGridLayout(punct_box)
        p_layout.setHorizontalSpacing(12)
        p_layout.setVerticalSpacing(6)
        punct_cfg = seg.get("punctuation", DEFAULT_PUNCTUATION)
        punct_items = [
            ("comma", ", Komma"), ("period", ". Punkt"), ("questionMark", "? Fragezeichen"),
            ("exclamationMark", "! Ausrufezeichen"), ("quotes", "Anfuehrung"), ("dash", "- Strich"),
            ("semicolon", "; Semikolon"), ("colon", ": Doppelpunkt"),
        ]
        self._punct_checks = {}
        for idx, (key, label) in enumerate(punct_items):
            cb = QCheckBox(label)
            cb.setChecked(punct_cfg.get(key, True))
            cb.stateChanged.connect(self._emit_seg_change)
            p_layout.addWidget(cb, idx // 4, idx % 4)
            self._punct_checks[key] = cb
        layout.addWidget(punct_box)
        layout.addStretch()

        # Populate saved styles on open (bin templates need manual refresh)
        self._populate_saved_styles()

    # ── Gallery helpers ───────────────────────────────────────────────

    def _add_gallery_card(self, entry: dict):
        """Add a single card to the gallery flow (inserted before the stretch)."""
        card = StyleCard(entry)
        card.load_clicked.connect(self._on_card_selected)
        card.delete_clicked.connect(self._delete_style)
        self.gallery_flow.insertWidget(self.gallery_flow.count() - 1, card)

    def _clear_gallery(self):
        while self.gallery_flow.count() > 1:
            item = self.gallery_flow.takeAt(0)
            if item and item.widget():
                item.widget().deleteLater()

    def _populate_saved_styles(self):
        """Add saved-style cards to the gallery (always available offline)."""
        import style_manager as sm
        styles = sm.list_styles()
        for s in styles:
            # Mark as saved so card shows delete button
            s["_source"] = "saved"
            self._add_gallery_card(s)
        n = len(styles)
        cur = self.gallery_status.text()
        if n:
            self.gallery_status.setText(f"{n} gespeicherte{'r Stil' if n==1 else ' Stile'} geladen. "
                                        "Klicke ↺ für Bin-Templates.")

    def _scan_and_refresh(self):
        """Scan Resolve bin and merge with saved styles into the gallery."""
        self.refresh_btn.setEnabled(False)
        self.refresh_btn.setText("Suche …")
        self.gallery_status.setText("Scanne Bin …")
        bin_name = self.config.get("binName", "Pesto Captions")
        self._scan_worker = TemplateScanWorker(bin_name)
        self._scan_worker.done.connect(self._on_scan_done)
        self._scan_worker.error.connect(self._on_scan_error)
        self._scan_worker.start()

    def _on_scan_done(self, templates: list):
        self.templates = templates
        self.refresh_btn.setEnabled(True)
        self.refresh_btn.setText("↺  Aktualisieren")
        self._clear_gallery()

        # Saved styles first
        import style_manager as sm
        saved = sm.list_styles()
        for s in saved:
            s["_source"] = "saved"
            self._add_gallery_card(s)

        # Bin created (empty) marker
        if len(templates) == 1 and templates[0].get("clipName") == "__BIN_CREATED__":
            bin_name = self.config.get("binName", "Pesto Captions")
            self.gallery_status.setStyleSheet(f"color: {WARNING};")
            self.gallery_status.setText(
                f"✓ Bin '{bin_name}' automatisch angelegt – noch leer.\n"
                "Ziehe Fusion-Title-Clips hinein und klicke ↺."
            )
            return

        # Bin templates — skip any whose clipName is already a saved style
        saved_names = {s.get("clipName", "") for s in saved}
        new_from_bin = 0
        for t in templates:
            if t.get("clipName") == "__BIN_CREATED__":
                continue
            if t.get("clipName") in saved_names:
                continue  # already shown as saved style
            t["_source"] = "bin"
            t["name"] = t.get("clipName", "")
            self._add_gallery_card(t)
            new_from_bin += 1

        n_bin = new_from_bin
        n_saved = len(saved)
        n_already = len([t for t in templates
                         if t.get("clipName") != "__BIN_CREATED__" and
                         t.get("clipName") in saved_names])
        status = f"{n_bin} neue{'s' if n_bin!=1 else ''} Bin-Template{'s' if n_bin!=1 else ''}  ·  {n_saved} gespeicherter{'e Stile' if n_saved!=1 else ' Stil'}"
        if n_already:
            status += f"  (✓ {n_already} bereits gespeichert)"
        self.gallery_status.setStyleSheet(f"color: {TEXT3};")
        self.gallery_status.setText(status)

    def _on_scan_error(self, msg: str):
        self.refresh_btn.setEnabled(True)
        self.refresh_btn.setText("↺  Aktualisieren")
        self.gallery_status.setStyleSheet(f"color: {ERROR};")
        diag_lines = rb.list_all_bins()
        diag = ", ".join(diag_lines[:8]) or "—"
        self.gallery_status.setText(f"{msg}\nSichtbare Bins: {diag}")

    # ── Card selection / detail panel ────────────────────────────────

    def _on_card_selected(self, entry: dict):
        """Show detail panel for the selected template/style card."""
        # Build pseudo-template dict
        self.selected_template = {
            "clipName": entry.get("clipName") or entry.get("name", ""),
            "thumbnail": entry.get("thumbnail", ""),
            "sourceBinType": entry.get("sourceBinType", "local"),
            "nodeNameOk": True,
            "fallbackNodeName": None,
        }

        name = self.selected_template["clipName"]
        source = entry.get("_source", "bin")
        badge = "⭐ Gespeichert" if source == "saved" else "📁 Bin"
        self.detail_name.setText(name)
        self.detail_sub.setText(f"{badge}  ·  {self.config.get('binName', 'Pesto Captions')}")
        self.save_status_lbl.setText("")
        self.style_name_input.setText(name)  # pre-fill with template name

        # Thumbnail
        thumb_b64 = self.selected_template.get("thumbnail", "")
        if thumb_b64:
            try:
                pixmap = QPixmap()
                pixmap.loadFromData(base64.b64decode(thumb_b64))
                if not pixmap.isNull():
                    self.detail_thumb.setPixmap(
                        pixmap.scaled(160, 90, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                    )
                    self.detail_thumb.setText("")
                else:
                    self.detail_thumb.setText("Vorschau\nnicht verfügbar")
            except Exception:
                self.detail_thumb.setText("Vorschau\nnicht verfügbar")
        else:
            self.detail_thumb.setText("Kein\nThumbnail")

        self.detail_box.setVisible(True)

    # ── Style save / delete ──────────────────────────────────────────

    def _save_current_style(self):
        if not self.selected_template:
            return
        name = self.style_name_input.text().strip()
        if not name:
            self.save_status_lbl.setStyleSheet(f"color: {WARNING};")
            self.save_status_lbl.setText("Bitte einen Stilnamen eingeben.")
            return
        try:
            import style_manager as sm
            sm.save_style(
                name=name,
                clip_name=self.selected_template.get("clipName", ""),
                bin_name=self.config.get("binName", "Pesto Captions"),
                thumbnail_b64=self.selected_template.get("thumbnail") or "",
            )
            self.save_status_lbl.setStyleSheet(f"color: {SUCCESS};")
            self.save_status_lbl.setText(f"✓ '{name}' gespeichert.")
            # Re-populate gallery so the new card appears
            self._clear_gallery()
            self._populate_saved_styles()
            for t in self.templates:
                t["_source"] = "bin"
                t["name"] = t.get("clipName", "")
                self._add_gallery_card(t)
        except Exception as e:
            self.save_status_lbl.setStyleSheet(f"color: {ERROR};")
            self.save_status_lbl.setText(f"Fehler: {e}")

    def _delete_style(self, path: str):
        if not path:
            return
        reply = QMessageBox.question(
            self, "Stil löschen", "Diesen Stil wirklich löschen?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            import style_manager as sm
            sm.delete_style(path)
            # Rebuild gallery
            self._clear_gallery()
            self._populate_saved_styles()
            for t in self.templates:
                t["_source"] = "bin"
                t["name"] = t.get("clipName", "")
                self._add_gallery_card(t)
            if self.detail_box.isVisible():
                self.detail_box.setVisible(False)

    # ── Segmentation helpers ─────────────────────────────────────────

    def _emit_seg_change(self):
        cfg = self._get_seg_config()
        self.config["segmentation"] = cfg
        if hasattr(self.parent(), "parent") and hasattr(self.parent().parent(), "_on_seg_changed"):
            self.parent().parent()._on_seg_changed(cfg)

    def _get_seg_config(self) -> dict:
        casing_vals = ["unchanged", "uppercase", "lowercase", "sentence"]
        punct = {k: cb.isChecked() for k, cb in self._punct_checks.items()}
        return {
            "maxChars": self.chars_slider.value(),
            "maxWords": self.words_slider.value(),
            "minDurationMs": self.min_dur.value(),
            "maxDurationMs": self.max_dur.value(),
            "fillGapsMs": self.gap_slider.value(),
            "casing": casing_vals[self.casing_combo.currentIndex()],
            "punctuation": punct,
        }

    def get_selected_template(self):
        return self.selected_template




class ApplyTab(QWidget):
    def __init__(self, config: dict, parent=None):
        super().__init__(parent)
        self.config = config
        self.cues = []
        self.template = None
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Summary
        sum_box = QGroupBox("Zusammenfassung")
        s_layout = QHBoxLayout(sum_box)

        def stat(val_txt, label_txt):
            w = QWidget()
            wl = QVBoxLayout(w)
            wl.setContentsMargins(0, 0, 0, 0)
            wl.setSpacing(2)
            val = QLabel(val_txt)
            val.setObjectName("accent")
            val.setStyleSheet(f"color: {ACCENT}; font-size: 26px; font-weight: 700;")
            val.setAlignment(Qt.AlignCenter)
            lbl = QLabel(label_txt)
            lbl.setObjectName("muted")
            lbl.setAlignment(Qt.AlignCenter)
            wl.addWidget(val)
            wl.addWidget(lbl)
            return w, val

        self.cue_count_w, self.cue_count_v = stat("0", "Cues")
        self.tmpl_ok_w, self.tmpl_ok_v = stat("–", "Template")
        self.resolve_ok_w, self.resolve_ok_v = stat("✕", "Resolve")
        s_layout.addWidget(self.cue_count_w)
        s_layout.addWidget(self.tmpl_ok_w)
        s_layout.addWidget(self.resolve_ok_w)
        layout.addWidget(sum_box)

        # Track target
        track_box = QGroupBox("Ziel-Videospur")
        tr_layout = QHBoxLayout(track_box)
        tr_layout.addWidget(QLabel("Spur:"))
        self.track_combo = QComboBox()
        self.track_combo.addItem("Neue Spur anlegen (empfohlen)", 0)
        for i in range(1, 9):
            self.track_combo.addItem(f"Spur {i}", i)
        tr_layout.addWidget(self.track_combo)
        tr_layout.addStretch()
        layout.addWidget(track_box)

        # Apply button + progress
        apply_box = QGroupBox("Anwenden")
        a_layout = QVBoxLayout(apply_box)

        self.apply_btn = QPushButton("✨  Captions auf Timeline anwenden")
        self.apply_btn.setObjectName("primary")
        self.apply_btn.setMinimumHeight(44)
        self.apply_btn.clicked.connect(self._apply)
        a_layout.addWidget(self.apply_btn)

        self.apply_progress = QProgressBar()
        self.apply_progress.setVisible(False)
        self.apply_progress.setFixedHeight(6)
        a_layout.addWidget(self.apply_progress)

        self.apply_status = QLabel("")
        self.apply_status.setWordWrap(True)
        a_layout.addWidget(self.apply_status)

        layout.addWidget(apply_box)

        # Render presets
        render_box = QGroupBox("Render starten (optional)")
        r_layout = QHBoxLayout(render_box)
        self.preset_combo = QComboBox()
        self.preset_combo.addItem("— Preset wählen —", "")
        r_layout.addWidget(self.preset_combo, 1)
        self.render_btn = QPushButton("▶  Render starten")
        self.render_btn.clicked.connect(self._start_render)
        r_layout.addWidget(self.render_btn)
        layout.addWidget(render_box)

        layout.addStretch()

    def update_state(self, cues: list, template, is_connected: bool):
        self.cues = cues
        self.template = template
        self.cue_count_v.setText(str(len(cues)))
        self.tmpl_ok_v.setText("✓" if template else "–")
        self.tmpl_ok_v.setStyleSheet(
            f"color: {ACCENT}; font-size: 26px; font-weight: 700;" if template
            else f"color: {TEXT3}; font-size: 26px; font-weight: 700;"
        )
        self.resolve_ok_v.setText("✓" if is_connected else "✕")
        self.resolve_ok_v.setStyleSheet(
            f"color: {ACCENT}; font-size: 26px; font-weight: 700;" if is_connected
            else f"color: {ERROR}; font-size: 26px; font-weight: 700;"
        )
        self.apply_btn.setEnabled(bool(cues and template and is_connected))

        # Load render presets
        if is_connected:
            presets = rb.list_presets()
            self.preset_combo.clear()
            self.preset_combo.addItem("— Preset wählen —", "")
            for p in presets:
                self.preset_combo.addItem(p, p)

    def _apply(self):
        if not self.cues or not self.template:
            return
        self.apply_btn.setEnabled(False)
        self.apply_progress.setVisible(True)
        self.apply_progress.setValue(0)
        self.apply_status.setText("")

        track = self.track_combo.currentData()
        bin_name = self.config.get("binName", "Pesto Captions")
        self._worker = ApplyWorker(self.cues, self.template["clipName"], track, bin_name=bin_name)
        self._worker.progress.connect(self._on_progress)
        self._worker.done.connect(self._on_done)
        self._worker.error.connect(self._on_error)
        self._worker.start()

    def _on_progress(self, cur, total):
        if total > 0:
            self.apply_progress.setValue(int(cur / total * 100))
        self.apply_status.setText(f"Cue {cur} von {total} …")

    def _on_done(self, result: dict):
        self.apply_btn.setEnabled(True)
        self.apply_progress.setVisible(False)
        errors = result.get("errors", [])

        # Build extra info line for bin/clip auto-placement
        bin_name = self.config.get("binName", "Pesto Captions")
        extra_lines = []
        if result.get("bin_created"):
            extra_lines.append(f"📁 Bin \u201e{bin_name}\u201c automatisch angelegt.")
        if result.get("clip_placed_in_bin"):
            extra_lines.append(
                f"📌 Template-Clip in Bin \u201e{bin_name}\u201c verschoben."
            )
        extra = ("\n" + "  ·  ".join(extra_lines)) if extra_lines else ""

        if errors:
            self.apply_status.setStyleSheet(f"color: {WARNING};")
            self.apply_status.setText(
                f"⚠ Fertig mit {len(errors)} Warnungen:\n" + "\n".join(errors[:5]) + extra
            )
        else:
            self.apply_status.setStyleSheet(f"color: {SUCCESS};")
            self.apply_status.setText(
                f"🎉 Alle {len(self.cues)} Captions erfolgreich angewendet!{extra}"
            )

    def _on_error(self, msg: str):
        self.apply_btn.setEnabled(True)
        self.apply_progress.setVisible(False)
        self.apply_status.setStyleSheet(f"color: {ERROR};")
        self.apply_status.setText(msg)

    def _start_render(self):
        preset = self.preset_combo.currentData()
        if not preset:
            return
        try:
            rb.start_render(preset)
            self.apply_status.setStyleSheet(f"color: {SUCCESS};")
            self.apply_status.setText(f"⏳ Render mit Preset '{preset}' gestartet.")
        except Exception as e:
            self.apply_status.setStyleSheet(f"color: {ERROR};")
            self.apply_status.setText(str(e))


# ─── Settings Tab ───────────────────────────────────────────────────

class SettingsTab(QWidget):
    config_changed = Signal(dict)

    def __init__(self, config: dict, parent=None):
        super().__init__(parent)
        self.config = config
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Bin name
        conn_box = QGroupBox("Resolve-Anbindung")
        c_layout = QFormLayout = QHBoxLayout(conn_box)
        c_layout.addWidget(QLabel("Bin-Name:"))
        self.bin_input = QLineEdit(self.config.get("binName", "Pesto Captions"))
        c_layout.addWidget(self.bin_input, 1)
        save_btn = QPushButton("Speichern")
        save_btn.clicked.connect(self._save)
        c_layout.addWidget(save_btn)
        layout.addWidget(conn_box)

        # Presets
        preset_box = QGroupBox("Konfigurationspresets")
        p_layout = QVBoxLayout(preset_box)
        self.preset_list = QListWidget()
        self.preset_list.setFixedHeight(100)
        self._refresh_presets()
        p_layout.addWidget(self.preset_list)

        btn_row = QHBoxLayout()
        self.preset_name = QLineEdit()
        self.preset_name.setPlaceholderText("Preset-Name …")
        btn_row.addWidget(self.preset_name, 1)
        save_preset_btn = QPushButton("Speichern")
        save_preset_btn.clicked.connect(self._save_preset)
        btn_row.addWidget(save_preset_btn)
        del_preset_btn = QPushButton("Löschen")
        del_preset_btn.setObjectName("danger")
        del_preset_btn.clicked.connect(self._delete_preset)
        btn_row.addWidget(del_preset_btn)
        p_layout.addLayout(btn_row)

        export_row = QHBoxLayout()
        exp_btn = QPushButton("📤  Exportieren")
        exp_btn.clicked.connect(self._export_preset)
        import_btn = QPushButton("📂  Importieren")
        import_btn.clicked.connect(self._import_preset)
        export_row.addWidget(exp_btn)
        export_row.addWidget(import_btn)
        export_row.addStretch()
        p_layout.addLayout(export_row)
        layout.addWidget(preset_box)

        # Info
        info_box = QGroupBox("Über Pesto Captions")
        i_layout = QVBoxLayout(info_box)
        i_layout.addWidget(QLabel(
            "Version: 0.1.0 (Phase 1 MVP)\n"
            "Lizenz: AGPL-3.0\n"
            "Keine Paywall · Kein Login · Keine Gerätebindung\n\n"
            "Freie, quelloffene Caption-Integration für DaVinci Resolve Studio."
        ))
        layout.addWidget(info_box)
        layout.addStretch()

    def _save(self):
        self.config["binName"] = self.bin_input.text().strip() or "Pesto Captions"
        save_config(self.config)
        self.config_changed.emit(self.config)

    def _refresh_presets(self):
        self.preset_list.clear()
        for name in self.config.get("presets", {}).keys():
            self.preset_list.addItem(name)

    def _save_preset(self):
        name = self.preset_name.text().strip()
        if not name:
            return
        self.config.setdefault("presets", {})[name] = dict(self.config.get("segmentation", {}))
        save_config(self.config)
        self._refresh_presets()

    def _delete_preset(self):
        item = self.preset_list.currentItem()
        if not item:
            return
        del self.config["presets"][item.text()]
        save_config(self.config)
        self._refresh_presets()

    def _export_preset(self):
        item = self.preset_list.currentItem()
        if not item:
            return
        preset = self.config["presets"].get(item.text())
        if not preset:
            return
        import json as _json
        path, _ = QFileDialog.getSaveFileName(
            self, "Preset exportieren", f"pesto-preset-{item.text()}.json", "JSON (*.json)"
        )
        if path:
            with open(path, "w") as f:
                _json.dump(preset, f, indent=2, ensure_ascii=False)

    def _import_preset(self):
        import json as _json
        path, _ = QFileDialog.getOpenFileName(self, "Preset importieren", "", "JSON (*.json)")
        if not path:
            return
        with open(path) as f:
            preset = _json.load(f)
        name = os.path.basename(path).replace(".json", "").replace("pesto-preset-", "")
        self.config.setdefault("presets", {})[name] = preset
        save_config(self.config)
        self._refresh_presets()


# ─── Main Window ────────────────────────────────────────────────────

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.config = load_config()
        self.cues = []
        self.template = None
        self.is_connected = False

        self.setWindowTitle("🌿 Pesto Captions")
        self.setMinimumSize(860, 620)
        self.resize(960, 680)

        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Connection bar
        self.conn_bar = ConnectionBar()
        self.conn_bar.connected.connect(self._on_connected)
        main_layout.addWidget(self.conn_bar)

        # Tabs
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)

        self.transcribe_tab = TranscriptionTab(self.config)
        self.transcribe_tab.transcription_done.connect(self._on_transcription_done)

        self.style_tab = StyleTab(self.config)

        self.apply_tab = ApplyTab(self.config)

        self.settings_tab = SettingsTab(self.config)
        self.settings_tab.config_changed.connect(self._on_config_changed)

        self.tabs.addTab(self.transcribe_tab, "🎙  Transkription")
        self.tabs.addTab(self.style_tab, "🎨  Stil & Templates")
        self.tabs.addTab(self.apply_tab, "✨  Anwenden")
        self.tabs.addTab(self.settings_tab, "⚙  Einstellungen")

        main_layout.addWidget(self.tabs, 1)

        # Status bar
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Pesto Captions 0.1.0 — AGPL-3.0 — Kein Login, kein Paywall")

        self.setStyleSheet(QSS)

    def _on_connected(self, info: dict):
        self.is_connected = True
        self._update_apply_state()
        self.status_bar.showMessage(
            f"Verbunden mit: {info['projectName']} / {info['timelineName']} @ {info['frameRate']} fps"
        )

    def _on_transcription_done(self, result: dict, cues: list):
        self.cues = cues
        self.template = self.style_tab.get_selected_template()
        self._update_apply_state()
        self.status_bar.showMessage(f"{len(cues)} Cues generiert")

    def _on_seg_changed(self, seg_cfg: dict):
        self.transcribe_tab.resegment(seg_cfg)

    def _on_config_changed(self, config: dict):
        self.config = config

    def _update_apply_state(self):
        self.template = self.style_tab.get_selected_template()
        self.apply_tab.update_state(self.cues, self.template, self.is_connected)


# ─── Entry point ────────────────────────────────────────────────────

def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Pesto Captions")
    app.setOrganizationName("Pesto Captions")
    app.setApplicationVersion("0.1.0")

    # High DPI handled automatically in Qt6

    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
