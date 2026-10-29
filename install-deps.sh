#!/usr/bin/env bash
# Install deps + start the DeepSeek Harness web dev server on port 7090.
# dev:web -> tsx scripts/dev-web.ts --poll  (rebuilds on source edits, no prod build)
export PATH="$HOME/.local/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CI=0
export DSH_PORT=7090
cd /home/mahmoud/deepseek-harness-code || exit 1

echo "[$(date +%T)] node $(node -v) / pnpm $(pnpm -v)"
echo "[$(date +%T)] starting pnpm install"
pnpm install --config.confirmModulesPurge=false 2>&1 | tail -400
echo "[$(date +%T)] install exit=$?"
touch .install-done
