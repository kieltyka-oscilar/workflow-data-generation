#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────
#  Workflow Data Generator — install & launch
# ─────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Workflow Data Generator — Setup   ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Check for Node.js ──────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found.${NC}"
  echo ""
  echo "  Please install Node.js 18 or later and try again:"
  echo "  → https://nodejs.org/en/download"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
MAJOR=$(echo "$NODE_VER" | cut -d'.' -f1)
if [ "$MAJOR" -lt 18 ]; then
  echo -e "${RED}✗ Node.js $NODE_VER detected — version 18+ is required.${NC}"
  echo "  → https://nodejs.org/en/download"
  exit 1
fi

echo -e "${GREEN}✓ Node.js $NODE_VER${NC}"

# ── 2. Resolve script location ─────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"

if [ ! -d "$APP_DIR" ]; then
  echo -e "${RED}✗ Cannot find the app/ directory at: $APP_DIR${NC}"
  exit 1
fi

# ── 3. Install dependencies ────────────────────
echo ""
echo "  Installing dependencies..."
cd "$APP_DIR"
npm install --prefer-offline --loglevel=error

echo -e "${GREEN}✓ Dependencies installed${NC}"

# ── 4. Launch dev server ───────────────────────
echo ""
echo -e "  ${CYAN}Starting app — it will open automatically in your browser.${NC}"
echo "  Press Ctrl+C to stop."
echo ""

npm run dev -- --open
