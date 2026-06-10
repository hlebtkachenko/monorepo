# docs/plans

**Research, context dossiers, and large reference docs that Linear issues depend on.**

[Linear](https://linear.app/hapddev) is where issues and todos live —
route by function per `AGENTS.md` § Issue Tracking: product engineering →
`DEV`, product discovery → `PRO`, sales → `SAL`, operations → `OPS`. The
legacy `AFF` team is FROZEN — never file new work there. Linear issue
bodies are deliberately short — they describe _what to do_. The
supporting material — multi-page audits, dependency graphs, debug maps,
migration plans, scope research that several issues share — lives here.

A file in this directory is a **stable reference** that one or more Linear issues
point to. Updating progress against the work happens in Linear, not in the file.

## When to add a file here

Add a `.md` here when:

- The context is **too large for a Linear issue body** (e.g. a 500-line
  cross-cutting audit, a dependency graph, a runbook-adjacent debug pack).
- The context is **shared by multiple issues** so duplicating it in each one
  would drift.
- The context is **research or a snapshot** (architecture map, post-mortem,
  vendor evaluation) that survives the issue lifecycle.

Do NOT add a file here when:

- It's a single issue's checklist — put it in the Linear issue body instead.
- It's an operational runbook — put it in [`docs/runbooks/`](../runbooks/) instead.
- It's an architecture decision — put it in [`docs/adr/`](../adr/) instead.
- It's a design spec for an upcoming feature — put it in [`docs/specs/`](../specs/) instead.

## Conventions

- **Filename:** uppercase, hyphenated, `.md`. Prefix with the primary Linear
  identifier when the file is scoped to one issue/epic (e.g.
  `AFF-150-AUDIT-CONTEXT.md`). Use a topic name when the file spans many issues
  (e.g. `AI-FINANCIAL-AGENTS-PLAN.md`).
- **Top banner:** every file starts with a short header that
  - states the purpose in one sentence,
  - links the primary Linear issue(s) the file backs,
  - dates the snapshot.
- **Lifecycle:** when the last Linear issue depending on the file is closed AND
  the content is no longer useful as reference, delete the file. Snapshots that
  outlive their issues (e.g. a one-time post-mortem) can stay — but flip the
  banner to "Archived — read-only reference".
- **No issue tracking in markdown:** progress, assignees, due dates, status
  belong in Linear. The file describes the territory, not the route.

## Current files

| File                                                         | Backs                                                                                                                                                         | Notes                                                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`AFF-150-AUDIT-CONTEXT.md`](AFF-150-AUDIT-CONTEXT.md)       | [AFF-150](https://linear.app/hapddev/issue/AFF-150)                                                                                                           | Staging auth/onboarding/admin debug pack — dependency graph, audit punch-list, staging access model. Delete when AFF-150 closes if no longer useful as reference. |
| [`AUTH-OUTSTANDING.md`](AUTH-OUTSTANDING.md)                 | [AFF-29](https://linear.app/hapddev/issue/AFF-29)                                                                                                             | Legacy auth follow-ups. Delete when AFF-29 closes.                                                                                                                |
| [`SCRIPTS-ENABLEMENT.md`](SCRIPTS-ENABLEMENT.md)             | [AFF-30](https://linear.app/hapddev/issue/AFF-30)                                                                                                             | Legacy scripts-enablement scope. Delete when AFF-30 closes.                                                                                                       |
| [`AI-FINANCIAL-AGENTS-PLAN.md`](AI-FINANCIAL-AGENTS-PLAN.md) | [AFF-31](https://linear.app/hapddev/issue/AFF-31)                                                                                                             | Long-horizon AI agents plan. Stays for reference even after AFF-31 closes.                                                                                        |
| [`SECRETS-MIGRATION.md`](SECRETS-MIGRATION.md)               | [AFF-245](https://linear.app/hapddev/issue/AFF-245), [AFF-243](https://linear.app/hapddev/issue/AFF-243), [AFF-244](https://linear.app/hapddev/issue/AFF-244) | Vault-on-VPS + AWS SSM SecureString secrets migration plan. 11 milestones, 6 advisor gates. Delete when AFF-245 closes if no longer useful as reference.          |
| [`SECRETS-101.md`](SECRETS-101.md)                           | n/a — primer                                                                                                                                                  | Conceptual reference primer for secrets in a fintech / SaaS context, grounded in the Afframe stack. Stays for onboarding even after the migration ships.          |

## Archived

Superseded plans (`AWS-INTEGRATION-PLAN.md`, `CICD-PLAN.md`, `EXECUTOR-BRIEF.md`,
`INFRA-REBUILD-PLAN.md`) and the completed `code-review-overnight/` PR #89
review were moved to `_junk/2026-05-17-docs-plans-archive/` (gitignored, kept
locally) and remain in git history. The deferred follow-ups from that review
are tracked in [AFF-32](https://linear.app/hapddev/issue/AFF-32).
