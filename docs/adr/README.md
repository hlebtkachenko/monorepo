# Architecture Decision Records

Decisions worth recording: the ones a future contributor (human or agent) would otherwise reverse for the wrong reason. Format follows [MADR-like](https://adr.github.io/madr/) shape, see [`_TEMPLATE.md`](_TEMPLATE.md).

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-iac-platform-hybrid-tofu-cdk.md) | IaC platform: hybrid OpenTofu + AWS CDK | Accepted |
| [0002](0002-observability-honeycomb.md) | Observability: Honeycomb for traces and events | Accepted |
| [0003](0003-coverage-risk-weighted.md) | Test coverage: risk-weighted, not flat percentage | Accepted |
| [0004](0004-no-self-hosted-runners.md) | CI runners: GitHub-hosted only, no self-hosted | Accepted |
| [0005](0005-container-runtime-docker-desktop.md) | Container runtime on Mac: Docker Desktop | Accepted |
| [0006](0006-cred-manager-granted.md) | AWS credential manager: Granted CLI | Accepted |
| [0007](0007-mvp-single-account-cdk-only.md) | MVP single-account: CDK-only, archive OpenTofu platform layer | Accepted |
| [0008](0008-cloudflare-tunnel-and-email.md) | Cloudflare Tunnel front door + Cloudflare/SES email split | Accepted |
| [0009](0009-orm-and-migration-style.md) | ORM + migration style: drizzle-orm types-only + handwritten SQL | Accepted |
| [0010](0010-multi-tenant-rls.md) | Multi-tenant RLS design (workspace + organization tiers) | Proposed |
| [0011](0011-audit-log.md) | Audit log: two-table append-only with two-pass redaction | Proposed |
| [0013](0013-money-and-fx.md) | Money + FX representation (`numeric(19,4)` + `Money<Currency>` brand) | Proposed |

Append in commit order, never reshuffled. Numbers are immutable after merge.

## When to write an ADR

Any one of these triggers an ADR:

- A choice between two non-obvious options where the rejected one is plausible enough that someone might re-choose it.
- A constraint that locks future work into a path (technology pin, architectural boundary, retention rule, regulatory line).
- A decision reversal: the new ADR supersedes the old one, and the old file keeps a `Status: Superseded by ADR-NN` header.

Not an ADR: routine implementation choices, conventions enforced by lint, day-to-day refactors.

## Status lifecycle

- `Proposed` — open PR, under discussion.
- `Accepted` — merged on `main`. Code anchors must exist or be explicitly deferred.
- `Superseded by ADR-NN` — replaced; file stays for history.
- `Amends ADR-NN` — adds to an existing decision without replacing it.
- `Deprecated` — decision still recorded but no longer load-bearing.

## File naming

`NNNN-kebab-case-slug.md`. Four-digit zero-padded sequence prefix. Slug states the decision in 3-6 words. No reshuffle on rename, file is immutable after merge.

## Authoring rules

- One decision per file. If two come up together, split.
- Status header first. Context, decision, consequences, alternatives, see-also follow.
- Code anchors: link to the file path that proves the decision is implemented. `lands with X` if deferred.
- Trade-offs are mandatory. An ADR with no Negative bullet is incomplete.
