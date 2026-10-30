---
kind: upgrade-guide
description: "The dsh-base profile no longer mounts VEXER extension plugins, so profiles that used them must declare them directly."
---
# VEXER extensions move out of dsh-base

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-base` no longer includes VEXER identity, learning, threat intelligence, memory, infrastructure, firewall, or credit plugins. Its shared core, web access, and MCP resources remain. Profiles that relied on those extension rows no longer load them automatically; profiles that did not use them need no change.

## Migration

1. Retrieve the required plugin rows and settings from the previous `@deepseek-ai/dsh-base` version. Add only the needed package dependencies to the profile manifest and plugin rows to its `cordis.patch.yml`.
2. Configure and run the matching external services before enabling adapters for Redis, ClickHouse, Kafka, Nutch, Spark, the firewall, or Kill Bill.
3. Run `dsh --profile <name> --dump-config` and confirm each required plugin row appears exactly once.
