# 贡献指南

[English](CONTRIBUTING.md) | 中文

感谢你有意为 VEXER Agent 做贡献。

VEXER Agent 由 **Future Vision** 维护，并在 MIT 许可证下包含上游 **DeepSeek Harness** 源码。这里同时欢迎原创工作与经妥善归属的上游工作。

参与之前请阅读[行为准则](CODE_OF_CONDUCT.md)。

<a id="development-setup"></a>

## 开发环境搭建

前置条件：Node.js `^22.19.0` 或 `>=24.0.0`，以及 pnpm `11.28.5`
（由 `packageManager` 字段锁定）。不支持其他包管理器。

```bash
git clone https://github.com/fuvision-devs/Vexer.git
cd Vexer
pnpm install
pnpm run build:artifacts
```

首次提交前，确认基线全部通过：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

完整的环境搭建、架构与故障排查内容见
[README](README.zh.md) 和 [AGENTS.md](AGENTS.md)。

<a id="reporting-bugs"></a>

## 报告 Bug

请使用 **Bug** issue 模板。附上以下信息：

- 你做了什么，以及期望的结果。
- 最小复现步骤，以及触发问题的最小输入。
- 实际表现，以及相关错误文本或日志。
- 版本、操作系统、Node 版本与模型提供方配置。

绝不要把 API key、令牌、密码或私有文件内容粘贴进 issue。如涉及安全漏洞，请停止并按照
[SECURITY.md](SECURITY.md) 处理——不要公开提交 issue。

<a id="proposing-features"></a>

## 提议新功能

请使用 **Feature** issue 模板。先描述问题，再描述方案：谁需要它，他们现在做不到什么，以及你期望的行为。

大型或架构性变更，请**先**开 issue 讨论，**再**写代码。维护者可能要求拆分工作，或基于架构理由拒绝。

<a id="branch-and-pull-request-workflow"></a>

## 分支与 PR 流程

1. Fork 本仓库，并从 `main` 拉出分支。
2. 每个 PR 只包含一处逻辑变更。无关的工作请拆分。
3. 引用你正在处理的 issue（`Fixes #123`）。
4. 填写 PR 模板，包括 **Testing** 部分，写明你实际运行过的命令。
5. 等待评审。回应评审意见，或说明你不同意的理由。

不要在评审历史上强推，也不要在他他人已在评审时未经协调就 rebase 分支。

<a id="testing-requirements"></a>

## 测试要求

运行与你的变更相关的检查，并且只报告你实际运行过的命令：

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run test:coverage
```

调用真实模型提供方的测试在缺少 API key 时会自动跳过，因此无 key 运行是安全的。不要为了让你的变更通过而削弱或跳过失败的测试——请修复测试，或在 PR 中解释行为变更。

每一处影响模型或用户可见行为的非平凡变更，都应更新对应的录制会话快照。

<a id="coding-conventions"></a>

## 编码规范

仓库级规则见 [AGENTS.md](AGENTS.md)。评审者最常检查的几条：

- 仅 ESM（`"type": "module"`），本地相对导入带 `.ts` 扩展名。
- 一切都要在 `strict: true` 下编译通过；每一处遗留的 `any` 都必须说明为什么无法收窄类型。
- 新行为应走有文档的插件扩展点，而不是改 agent loop。
- 公开导出附带简明 JSDoc，说明不明显的约定。
- 文件末尾有且仅有一个换行符。
- 当维护中的依赖确实能删除自有代码和测试时，优先使用它，而不是手写等价实现。

<a id="documentation"></a>

## 文档

文档要与它描述的行为在同一变更中更新：

- 包 README 和 JSDoc 约定与其代码一起变更。
- 对外可见的破坏性变更需要升级指南条目。
- 本仓库是双语的。如果你修改了配对文档的一侧，请同步更新另一侧并重新记录该配对：

```bash
pnpm run verify-translation-pairing --write path/to/file.md
```

开 PR 之前请运行 `pnpm run doc-sync`。

<a id="preserving-upstream-notices"></a>

## 保留上游声明

本项目是一个发行版，包含上游 **DeepSeek Harness** 代码与 vendored 的 **Cordis** 包。

- 不要移除或改写 [LICENSE](LICENSE) 中的上游版权声明。
- 不要删除 `vendor/` 内的上游 `LICENSE` 文件。
- 修改 vendored 包时，按照 [vendor/README.md](vendor/README.md) 的说明记录该变更。
- 增删依赖时，重新生成声明文件而不是手工编辑：

```bash
pnpm run gen-third-party-notices
pnpm run verify-third-party-notices
```

<a id="submitting-original-contributions"></a>

## 提交原创贡献

贡献即表示你同意：你的贡献以本项目的 [MIT 许可证](LICENSE) 授权，且你有权以这些条款提交它。

你保留自己著作权的所有权。**我们不要求你签署著作权转让协议，也不要求你把权利转让给 Future Vision 或任何其他人。**

不要贡献来自与 MIT 不兼容许可证项目的代码，也不要贡献你不是创作者或无权分享的材料。

<a id="code-of-conduct-1"></a>

## 行为准则

本项目遵循[贡献者公约行为准则](CODE_OF_CONDUCT.md)。通过其中描述的私密渠道报告不可接受的行为。

---

<p align="center"><strong>Build. Orchestrate. Automate.</strong></p>
