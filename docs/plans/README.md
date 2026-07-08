# docs/plans

**Research, context dossiers, and large reference docs that GitHub issues depend on.**

GitHub Issues is where issues and todos live. The active GitHub Project for the
current planning horizon can carry workflow fields (`Status`, `Priority`,
`Type`), but issues remain the source of truth for active work. Issue bodies
should stay focused on _what to do_. Supporting material, multi-page audits,
dependency graphs, debug maps, migration plans, and scope research shared by
several issues, lives here.

A file in this directory is a **stable reference** that one or more GitHub
issues point to. Updating progress against the work happens in GitHub Issues
and the active Project, not in the file.

## When to add a file here

Add a `.md` here when:

- The context is **too large for a GitHub issue body** (e.g. a 500-line
  cross-cutting audit, a dependency graph, a runbook-adjacent debug pack).
- The context is **shared by multiple issues** so duplicating it in each one
  would drift.
- The context is **research or a snapshot** (architecture map, post-mortem,
  vendor evaluation) that survives the issue lifecycle.

Do NOT add a file here when:

- It's a single issue's checklist — put it in the GitHub issue body instead.
- It's an operational runbook — put it in [`docs/runbooks/`](../runbooks/) instead.
- It's an architecture decision — put it in [`docs/adr/`](../adr/) instead.
- It's a design spec for an upcoming feature — put it in [`docs/specs/`](../specs/) instead.

## Conventions

- **Filename:** uppercase, hyphenated, `.md`. Prefix with the primary tracker
  identifier when the file is scoped to one issue/epic (e.g.
  `AFF-150-AUDIT-CONTEXT.md`). Use a topic name when the file spans many issues
  (e.g. `AI-FINANCIAL-AGENTS-PLAN.md`).
- **Top banner:** every file starts with a short header that
  - states the purpose in one sentence,
  - links the primary GitHub issue(s) the file backs,
  - dates the snapshot.
- **Lifecycle:** when the last GitHub issue depending on the file is closed AND
  the content is no longer useful as reference, delete the file. Snapshots that
  outlive their issues (e.g. a one-time post-mortem) can stay — but flip the
  banner to "Archived — read-only reference".
- **No issue tracking in markdown:** progress, assignees, due dates, status
  belong in GitHub Issues and the Roadmap project. The file describes the
  territory, not the route.

## Current files

| File                                                         | Backs                          | Notes                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`AFF-150-AUDIT-CONTEXT.md`](AFF-150-AUDIT-CONTEXT.md)       | Legacy AFF-150                 | Staging auth/onboarding/admin debug pack — dependency graph, audit punch-list, staging access model. Delete when no longer useful as reference.          |
| [`AUTH-OUTSTANDING.md`](AUTH-OUTSTANDING.md)                 | Legacy AFF-29                  | Legacy auth follow-ups. Delete when no longer useful as reference.                                                                                       |
| [`SCRIPTS-ENABLEMENT.md`](SCRIPTS-ENABLEMENT.md)             | Legacy AFF-30                  | Legacy scripts-enablement scope. Delete when no longer useful as reference.                                                                              |
| [`AI-FINANCIAL-AGENTS-PLAN.md`](AI-FINANCIAL-AGENTS-PLAN.md) | Legacy AFF-31                  | Long-horizon AI agents plan. Stays for reference after the active tracking issue closes.                                                                 |
| [`SECRETS-MIGRATION.md`](SECRETS-MIGRATION.md)               | Legacy AFF-245/AFF-243/AFF-244 | Vault-on-VPS + AWS SSM SecureString secrets migration plan. 11 milestones, 6 advisor gates. Delete when no longer useful as reference.                   |
| [`SECRETS-101.md`](SECRETS-101.md)                           | n/a — primer                   | Conceptual reference primer for secrets in a fintech / SaaS context, grounded in the Afframe stack. Stays for onboarding even after the migration ships. |

## Archived

Superseded plans (`AWS-INTEGRATION-PLAN.md`, `CICD-PLAN.md`, `EXECUTOR-BRIEF.md`,
`INFRA-REBUILD-PLAN.md`) and the completed `code-review-overnight/` PR #89
review were moved to `_junk/2026-05-17-docs-plans-archive/` (gitignored, kept
locally) and remain in git history. The deferred follow-ups from that review
are tracked in GitHub Issues.
