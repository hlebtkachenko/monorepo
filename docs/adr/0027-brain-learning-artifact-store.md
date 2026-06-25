# 27. Afframe Brain learning artifacts — the `.brain/` git tree, written only via GitHub PR

- Status: Proposed
- Date: 2026-06-25
- Deciders: Hleb Tkachenko

> Records a decision from the approved Afframe Brain plan (v1.1). The constitution lives at
> `packages/brain/.brain/constitution.md` (locked, WP-0.2).

## Context and Problem Statement

The Brain is self-improving: run over run it distils corrections into reusable artifacts — booking
rules, counterparty aliases, judge calibration, eval cases, and a CHANGELOG. Two questions follow:
**where** do those artifacts live, and **how** are they written without letting an autonomous agent
quietly rewrite its own logic in production.

The threat is concrete. If a production worker could mutate its own rule set (a DB row, a local file,
a local git commit), a single bad run — or a prompt injection inside an ingested document — could
silently change how every future run books. That is a self-modifying supply-chain and the exact thing
the constitution forbids (no agent may edit its own constitution). Learning must be durable and
reviewable, but never a side effect a prod box applies to itself.

## Decision

The **`.brain/` git tree** (under `packages/brain/`) is the single learning-artifact store: the locked
`constitution.md`, plus `rules/`, `aliases/`, `memory/`, `judge/`, `evals/`, and `CHANGELOG.md`.
Durable writes land **only via a GitHub Pull Request** — the post-run **librarian** is propose-only and
the single durable writer: it clusters corrections, distils a proposed change, and opens a PR through
`workflow_dispatch`. A prod box **never** commits to `.brain/` locally. The `constitution.md` is
**locked** — changing it requires a fresh 2× independent advisor gate. The `.brain/rules` PR carries its
own eval gate (booking ≥ 0.90 on the brain-eval suite) before it can merge.

## Consequences

Positive:

- Every learned change is a reviewable diff behind a human-merged PR — no silent self-modification.
- Git-anchored, versioned history of how the Brain's logic evolved; the constitution is tamper-evident.
- The PR eval gate stops a regression-causing rule from ever merging.

Negative / trade-offs:

- Learning latency — improvements arrive on a PR cycle, not instantly mid-run.
- Requires the librarian + `workflow_dispatch` dispatch infrastructure and a per-PR eval surface.

Follow-up work required:

- WP-1.11 — librarian (propose-only): cluster → proposed rule → GitHub PR via `workflow_dispatch`.
- WP-2.8 — librarian end-to-end on a real run; `brain-eval.yml` exercised as the rule PR gate.

## Alternatives considered

- **A `brain_rules` database table** — rejected: not reviewable as a diff, no PR/eval gate, and a prod
  worker with write access could mutate it directly (the self-modification threat).
- **Local git commits on the prod worker** — rejected: a self-modifying box; violates the constitution
  and leaves no human review in the loop.
- **A vector store / RAG memory as the rule store** — rejected as the _durable_ store: not auditable
  line-by-line and cannot be PR/eval-gated. It may complement retrieval later, but the rules of record
  stay in the reviewable git tree.

## See also

- [ADR-0025](0025-brain-runtime-placement.md) (runtime), [ADR-0026](0026-brain-confidence-model.md) (confidence model)
- `packages/brain/.brain/constitution.md` (locked); `research/deep/D3-self-improving-concrete.md`
- Code anchor: `packages/brain/src/librarian/` (lands WP-1.11)
