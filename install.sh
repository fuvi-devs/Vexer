#!/usr/bin/env bash
# Vexer Agent — one-command install.
#
#   curl -sSL https://vexer.ai/install.sh | bash
#
# Brings up the whole stack: the agent, its hot memory (Redis), its cold
# memory (ClickHouse), the event bus (Kafka), the crawler (Nutch), the
# processing cluster (Spark), and the firewall manager.
set -eu

INSTALL_DIR="${VEXER_INSTALL_DIR:-$HOME/vexer-agent}"
COMPOSE_FILE="${VEXER_COMPOSE_FILE:-docker-compose.yml}"

log() { printf '\033[1;31m[vexer]\033[0m %s\n' "$*"; }
step() { printf '\033[1;33m[vexer]\033[0m %s\n' "$*"; }

command -v docker >/dev/null 2>&1 || { log "docker is required but not installed"; exit 1; }
docker compose version >/dev/null 2>&1 || { log "docker compose v2 is required"; exit 1; }
docker info >/dev/null 2>&1 || { log "the docker daemon is not reachable — start it (sudo systemctl start docker) and retry"; exit 1; }

step "installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ -f "$COMPOSE_FILE" ]; then
  step "using the compose file already in $INSTALL_DIR"
else
  step "downloading the stack definition"
  curl -fsSL "https://vexer.ai/${COMPOSE_FILE}" -o "$COMPOSE_FILE"
fi

if [ ! -f .env ]; then
  step "generating .env"
  cat > .env <<'ENV'
VEXER_PORT=7090
CLICKHOUSE_DB=vexer_memory
CLICKHOUSE_USER=vexer
CLICKHOUSE_PASSWORD=vexer
ENV
fi

step "building the agent image (this takes a while the first time)"
docker compose build

step "starting the stack"
docker compose up -d

step "waiting for the agent to come up"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${VEXER_PORT:-7090}/" >/dev/null 2>&1; then
    log "Vexer Agent is up on http://127.0.0.1:${VEXER_PORT:-7090}"
    step "the sign-in link is printed by the agent: docker compose logs vexer-agent | grep 'dsh web:'"
    exit 0
  fi
  sleep 3
done

log "the agent did not answer in time — check: docker compose logs vexer-agent"
exit 1
