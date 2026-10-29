#!/usr/bin/env bash
# Load the Vexer firewall ruleset and keep it loaded.
set -u

RULES_FILE="${PF_RULES_FILE:-/etc/vexer/nftables.conf}"
BACKEND="${PF_BACKEND:-nftables}"

load() {
  if [ "$BACKEND" = "pfctl" ]; then
    pfctl -f "$RULES_FILE" 2>/dev/null && pfctl -e
  else
    nft -f "$RULES_FILE"
  fi
}

case "${1:-supervise}" in
  supervise)
    load || echo "pf: initial load failed; retrying" >&2
    while true; do
      sleep 30
      # The ruleset is volatile across a reload; restore it if it went missing.
      if [ "$BACKEND" = "pfctl" ]; then
        pfctl -si 2>/dev/null | grep -q "Status: Enabled" || load
      else
        nft list ruleset >/dev/null 2>&1 || load
      fi
    done
    ;;
  load)
    load
    ;;
  *)
    exec "$@"
    ;;
esac
