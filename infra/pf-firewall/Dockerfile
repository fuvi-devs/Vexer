# syntax=docker/dockerfile:1
# Vexer Agent firewall manager.
#
# Privileged at run time: the manager writes kernel rules through nft (Linux)
# or pfctl (BSD/macOS). The image ships both client paths plus a supervisor
# that keeps the ruleset loaded.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl nftables iproute2 procps tini \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/vexer-pf
RUN chmod +x /usr/local/bin/vexer-pf

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/vexer-pf"]
