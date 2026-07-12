# Plans

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
- It's current explanatory material: place it with the owning product area or
  next to the cross-cutting docs index.

## Conventions

- **Filename:** uppercase, hyphenated, `.md`. Use a topic name that remains
  meaningful after issue numbers change.
- **Top banner:** every file starts with a short header that
  - states the purpose in one sentence,
  - links the primary GitHub issue(s) the file backs,
  - dates the snapshot.
- **Lifecycle:** when work completes, move the document to `_junk/`. Git history
  and linked GitHub issues preserve implementation history.
- **No issue tracking in markdown:** progress, assignees, due dates, status
  belong in GitHub Issues and the Roadmap project. The file describes the
  territory, not the route.

## Current files

| File                                                                 | Backs                            | Notes                                                                                  |
| -------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| [`AI-FINANCIAL-AGENTS-PLAN.md`](AI-FINANCIAL-AGENTS-PLAN.md)         | EPIC #485 + EPIC #487            | Research and design context for AI-assisted financial workflows and the reconciler.    |
| [`CZ-ACCOUNTING-KB-GROWTH-PLAN.md`](CZ-ACCOUNTING-KB-GROWTH-PLAN.md) | Brain accounting-KB growth track | Research and staged expansion of the machine-readable Czech accounting knowledge base. |
| [`V1-LAUNCH-GATES.md`](V1-LAUNCH-GATES.md)                           | v1 launch                        | Stable cross-system go-live criteria. GitHub Issues own completion status.             |

## Archived

Completed and superseded plans live under dated `_junk/` directories and remain
available in git history. Active delivery status lives in GitHub Issues.
