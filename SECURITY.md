# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.** Public
issues are visible to everyone and can put users at risk before a fix ships.

Report vulnerabilities privately using **GitHub Security Advisories** on this
repository:

1. Open the **Security** tab of this repository.
2. Select **Report a vulnerability**.
3. Fill in the advisory with the details below.

GitHub routes the report only to the maintainers. If private vulnerability
reporting is not enabled on this repository, contact the maintainers through
the channel listed under **Maintainer action required** below instead.

When reporting, include:

- The affected package, file, and version or commit.
- A description of the issue and its impact.
- Reproduction steps or a minimal proof of concept.
- Any suggested remediation, if you have one.

We will acknowledge the report, confirm the scope, and coordinate a fix and
disclosure timeline with you. Please allow a reasonable window for a fix
before any public disclosure.

## Maintainer action required

> **Action item for maintainers before the first public release.**
>
> This repository does not yet have a dedicated security contact address.
> Maintainers must either:
>
> 1. Enable **GitHub private vulnerability reporting** on the repository
>    (Settings → Code security and analysis → Private vulnerability
>    reporting), **or**
> 2. Publish a monitored security contact address here.
>
> Until one of these is in place, this section is the only supported private
> reporting path. Do not publish a placeholder email address — an unmonitored
> inbox is worse than none.

## Scope

In scope:

- The VEXER Agent application, CLI, web interface, desktop application, and
  SDKs in this repository.
- Build, packaging, and CI configuration that could expose credentials or
  ship compromised artifacts.

Out of scope:

- Vulnerabilities solely in third-party dependencies, upstream of this
  project. Report those to the affected dependency first, then let us know
  if a version bump is required here.
- Issues that require physical access, or that are already documented in
  [SAFETY.md](SAFETY.md).

## Security-relevant project facts

Read [SAFETY.md](SAFETY.md) before running VEXER. In short:

- VEXER is experimental developer-preview software and has **not** undergone
  a security audit.
- It can execute model-generated code and commands, load third-party plugins,
  and reach the network, processes, credentials, and files it is granted.
- Sandboxing, approval prompts, and permission controls reduce risk but do
  **not** guarantee isolation.

Run it with least privilege, ideally in a container or disposable machine,
and do not grant access to credentials or data you are not willing to lose.

## Credential handling

- Never commit API keys, tokens, passwords, or private keys. `.env` is
  gitignored; use [.env.example](.env.example) as your template.
- If you discover a committed credential in this repository, report it
  privately as described above. Do **not** include the secret value in the
  report — name the file and location only.
- Rotating a leaked credential is the only reliable remediation. Removing a
  key from the latest commit does not remove it from Git history.
