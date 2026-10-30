---
kind: upgrade-guide
description: "dsh-base 不再挂载 VEXER 扩展插件；依赖这些插件的 profile 必须自行声明。"
---
# VEXER 扩展移出 dsh-base

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-base` 不再包含 VEXER 身份、学习、威胁情报、记忆、基础设施、防火墙或额度插件。共享核心、Web 访问和 MCP 资源保持不变。依赖这些扩展行的 profile 不再自动加载它们；未使用这些功能的 profile 无需调整。

## 迁移

1. 从之前版本的 `@deepseek-ai/dsh-base` 取回所需插件行及其设置。只将需要的包依赖添加到 profile 清单，并将插件行添加到其 `cordis.patch.yml`。
2. 启用 Redis、ClickHouse、Kafka、Nutch、Spark、防火墙或 Kill Bill 适配器前，先配置并运行对应的外部服务。
3. 运行 `dsh --profile <name> --dump-config`，确认每个所需插件行只出现一次。
