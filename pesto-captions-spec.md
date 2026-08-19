# Pesto Captions — Anforderungskatalog & Backend-Architektur

**Caption-Integration für DaVinci Resolve Studio — ohne Paywall, ohne Konto.**

---

## 1. Produktvision

Pesto Captions generiert automatisch gestylte, animierbare Untertitel direkt in DaVinci-Resolve-Projekten — vom Rohschnitt bis zur fertigen Caption-Spur, lokal, offline-fähig und ohne Lizenzserver.

**Leitsätze für jede Entscheidung im Projekt:**

1. **Bedienerfreundlichkeit.**
2. **zeitersparnis**die verwenduig des tgools muss eine deutliche zeitersparnis gegenüber der davinci internen funktion bieten.
3. **Keine Kontopflicht, keine Gerätebindung.** Keine `machine-id`-Prüfung, kein Aktivierungsserver.
4. **Transparent & erweiterbar.** Templates sind ganz normale DaVinci-Projektinhalte (Fusion-Titles, Text plus erlemente), gebaut mit Resolves eigenen Werkzeugen — jede Person kann eigene bauen, ohne eine zusätzliche App oder ein Fremdformat zu lernen.
5. **Datenschutz per Default.** Audio/Video verlässt das Gerät nie, sofern die Person nicht explizit einen Cloud-Modus aktiviert.
6. **Copyleft schützt das Projekt vor sich selbst.** Lizenz ist AGPL-3.0 — niemand darf aus Pesto Captions einen Closed-Source-Dienst mit neuer Paywall bauen (siehe 9).

---

## 2. Zielgruppe & Nutzungskontext

- Video-Editor:innen, die mit **DaVinci Resolve Studio** arbeiten — Social-Media-Creator, Podcaster, Dokumentarfilm-Cutter:innen, Agenturen. Studio ist die primäre Zielumgebung, weil sowohl PowerBins (projektübergreifende Template-Bibliothek) als auch die native Transkriptionsfunktion dort zuverlässig verfügbar sind.
- Läuft als externe, **selbst kostenlose** Desktop-App neben Resolve — "Studio" bezieht sich hier auf die Resolve-Lizenz der Nutzerin, nicht auf ein Bezahlmodell von Pesto Captions selbst.
- Zielplattformen: macOS (Intel + Apple Silicon) und Windows. Linux ist mittelfristig denkbar, da Resolve dort ebenfalls existiert.

---

## 3. Funktionale Anforderungen

### 3.1 Verbindung zu Resolve
- FR-1: App erkennt eine laufende Resolve-Instanz und das aktuell geöffnete Projekt automatisch.
- FR-2: App liest die aktive Timeline (Name, Framerate, Start-Timecode, vorhandene Video-/Audiospuren).
- FR-3: App ist primär für **Resolve Studio** ausgelegt und nutzt Studio-exklusive APIs (PowerBins, native Transkription) als Grundlage. Läuft die App unter Resolve Free, fällt sie sauber auf die nächstbeste Alternative zurück (lokaler Bin statt PowerBin; Whisper statt nativer Transkription) — ein vollständig gleichwertiges Free-Erlebnis ist kein Projektziel.
- FR-4: Klare Fehlermeldung mit Lösungsvorschlag, wenn Resolve nicht läuft, kein Projekt offen ist oder die Scripting-API deaktiviert ist (inkl. Anleitung, wie man sie in den Resolve-Preferences aktiviert).

### 3.2 Untertitel-Generierung
- FR-5: **Primäre Transkriptions-Engine ist Resolves eigene "Create Subtitles from Audio"-Funktion**, angesteuert über die Scripting API — kein Modell-Download, keine externe Abhängigkeit, läuft komplett innerhalb von Resolve.
- FR-6: **Whisper (lokal, via whisper.cpp) steht als Alternativ-Engine zur Wahl**, wählbar in den Settings, mit genau zwei Modellgrößen: `small` (Default der Alternative, schneller) und `medium` (genauer, langsamer). Kein `base`-Modell, um die Auswahl bewusst klein zu halten.
- FR-7: Beim Start eines Transkriptionslaufs zeigt die App an, welche Engine aktiv ist, und macht den Unterschied konkret sichtbar: *"Native Transkription: schnell, kein Download — Wort-genaue Hervorhebung evtl. eingeschränkt. Whisper: benötigt Modell-Download, liefert garantiert Wort-für-Wort-Timing."*
- FR-8: **Fähigkeits-Erkennung statt Rätselei:** Nach jedem Transkriptionslauf prüft die App, ob Wort-genaue Zeitstempel vorliegen (bei Whisper immer der Fall; bei nativer Transkription abhängig von der Resolve-Version/-API). Liegen keine Wort-Zeitstempel vor, deaktiviert die App automatisch alle wortbasierten Funktionen für diesen Transkript-Lauf (Emphasis-Markup, wortweise Timing-Korrektur) und zeigt einen Hinweis mit Vorschlag, für diese Funktionen auf Whisper zu wechseln. Das ist ein definiertes Verhalten, keine offene Frage — die App muss nie raten, sie fragt die Fähigkeit aktiv ab.
- FR-9: Unterstützung für mehrere Sprachen inkl. automatischer Spracherkennung (native Engine: eingebaut; Whisper: eingebaut).
- FR-10: Import bestehender `.srt`/`.vtt`-Dateien als weitere Alternative zu beiden Transkriptions-Engines.
- FR-11: Konfigurierbare Phrasenbildung: max. Zeichen pro Caption, max. Wörter pro Caption, minimale/maximale Anzeigedauer, Lückenfüllung zwischen Cues.
- FR-12: Interpunktions-Normalisierung, granular abschaltbar pro Zeichentyp (Komma, Punkt, Frage-/Ausrufezeichen, Anführungszeichen, Gedankenstrich, Semikolon, Doppelpunkt).
- FR-13: Groß-/Kleinschreibung erzwingbar (UPPERCASE / lowercase / Sentence case / unverändert).
- FR-14: Manuelle Nachbearbeitung jedes Worts/jeder Phrase in der App vor dem Export (Text, Timing-Grenzen, sofern Wort-Timing vorliegt).

### 3.3 Styling & Templates — Bin-basiert, direkt aus DaVinci
Templates werden **nicht** in der App selbst gebaut, sondern ganz normal in DaVinci Resolve als Fusion-Title-Clip gestaltet (Text+, Animation, Farbe, Position — mit allen Bordmitteln, die Resolve ohnehin mitbringt) und in einem dafür vorgesehenen Bin abgelegt. Pesto Captions erkennt diesen Bin automatisch und nutzt seinen Inhalt als Template-Bibliothek.

- FR-15: App erkennt automatisch einen Bin mit reserviertem Namen (Default: `Pesto Captions`) im Media Pool des aktuell geöffneten Projekts.
- FR-16: **Primärer Weg ist ein PowerBin** mit diesem Namen (projekt-/datenbankübergreifend verfügbar, Templates müssen nicht pro Projekt neu importiert werden) — voll unterstützter Weg für Studio-Nutzer:innen. Existiert kein PowerBin, fällt die App auf einen normalen, projektlokalen Bin zurück; dieser Fallback wird unterstützt, aber nicht mit gleicher Priorität gepflegt wie der PowerBin-Weg.
- FR-17: Jeder Clip in diesem Bin, der ein Fusion-Title/Text+-Element enthält, wird von der App als eigenständiges Template gelistet (Name = Clip-Name, Thumbnail aus Resolves eigenem Vorschaubild).
- FR-18: **Text-getriebene Anwendung**: Die App dupliziert den gewählten Template-Clip pro Caption-Cue auf die Ziel-Timeline und schreibt den transkribierten Text direkt in dessen Text+-Feld — alle im Template hinterlegten Eigenschaften (Position, Schrift, Farbe, Animation, Keyframes) bleiben dabei unverändert erhalten, weil nur der Textinhalt ersetzt wird, nicht der Clip selbst.
- FR-19: Wortweise Hervorhebung funktioniert über eine einfache Textmarkierung beim Editieren des Transkripts in der App (`**Wort**` für Emphasis), die beim Einsetzen in Resolve als separater Styled-Text-Run übertragen wird — verfügbar nur bei vorliegendem Wort-Timing (siehe FR-8). Die konkrete Emphasis-Optik bestimmt die Template-Autorin direkt im Template in Resolve, nicht die App.
- FR-20: Live-Vorschau in der App zeigt das gewählte Template mit Beispieltext, bevor es auf die ganze Timeline angewendet wird (Thumbnail/Standbild aus Resolve, kein eigener Renderer nötig).
- FR-21: Ein Refresh-Button aktualisiert die Template-Liste, wenn im Bin neue Templates ergänzt oder umbenannt wurden, ohne die App neu starten zu müssen.
- FR-22: Der Text+-Node, in den die App den Caption-Text schreibt, muss nach Konvention `PestoText` heißen. Fehlt ein so benannter Node, sucht die App ersatzweise den ersten Text+-Node im Clip und weist in der UI konkret darauf hin, dass die Zuordnung auf Verdacht erfolgt ist (Name des Clips + Node).
- FR-23: Community-Template-Sharing ist rein dateibasiert: ein Template ist ein exportierter Resolve-Clip (`.drt`/`.drb`), der sich wie jede andere Resolve-Vorlage per Datei, Link oder Repo teilen und in den eigenen Pesto-Captions-Bin importieren lässt. Es gibt bewusst **kein** zentral von Pesto Captions betriebenes Template-Verzeichnis — keine Plattform, die gepflegt, moderiert oder finanziert werden müsste.

### 3.4 Anwenden auf die Timeline
- FR-24: Erzeugt pro Caption-Cue eine Kopie des gewählten Bin-Templates auf einer neuen Video-Spur, korrekt positioniert nach Timecode/Dauer aus der Transkription.
- FR-25: Bestehende, bereits platzierte Captions lassen sich nachträglich mit einem anderen Bin-Template neu stylen, ohne das Timing zu verlieren (Text + Timing bleiben, nur der Template-Clip wird getauscht).
- FR-26: Rendering-Fortschritt sichtbar (Anzahl verarbeiteter Cues), abbrechbar.

### 3.5 Delivery-Integration
- FR-27: Liest vorhandene Render-/Deliver-Presets aus dem aktuellen Projekt und zeigt sie zur Auswahl an, statt eigene Export-Logik zu bauen.
- FR-28: Eigene Deliver-Presets (z. B. "9:16 mit Captions") lassen sich als Datei exportieren/importieren und zwischen Projekten/Rechnern teilen.
- FR-29: Optionaler Direktstart der Resolve-Render-Queue mit dem gewählten Preset nach dem Anwenden der Captions.

### 3.6 Schrift-Handling
- FR-30: App scannt die im gewählten Bin-Template referenzierten Schriftarten und prüft, ob sie auf dem System installiert sind.
- FR-31: Klare, konkrete Warnung bei fehlender Schriftart (welche Schrift, welches Template betroffen) statt eines generischen Fehlers — inkl. Hinweis, wo die Schrift nachinstalliert werden kann.
- FR-32: Eigener Ordner für zusätzliche/mitgebrachte Schriftarten, die nicht systemweit installiert werden sollen (macOS und Windows getrennt behandelt, da unterschiedliche Font-Registrierung).

### 3.7 Einstellungen & Persistenz
- FR-33: Alle Default-Werte (Bin-Name, Transkriptions-Engine, Zeichenlimits, Interpunktionsregeln, Standard-Template) sind lokal konfigurierbar und persistieren pro Gerät, nicht pro Account.
- FR-34: Presets für ganze Konfigurationssets speicher-/ladbar, exportierbar als Datei zum Teilen zwischen Rechnern.

### 3.8 Explizit NICHT Teil der App
- Keine Lizenzschlüssel-Eingabe, kein Login, kein "Upgrade"-Dialog.
- Keine verpflichtende Cloud-Verarbeitung.
- Keine Geräte-Bindung / Aktivierungs-Zähler.
- Kein von Pesto Captions betriebenes zentrales Template-Verzeichnis.

---

## 4. Nicht-funktionale Anforderungen

| Kategorie | Anforderung |
|---|---|
| Performance | Native Transkription: abhängig von Resolves eigener Engine. Whisper `small`: 10-Minuten-Clip < 2 Minuten auf gängiger Consumer-Hardware (CPU-only); `medium` darf spürbar langsamer sein, dafür genauer. |
| Offline-Fähigkeit | Kernworkflow (Transkribieren → Stylen → Anwenden) funktioniert ohne Internetverbindung, mit beiden Transkriptions-Engines. |
| Datenschutz | Keine Audio-/Videodaten verlassen das Gerät im Default-Modus; keine Telemetrie ohne Opt-in. |
| Barrierefreiheit | Tastaturbedienbar, ausreichender Farbkontrast, Screenreader-Labels auf allen Controls. |
| Lizenz | **AGPL-3.0**, projektweit fixiert (siehe 9). |
| Plattform | macOS (arm64 + x64), Windows (x64); primär **Resolve Studio**, Free läuft mit reduziertem Funktionsumfang mit (lokaler Bin statt PowerBin, Whisper statt nativer Transkription). |
| Nachhaltigkeit des Projekts | Kein laufender Server nötig → keine Betriebskosten, die einen künftigen Paywall-Druck erzeugen. |

---

## 5. Tech-Stack

| Ebene | Wahl | Begründung |
|---|---|---|
| Shell | Electron (Node.js + Chromium) | Etablierter Weg für Cross-Platform-Desktop-UI mit Zugriff auf lokales Dateisystem/Prozesse |
| UI | React oder plain Web Components + Vite | Schnelle Entwicklung, kein Lock-in |
| Resolve-Anbindung | **Offizielle DaVinci Resolve Scripting API** (Python- oder Lua-Modul, das mit jeder Resolve-Installation mitgeliefert wird) | Öffentlich dokumentiert, erfordert keine Blackmagic-Partnerschaft, keine proprietären `.node`-Binaries nötig → jede Entwicklerin kann das nachbauen |
| Speech-to-Text (primär) | **Resolves native "Create Subtitles from Audio"**, über Scripting API angesteuert | Kein Download, kein zusätzlicher Prozess, nutzt vorhandene Studio-Funktion |
| Speech-to-Text (Alternative) | **whisper.cpp**, Modelle `small`/`medium` | Garantiert Wort-Zeitstempel, unabhängig von Resolve-Version, für alle wortbasierten Features nötig |
| Style-Engine | Kein eigenes Format — Templates sind native Resolve-Fusion-Titles in einem (Power-)Bin (siehe 6.4) | Styling bleibt in Resolves eigenem, vertrautem Werkzeug; kein Parallel-Format zu pflegen |
| Persistenz | Lokale JSON-Dateien im User-Datenverzeichnis | Kein Server, keine Kontobindung |
| Prozess-Trennung | Electron Main + Renderer + optionaler Worker-Prozess (nur aktiv, wenn Whisper gewählt ist) | UI bleibt responsiv während CPU-intensiver Arbeit, ohne bei nativer Transkription unnötig einen Zusatzprozess zu starten |

---

## 6. Backend-Logik im Detail

### 6.1 Architektur-Übersicht

```
┌─────────────────────────┐        Scripting API (Python/Lua, offiziell dokumentiert)
│   DaVinci Resolve Studio  │◄───────────────────────────────────────────────┐
│   (läuft unabhängig,      │                                                 │
│   inkl. nativer STT)      │                                                 │
└─────────────────────────┘                                                 │
                                                                              │
┌─────────────────────────────────────────────────────────────────────┐    │
│  Pesto Captions (Electron App, eigener Prozess)                     │    │
│                                                                        │    │
│  ┌───────────────┐   IPC   ┌────────────────────┐   spawn   ┌──────┐│    │
│  │  Renderer (UI) │◄───────►│  Main Process        │◄────────►│Resolve││───┘
│  │  React/HTML    │         │  - Orchestrierung    │  bridge   │Bridge-│
│  │                │         │  - Engine-Auswahl    │  script   │Skript │
│  │                │         │  - Dateisystem       │           │(Py/Lua)│
│  │                │         │  - Konfiguration      │           └──────┘
│  └───────────────┘         └─────────┬────────────┘
│                                        │ spawn / worker_threads (nur bei Whisper-Wahl)
│                              ┌─────────▼────────────┐
│                              │  Transcription Worker  │
│                              │  (optional)             │
│                              │  - whisper.cpp binding  │
│                              │  - Phrasen-Segmentierung│
│                              │  - Interpunktionsregeln │
│                              └─────────────────────────┘
└─────────────────────────────────────────────────────────────────────┘
```

**Getroffene Architekturentscheidung:** Pesto Captions läuft als **eigenständiges Fenster neben Resolve**, nicht als eingebettetes Docked-Panel. Das kostet etwas UI-Komfort, gewinnt aber Unabhängigkeit von Blackmagics undokumentierter Workflow-Integration-SDK-Ausgabe (die eine kommerzielle Vereinbarung mit Blackmagic voraussetzt) — Voraussetzung dafür, dass das Projekt wirklich von jedem nachgebaut/geforkt werden kann.

### 6.2 Datenfluss: Von Audio zu gestylten Captions

1. **Engine-Wahl**
   Main Process liest die konfigurierte Default-Engine (FR-5/FR-6). Bei nativer Transkription entfällt Schritt 2 (Audio-Extraktion) größtenteils, da Resolve intern auf die bereits vorhandene Audiospur zugreift; bei Whisper wird das Audiosegment vom Bridge-Skript zunächst als temporäre WAV-Datei (16 kHz mono) exportiert.

2. **Transkription — nativer Pfad**
   Bridge-Skript ruft Resolves eingebaute Transkriptionsfunktion über die Scripting API auf der aktiven Timeline auf. Ergebnis wird ausgelesen und auf Wort-Zeitstempel geprüft (FR-8). Liegen nur Phrasen-Cues vor, markiert die App den Transkript-Lauf entsprechend als "phrasenbasiert" für die nachfolgenden Schritte.

3. **Transkription — Whisper-Pfad**
   Main Process delegiert an den Transcription Worker (separater Prozess, damit ein Absturz/Hang die UI nicht blockiert). Worker ruft `whisper.cpp` (Modell `small` oder `medium`) mit `--word-timestamps` auf und erhält garantiert Wort-Zeitstempel:
   ```json
   [
     { "word": "Hallo", "start": 0.00, "end": 0.32, "confidence": 0.97 },
     { "word": "Welt",  "start": 0.34, "end": 0.71, "confidence": 0.95 }
   ]
   ```

4. **Phrasen-Segmentierung**
   Reine Funktion (leicht testbar, keine Seiteneffekte): nimmt Wort- oder Phrasenliste + Konfiguration (`maxChars`, `maxWords`, `minDuration`, `fillGapsFrames`) und gruppiert zu Caption-Cues. Wendet danach die Interpunktions-/Casing-Regeln je Cue an. Bei phrasenbasierten nativen Transkripten ohne Wort-Timing wird nur auf Phrasengrenzen segmentiert, nicht auf Wortebene neu gruppiert.

5. **Template-Erkennung**
   Bridge-Skript sucht beim Start (und auf Refresh) im Media Pool nach einem Bin namens `Pesto Captions` — zuerst unter den PowerBins (projektübergreifend), dann als Fallback im projektlokalen Bin-Baum. Jeder darin gefundene Clip mit Fusion-Title/Text+-Inhalt wird als Template an die UI gemeldet (Name, Thumbnail).

6. **Styling-Zuordnung**
   Nutzer:in wählt eines der erkannten Bin-Templates; die App merkt sich pro Cue nur noch den finalen Text (inkl. `**Emphasis**`-Markierung, sofern Wort-Timing vorliegt), Timing und das gewählte Template — die eigentliche Optik lebt im Template-Clip in Resolve, nicht in der App.

7. **Export-Datenpaket**
   Statt Styling-Metadaten versteckt in eine SRT-Datei einzuschmuggeln (fragiler Hack, schwer zu debuggen), erzeugt Pesto Captions eine schlanke Cue-Liste als Übergabe an das Bridge-Skript:
   ```json
   {
     "templateClipName": "Kinetic Pop",
     "wordTimingAvailable": true,
     "cues": [
       {
         "cueIndex": 1,
         "startFrame": 480,
         "endFrame": 512,
         "runs": [
           { "text": "Hallo ", "emphasis": false },
           { "text": "Welt", "emphasis": true }
         ]
       }
     ]
   }
   ```
   Zusätzlich wird parallel eine reguläre `captions.srt` geschrieben (reiner Text + Timing, ohne Emphasis-Markup) — nützlich als eigenständiger Export z. B. für YouTube, unabhängig vom Resolve-Workflow.

8. **Anwenden in Resolve**
   Bridge-Skript liest die Cue-Liste und geht sie sequenziell durch:
   - dupliziert den gewählten Template-Clip aus dem Bin auf die Ziel-Video-Spur, platziert an `startFrame`/`endFrame`.
   - öffnet die Fusion-Komposition des neuen Clips, findet den `PestoText`-Node (Fallback: erster Text+-Node, siehe FR-22) und setzt dessen `StyledText`-Eingang anhand der `runs`-Liste — jeder Run mit `emphasis: true` wird als separater Styled-Text-Run markiert, damit die im Template hinterlegte Emphasis-Formatierung greift. Bei `wordTimingAvailable: false` enthält jede Cue nur einen einzigen Run ohne Emphasis-Option.
   - lässt alle anderen Eigenschaften des Templates (Position, Grund-Animation, Keyframes) unverändert.

   *Hinweis:* Der genaue Mechanismus, wie Resolves Fusion-Scripting-API Styled-Text-Runs pro Wort setzt, ist gegen die zum Implementierungszeitpunkt aktuelle Scripting-API-Dokumentation zu verifizieren — das Prinzip (Text ersetzen, Emphasis als zweiter vordefinierter Style im selben Node) ist der stabile Teil des Designs, die konkrete API-Methode kann sich zwischen Resolve-Versionen unterscheiden.

9. **Fortschritt & Fehler**
   Bridge-Skript meldet pro verarbeiteter Cue über stdout/IPC-Kanal zurück an den Main Process, der die UI aktualisiert; Fehler (z. B. Timeline zu kurz, Spur fehlt) werden mit konkretem Fix-Hinweis an die UI durchgereicht statt generischer Fehlercodes.

### 6.3 Prozess- & IPC-Verträge

| Kanal | Richtung | Payload | Zweck |
|---|---|---|---|
| `resolve:connect` | Renderer → Main | — | Prüft aktive Resolve-Instanz, liefert Timeline-Metadaten |
| `transcribe:start` | Renderer → Main → Worker/Bridge | `{ engine: "native"\|"whisper", modelSize?: "small"\|"medium", language }` | Startet Transkription mit gewählter Engine |
| `transcribe:progress` | Worker/Bridge → Main → Renderer | `{ percent, currentSegment }` | Fortschrittsanzeige |
| `transcribe:done` | Worker/Bridge → Main → Renderer | `{ wordTimingAvailable: boolean, segments: Word[]\|Phrase[] }` | Rohtranskript für Segmentierung in der UI, inkl. Fähigkeits-Flag |
| `captions:apply` | Renderer → Main → Bridge-Skript | `{ cueListPath, templateClipName, trackTarget }` | Wendet Captions auf Timeline an |
| `captions:apply:progress` | Bridge-Skript → Main → Renderer | `{ cueIndex, total }` | Fortschritt beim Einfügen |
| `templates:scan` | Renderer → Main → Bridge-Skript | `{ binName }` | Sucht Bin/PowerBin und listet gefundene Template-Clips |
| `templates:scan:result` | Bridge-Skript → Main → Renderer | `Template[]` (`{ clipName, thumbnail, sourceBinType: "power"\|"local" }`) | Befüllt die Template-Auswahl in der UI |
| `deliver:presets:list` | Renderer → Main → Bridge-Skript | — | Liest vorhandene Render-Presets aus dem Projekt |
| `deliver:render:start` | Renderer → Main → Bridge-Skript | `{ presetName }` | Startet Render-Queue mit gewähltem Preset |
| `config:get` / `config:set` | Renderer ↔ Main | Config-Objekt | Liest/schreibt lokale Einstellungen |

### 6.4 Template-Erkennung & Text-Injection

**Bin-Erkennung (Bridge-Skript, bei jedem `templates:scan`):**

1. PowerBins abfragen und nach exaktem Namen `Pesto Captions` (konfigurierbar) suchen.
2. Kein Treffer → projektlokalen Media-Pool-Baum rekursiv nach demselben Namen durchsuchen.
3. Kein Treffer in beiden Fällen → UI zeigt "Kein Template-Bin gefunden" mit Anleitung, wie man einen PowerBin mit diesem Namen anlegt, statt eines generischen Fehlers.
4. Gefundener Bin → alle enthaltenen Clips filtern auf solche mit Fusion-Title/Text+-Inhalt; pro Clip Name + Thumbnail an die UI melden.

**Konvention für Template-Autor:innen** (dokumentiert als kurzes "Template bauen"-Guide in der App, kein Fließtext-Handbuch nötig):

- Der Text+-Node, in den die App den Caption-Text schreibt, sollte `PestoText` heißen. Fehlt dieser Name, greift automatisch der Fallback aus FR-22 (erster gefundener Text+-Node) mit UI-Warnung.
- Emphasis-Optik (für `**Wort**`-Markierungen) wird als zweiter, bereits im Node vordefinierter Text-Style hinterlegt — die Autorin bestimmt selbst, wie Hervorhebung in diesem Template aussieht (andere Farbe, Größe, ggf. eigene Keyframes).
- Alles andere im Clip (Position, Grundanimation, Shading, Dauer-Loop) bleibt vollständig in Resolves eigenen Werkzeugen gestaltbar — die App fasst nichts davon an außer dem Textinhalt.

Ein Template ist damit ein ganz normaler, exportierbarer Resolve-Clip — teilbar wie jede andere Titel-Vorlage, ohne App-eigenes Dateiformat.

### 6.5 Lizenz-/Zugänglichkeits-Logik (bewusstes Nicht-Bauen)

Anstelle eines Lizenzmoduls: eine Config-Konstante `FEATURE_GATES = {}` (leer, dokumentiert als "bleibt leer"). Damit ist im Code selbst sichtbar dokumentiert, dass Gating architektonisch nicht vorgesehen ist — jede zukünftige Contributor:in sieht sofort, dass ein PR mit Lizenzprüfung gegen die Projektprinzipien verstößt (und, dank AGPL-3.0, auch gegen die Lizenz eines etwaigen Closed-Source-Forks).

### 6.6 Logging & Diagnose

Lokales, rotierendes Log (täglich rotierend, 7 Tage Aufbewahrung) — aber **ohne** stille Übertragung an einen Server. Ein "Diagnosebericht exportieren"-Button erzeugt eine Zip-Datei, die die Person selbst z. B. an ein GitHub-Issue anhängen kann. Explizite Zustimmung vor jeder Datenübertragung nach außen.

---

## 7. Getroffene Grundsatzentscheidungen

| Entscheidung | Ergebnis | Begründung |
|---|---|---|
| Projektlizenz | **AGPL-3.0** | Verhindert Closed-Source-Forks (auch als gehosteter Dienst), die wieder eine Paywall einführen |
| Transkriptions-Engine (Default) | **Resolve native "Create Subtitles from Audio"** | Kein Download, kein Zusatzprozess, nutzt vorhandene Studio-Funktion |
| Transkriptions-Engine (Alternative) | **Whisper**, Modelle `small` + `medium` (kein `base`) | Garantiert Wort-Zeitstempel für alle wortbasierten Features, unabhängig von Resolve-Version |
| Fenstermodus | **Eigenständiges Fenster**, kein Docked-Panel | Keine Blackmagic-SDK-Freigabe nötig → frei nachbaubar |
| Template-Sharing | **Rein dezentral**, kein zentrales Verzeichnis von Pesto Captions | Kein Pflege-/Moderationsaufwand, keine kontrollierende Plattform |
| Node-Namenskonvention | `PestoText` als Konvention, automatischer Fallback auf ersten Text+-Node bei Abweichung | Robust gegen Umbenennung, ohne Templates unbrauchbar zu machen |
| Ziel-Resolve-Edition | **Studio primär**, Free unterstützt mit reduziertem Funktionsumfang | PowerBins und native Transkription sind Studio-exklusiv |

---

## 8. Vorgeschlagener MVP-Scope (Phase 1)

- Verbindung zu Resolve + Timeline-Metadaten lesen
- Transkription primär über native Resolve-Funktion; Whisper (`small`/`medium`) als wählbare Alternative
- Fähigkeits-Erkennung für Wort-Timing (FR-8) inkl. UI-Hinweis, wann wortbasierte Features verfügbar sind
- Phrasen-Segmentierung mit den wichtigsten Reglern (Zeichenlimit, Wortlimit, Interpunktion, Casing)
- Bin-/PowerBin-Erkennung + Anwenden von **1–2 selbst gebauten Templates** (reiner Textaustausch, noch ohne Emphasis-Runs) — der kreative Template-Teil liegt bewusst bei dir, die App muss zum Start nur zuverlässig erkennen und einsetzen können
- Anwenden auf Timeline + einfache Nachbearbeitung
- Lokale Presets speichern/laden

**Phase 2:** Wortweise Emphasis-Runs (`**Wort**`-Markup → Styled-Text-Run) für Whisper-Transkripte, mehr Templates in der Bibliothek, Custom-Font-Check/-Warnung.
**Phase 3:** Deliver-/Render-Preset-Integration, Community-Template-Sharing (Datei-/Repo-basiert), mehr Sprachen.
