#!/usr/bin/env bash
# Run the Vexer Agent web dev server on port 7090 with live rebuild.
#
# dev:web -> tsx scripts/dev-web.ts --poll
#   1. runs `pnpm run build:artifacts` once
#   2. watches client packages and rebuilds bundles on every source edit
#   3. serves `dsh web` from source on :7090
set -u
export PATH="$HOME/.local/tools/node24/bin:$HOME/.local/bin:$PATH"
export CI=0
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
unset NODE_OPTIONS
cd "$(dirname "$0")" || exit 1
exec pnpm run dev:web -- --port 7090 --no-open --poll
