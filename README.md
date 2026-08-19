# Pesto Captions

Freie, quelloffene Caption-Integration für DaVinci Resolve Studio.

**AGPL-3.0 · Pesto Production · Witiko Lovis Dietrich 2026**

## Starten

```bash
cd pesto-web && python3 server.py
```

Browser öffnet sich automatisch auf http://localhost:7425

## Features

- Transkription via DaVinci Resolve Scripting API (nativ) oder Whisper
- Styled Captions auf die Timeline anwenden (Fusion Title Templates)
- Template-Galerie (lokaler Bin aus DaVinci Resolve)
- Stil-Verwaltung (speichern, löschen)
- SRT / VTT Import
- 100 % offline — kein Account, kein Server, kein Paywall

## Anforderungen

- macOS oder Windows
- DaVinci Resolve Studio
- Python 3.10+
- `pip install fastapi "uvicorn[standard]" pydantic`

## Lizenz

AGPL-3.0 — niemand darf aus Pesto Captions einen Closed-Source-Dienst bauen.

## Bug & Feature Requests

→ [GitHub Issues](https://github.com/wlovis/pesto-captions/issues/new)
