#!/usr/bin/env bash
# Vexer Agent container entrypoint.
#
# `vexer-entrypoint start`   — serve the agent (production)
# `vexer-entrypoint dev`     — serve with live rebuild (development)
# `vexer-entrypoint <cmd>`   — run an arbitrary command
set -u

export CI=1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NODE_ENV="${NODE_ENV:-production}"
export PATH="/opt/vexer/node_modules/.bin:${PATH}"
unset NODE_OPTIONS

cd /opt/vexer || exit 1

VEXER_PORT="${VEXER_PORT:-7090}"
export VEXER_PORT

# First-boot: the data volume must be writable by the runtime user.
mkdir -p /data 2>/dev/null || true

case "${1:-start}" in
  start)
    exec pnpm run start:web -- --port "$VEXER_PORT" --no-open
    ;;
  dev)
    exec pnpm run dev:web -- --port "$VEXER_PORT" --no-open --poll
    ;;
  *)
    exec "$@"
    ;;
esac
