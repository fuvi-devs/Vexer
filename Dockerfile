# syntax=docker/dockerfile:1
#
# Vexer Agent — production image.
#
# Stage 1 (builder) installs every workspace dependency and produces the
# build artifacts. Stage 2 (runtime) keeps only what the agent needs to serve:
# the built packages, the production dependency tree, and the Node runtime.
#
# Node 24 is required: the agent's source launcher uses Node's TypeScript
# type stripping, which the distribution Node build does not provide.

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Corepack gives the pinned pnpm the lockfile asks for.
RUN corepack enable

# Dependency layer: copied before the source so a source-only change does not
# invalidate the (slow) install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/memory/memory-core/package.json          packages/memory/memory-core/
COPY packages/memory/memory-redis/package.json         packages/memory/memory-redis/
COPY packages/memory/memory-clickhouse/package.json    packages/memory/memory-clickhouse/
COPY packages/memory/memory-tools/package.json         packages/memory/memory-tools/
COPY packages/learning/learning-core/package.json      packages/learning/learning-core/
COPY packages/learning/learning-tools/package.json     packages/learning/learning-tools/
COPY packages/learning/learning-memory/package.json    packages/learning/learning-memory/
COPY packages/security/threat-intel-core/package.json packages/security/threat-intel-core/
COPY packages/security/threat-intel-tools/package.json packages/security/threat-intel-tools/
COPY packages/security/threat-intel-memory/package.json packages/security/threat-intel-memory/
COPY packages/infra/kafka-core/package.json           packages/infra/kafka-core/
COPY packages/infra/kafka-client/package.json         packages/infra/kafka-client/
COPY packages/infra/nutch-core/package.json           packages/infra/nutch-core/
COPY packages/infra/nutch-client/package.json         packages/infra/nutch-client/
COPY packages/infra/spark-core/package.json           packages/infra/spark-core/
COPY packages/infra/spark-connect/package.json        packages/infra/spark-connect/
COPY packages/infra/pf-firewall/package.json          packages/infra/pf-firewall/
COPY packages/extensions/vexer-identity/package.json   packages/extensions/vexer-identity/
COPY packages/integration/vexer-orchestrator/package.json packages/integration/vexer-orchestrator/
COPY packages/bundle/base/package.json                packages/bundle/base/

RUN --mount=type=cache,target=/pnpm/store,id=pnpm \
    pnpm install --frozen-lockfile --prefer-offline

# Source layer.
COPY . .

# Build every artifact the client and host faces ship.
RUN pnpm run build:artifacts

# Prune to the production dependency tree for the runtime stage.
RUN pnpm prune --prod || true

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    VEXER_PORT=7090

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && useradd --create-home --shell /bin/bash vexer

WORKDIR /opt/vexer

# The built artifacts and the production dependency tree.
COPY --from=builder --chown=vexer:vexer /build/node_modules ./node_modules
COPY --from=builder --chown=vexer:vexer /build/packages ./packages
COPY --from=builder --chown=vexer:vexer /build/apps ./apps
COPY --from=builder --chown=vexer:vexer /build/scripts ./scripts
COPY --from=builder --chown=vexer:vexer /build/vendor ./vendor
COPY --from=builder --chown=vexer:vexer /build/brand ./brand
COPY --from=builder --chown=vexer:vexer /build/package.json ./package.json
COPY --from=builder --chown=vexer:vexer /build/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=vexer:vexer /build/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=vexer:vexer /build/tsconfig*.json ./
COPY docker-entrypoint.sh /usr/local/bin/vexer-entrypoint
RUN chmod +x /usr/local/bin/vexer-entrypoint

# The agent's data (sessions, knowledge, skills) lives on a volume.
RUN mkdir -p /data && chown vexer:vexer /data
VOLUME ["/data"]

USER vexer
EXPOSE 7090

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${VEXER_PORT}/" >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/vexer-entrypoint"]
CMD ["start"]
