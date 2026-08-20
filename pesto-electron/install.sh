#!/bin/bash
# Pesto Titles — Install als Resolve Workflow Integration Plugin
# Ausführen mit: bash install.sh

PLUGIN_DIR="$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
PLUGIN_NAME="pesto-titles"
DEST="$PLUGIN_DIR/$PLUGIN_NAME"

echo "🌿 Pesto Titles — Plugin-Installation"
echo "========================================"

# Sicherstellen dass der Zielordner existiert
mkdir -p "$PLUGIN_DIR"

# Altes Plugin entfernen falls vorhanden
if [ -d "$DEST" ]; then
  echo "⚠️  Altes Plugin gefunden, wird ersetzt..."
  rm -rf "$DEST"
fi

# Plugin kopieren (ohne node_modules, die werden neu installiert)
echo "📦 Kopiere Plugin-Dateien..."
mkdir -p "$DEST"
cp manifest.xml "$DEST/"
cp main.js "$DEST/"
cp preload.js "$DEST/"
cp WorkflowIntegration.node "$DEST/"
cp package.json "$DEST/"
cp -r ui "$DEST/"

# npm install im Zielordner
echo "📥 Installiere Node-Abhängigkeiten..."
cd "$DEST"
npm install --omit=dev 2>&1 | tail -3

echo ""
echo "✅ Plugin installiert!"
echo ""
echo "Nächste Schritte:"
echo "  1. DaVinci Resolve Studio öffnen"
echo "  2. Workspace → Workflow Integrations → Pesto Titles"
echo ""
echo "Plugin-Pfad: $DEST"
