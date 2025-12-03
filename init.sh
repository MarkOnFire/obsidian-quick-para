#!/bin/bash
# Initializer Script for Quick PARA
# Ensures dependencies are installed and the bundle is built.

set -e

cd "$(dirname "$0")"

echo "🔧 Bootstrapping Quick PARA..."

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found in PATH."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
else
  echo "✅ Dependencies already installed."
fi

echo "🔨 Building plugin..."
npm run build

if [ -f "main.js" ] && [ -f "manifest.json" ]; then
  echo "✅ Build successful (main.js + manifest.json present)."
  exit 0
else
  echo "❌ Build failed: missing artifacts."
  exit 1
fi
