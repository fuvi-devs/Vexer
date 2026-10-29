#!/bin/bash
# Vexer Agent - Quick Start Script
# This script runs the Vexer Agent web server

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Vexer Agent - Quick Start                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Install Node.js 24+ from https://nodejs.org"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${RED}Error: Node.js 22+ required (found v${NODE_VERSION})${NC}"
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}pnpm not found. Installing...${NC}"
    npm install -g pnpm
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install
fi

# Check if artifacts are built
if [ ! -d "packages/core/agent/lib" ]; then
    echo -e "${YELLOW}Building artifacts...${NC}"
    export PATH="/home/mahmoud/.local/tools/node24/bin:/home/mahmoud/.local/bin:$PATH"
    pnpm run build:artifacts
fi

# Get port (default 7090)
PORT=${1:-7090}

echo -e "${GREEN}Starting Vexer Agent on port ${PORT}...${NC}"
echo ""

# Run the dev server
export PATH="/home/mahmoud/.local/tools/node24/bin:/home/mahmoud/.local/bin:$PATH"
exec pnpm run dev:web -- --port ${PORT} --no-open --poll
