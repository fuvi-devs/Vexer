# Contributing

English | [中文](CONTRIBUTING.zh.md)

Thank you for your interest in contributing to VEXER Agent.

VEXER Agent is maintained by **Future Vision** and incorporates upstream
**DeepSeek Harness** source under the MIT License. Both original work and
carefully attributed upstream work are welcome here.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

<a id="development-setup"></a>

## Development setup

Prerequisites: Node.js `^22.19.0` or `>=24.0.0`, and pnpm `11.28.5`
(pinned by the `packageManager` field). Other package managers are not
supported.

```bash
git clone https://github.com/fuvision-devs/Vexer.git
cd Vexer
pnpm install
pnpm run build:artifacts
```

Before your first commit, confirm the baseline is green:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

Full setup, architecture, and troubleshooting detail live in
[README.md](README.md) and [AGENTS.md](AGENTS.md).

<a id="reporting-bugs"></a>

## Reporting bugs

Use the **Bug** issue template. Include:

- What you did, and what you expected.
- Minimal reproduction steps and the smallest input that triggers it.
- Actual behaviour with the relevant error text or logs.
- Version, operating system, Node version, and provider configuration.

Never paste API keys, tokens, passwords, or private file contents into an
issue. If a security vulnerability is involved, stop and follow
[SECURITY.md](SECURITY.md) instead — do not open a public issue.

<a id="proposing-features"></a>

## Proposing features

Use the **Feature** issue template. Describe the problem before the
solution: who needs it, what they cannot do today, and what behaviour you
expect.

For large or architectural changes, open the issue for discussion **before**
writing code. Maintainers may ask to split the work or decline it on
architectural grounds.

<a id="branch-and-pull-request-workflow"></a>

## Branch and pull request workflow

1. Fork the repository and branch from `main`.
2. Keep each pull request to one logical change. Split unrelated work.
3. Reference the issue you are addressing (`Fixes #123`).
4. Fill in the pull-request template, including the **Testing** section with
   the commands you actually ran.
5. Expect review. Respond to review comments or explain why you disagree.

Do not force-push over review history, and do not rebase a branch that others
are already reviewing without coordinating first.

<a id="testing-requirements"></a>

## Testing requirements

Run the checks relevant to your change, and report only what you ran:

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run test:coverage
```

Tests that call a live model provider self-skip when no API key is present,
so a keyless run is safe. Do not weaken or skip a failing test to make your
change pass — fix the test or explain the behaviour change in the pull
request.

Every non-trivial change to model- or user-visible behaviour should update
the corresponding recorded-session snapshot.

<a id="coding-conventions"></a>

## Coding conventions

The repository-wide rules live in [AGENTS.md](AGENTS.md). The ones reviewers
check most often:

- ESM only (`"type": "module"`), and `.ts` extensions on local relative
  imports.
- Everything compiles under `strict: true`; every remaining `any` must
  explain why narrowing is infeasible.
- New behaviour goes on documented plugin extension points, not into the
  agent loop.
- Public exports carry concise JSDoc stating the non-obvious contract.
- Files end with exactly one trailing newline.
- Prefer maintained dependencies over hand-rolled equivalents when they
  genuinely delete owned code and tests.

<a id="documentation"></a>

## Documentation

Update documentation in the same change as the behaviour it describes:

- Package README and JSDoc contracts change together with their code.
- Externally visible breaking changes need an upgrade-guide entry.
- This repository is bilingual. If you edit one side of a paired document,
  bring the other side along and re-record the pair:

```bash
pnpm run verify-translation-pairing --write path/to/file.md
```

Run `pnpm run doc-sync` before opening the pull request.

<a id="preserving-upstream-notices"></a>

## Preserving upstream notices

This project is a distribution that includes upstream **DeepSeek Harness**
code and vendored **Cordis** packages.

- Do **not** remove or rewrite the upstream copyright notice in
  [LICENSE](LICENSE).
- Do **not** delete an upstream `LICENSE` file inside `vendor/`.
- When you modify a vendored package, record the change in
  [vendor/README.md](vendor/README.md) as that file instructs.
- If you add or remove a dependency, regenerate the notices rather than
  editing them by hand:

```bash
pnpm run gen-third-party-notices
pnpm run verify-third-party-notices
```

<a id="submitting-original-contributions"></a>

## Submitting original contributions

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE), and that you have the right to submit it
under those terms.

You keep ownership of your copyright. **You are not asked to sign a
copyright assignment or to transfer rights to Future Vision or anyone else.**

Do not contribute code copied from a project whose license is incompatible
with MIT, and do not contribute material you did not create or are not
authorized to share.

<a id="code-of-conduct-1"></a>

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
Report unacceptable behaviour through the private channel described there.

---

<p align="center"><strong>Build. Orchestrate. Automate.</strong></p>
