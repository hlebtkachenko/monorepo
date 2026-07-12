# docs/plans

**Bounded future-work context and cross-cutting acceptance criteria.**

GitHub Issues is where issues and todos live. The active GitHub Project for the
current planning horizon can carry workflow fields (`Status`, `Priority`,
`Type`), but issues remain the source of truth for active work. Issue bodies
should stay focused on _what to do_. Supporting scope research and execution
context shared by several issues lives here while the work remains current.

A file in this directory describes work not yet complete. Updating progress
happens in GitHub Issues and the active Project, not in the file.

## When to add a file here

Add a `.md` here when:

- The context is **too large for a GitHub issue body**.
- The context is **shared by multiple issues** so duplicating it in each one
  would drift.
- The work spans several issues and needs one stable scope boundary.

Do NOT add a file here when:

- It's a single issue's checklist — put it in the GitHub issue body instead.
- It's an operational runbook — put it in [`docs/runbooks/`](../runbooks/) instead.
- It's an architecture decision — put it in [`docs/adr/`](../adr/) instead.
- It's a design spec for an upcoming feature — put it in [`docs/specs/`](../specs/) instead.
- It's current explanatory material or completed implementation history — put
  it in [`docs/reference/`](../reference/) instead.

## Conventions

- **Filename:** uppercase, hyphenated, `.md`. Use a topic name that remains
  meaningful after issue numbers change.
- **Top banner:** every file starts with a short header that
  - states the purpose in one sentence,
  - links the primary GitHub issue(s) the file backs,
  - dates the snapshot.
- **Lifecycle:** when work completes, move useful implementation history to
  `docs/reference/`. Move superseded or valueless material to `_junk/`.
- **No issue tracking in markdown:** progress, assignees, due dates, status
  belong in GitHub Issues and the Roadmap project. The file describes the
  territory, not the route.

## Current files

| File                                                                 | Backs                            | Notes                                                                                  |
| -------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| [`API-PUBLIC-LAUNCH.md`](API-PUBLIC-LAUNCH.md)                       | Public API launch                | Cross-surface API launch sequencing and acceptance gates.                              |
| [`CZ-ACCOUNTING-KB-GROWTH-PLAN.md`](CZ-ACCOUNTING-KB-GROWTH-PLAN.md) | Brain accounting-KB growth track | Research and staged expansion of the machine-readable Czech accounting knowledge base. |
| [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md)                         | v1 launch                        | Cross-system launch gates. GitHub Issues own task status and implementation work.      |

## Archived

Completed secrets and statutory-closing plans moved to `docs/reference/` as
labelled implementation history. Superseded AFF-150, auth-outstanding,
pre-reframe AI-agent, scripts-enablement, and public-repo setup material moved to
`_junk/2026-07-12-docs-reclassification/` and remain in git history. Earlier
archives remain under `_junk/2026-05-17-docs-plans-archive/`.
