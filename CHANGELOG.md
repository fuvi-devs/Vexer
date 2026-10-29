# Changelog

All notable changes to this project will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/). The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Nothing yet.

## [1.0.0] — date pending

First public release of VEXER Agent as an open-source distribution.

### Notes on this entry

This entry records the initial publication of the repository. It does not
describe a from-scratch implementation: the codebase incorporates upstream
DeepSeek Harness (MIT) and vendored Cordis packages, plus components original
to this distribution. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and [vendor/README.md](vendor/README.md) for the breakdown.

### Added

- Public repository packaging, documentation, and contribution guides.
- [.env.example](.env.example) with placeholder-only configuration.
- [SECURITY.md](SECURITY.md) private vulnerability reporting policy.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) Contributor Covenant 2.1.

### Fixed

- `tsconfig.base.json` package aliases regenerated so packages added after
  the last generation resolve through `pnpm run gen-tsconfig-paths`.
- Project references to `credit-core` added in `credit-guard` and
  `credit-killbill`, allowing the host TypeScript build to complete.

---

<!--
Release checklist for maintainers:

1. Confirm the release date and replace "date pending".
2. Move Unreleased items into the versioned section.
3. Confirm the version in package.json matches the tag.
4. Run: pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build
5. Run: pnpm run verify-third-party-notices
6. Confirm no secrets in tracked files: git status --ignored is NOT enough —
   review the staged file list explicitly.
7. Tag and publish only after human approval.
-->
