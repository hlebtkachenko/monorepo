# 18. Three-layer authorization (RLS + OpenFGA sidecar + Cerbos embedded)

- Status: Accepted
- Date: 2026-05-14
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The monorepo is a multi-tenant accounting platform. Authorization spans three concerns
that no single tool answers well:

1. **Tenant isolation** — physical impossibility of reading rows that belong to another
   organization or workspace.
2. **Relationship-based access** — workspace admins inherit privileges over child orgs,
   external auditors can be granted view on a single invoice without a workspace
   membership, AI agent principals can edit but not delete, "list every doc user X can
   view" must traverse a graph.
3. **Conditional / action gates** — `journal_entry` and `ledger_entry` cannot be deleted
   after a close period; `vat_rate` and `numerical_series` edits require `can_administer`;
   money transfers above a threshold need second-factor approval.

ADR-0010 covers concern (1) with Postgres FORCE RLS + GUCs. That stack is the floor. It is
not sufficient for (2) or (3). The reference repo (`lac-afframe`) ran OpenFGA and Cerbos as
separate Fargate services. After comparing alternatives, Casbin embedded was rejected
(node-casbin issue #322 — `getImplicitPermissionsForUser` broken with domains since 2021,
no maintained Postgres adapter for Node, no explain API for DORA compliance). OpenFGA has
no official in-process embed mode; Cerbos does (`@cerbos/embedded` ships a WASM bundle).

## Decision

Three layers, each owning one concern. All three run inside the existing api Fargate task —
no new ECS service.

- **L1 — Postgres FORCE RLS + GUCs** (ADR-0010). Always on. Set per transaction via
  `withOrganization` / `withWorkspace` / `withAdminBypass` helpers in
  `packages/db/src/tenancy.ts`. Cross-tenant reads are physically impossible for the
  `app_user` role.
- **L2 — OpenFGA sidecar** in the api task (port 8080). ReBAC graph stored in shared
  RDS under schema `openfga`. Handles relationship traversal, `ListObjects` reverse
  lookup, and ad-hoc share tuples (external auditor on one invoice). Tuples are written
  via a `permissions-drain` lane in `packages/workers` consuming `permissions_outbox`
  (ADR-0017). Local dev runs OpenFGA via compose profile `auth`.
- **L3 — Cerbos embedded** via `@cerbos/embedded`. Policy bundle compiled to WASM at
  Docker build time, loaded in-process by the NestJS authz module. Handles
  attribute-based and action-level rules: AI agent action gates, immutability of journal
  and ledger entries, conditional rules (workflow state, money limits).

Layer call order in the api `AuthGuard`: L1 → L3 → L2.

1. L1 (RLS): set GUCs inside the transaction. Free, always on.
2. L3 (Cerbos): in-process WASM call. ~10–100 µs. Cheap gate that rejects most
   unauthorized requests before any network hop.
3. L2 (OpenFGA): localhost gRPC call. ~0.5–1 ms. Only invoked for list/share/transfer
   actions that need graph traversal.

OpenFGA store_id and model_id are not secrets — they are identifiers — and live in SSM
Parameter Store (Standard tier, free), populated by `infra/openfga/bootstrap.mjs` after
the first OpenFGA migrate.

## Consequences

Positive:

- Full lac-parity authz capability without lac's operational complexity (two extra
  services). Both new pieces ride on the existing api task.
- ~$0 marginal AWS cost. OpenFGA Go binary fits in ~200 MiB; the api task still fits in
  2 GB. Worst case +$3.68/mo for a bump to 2.5 GB.
- Cerbos embedded = no network hop, no sidecar to fail. Hot-reload requires a redeploy
  (acceptable — rule changes are rare).
- OpenFGA gives a working explain / expand API for DORA Article 8 audit obligations.
- `permissions_outbox` table already exists. Drain worker is the only new piece on the
  write path.
- Direct port of lac's `model.fga` semantics; expanded test coverage (50+ assertions vs.
  lac's 18).

Negative / trade-offs:

- 5 containers in the api task (web + api + cloudflared + pgbouncer + openfga). Higher
  density = more restart-time coupling. Mitigated by container `essential: true` flags
  + per-container healthchecks.
- Drain worker introduces an eventual-consistency window between an outbox write and the
  OpenFGA tuple being readable. Expected lag < 1 s. Alarm on outbox-row-age > 10 s.
- Two policy systems (Cerbos YAML + OpenFGA `.fga`) — operators must understand both.
  Mitigated by tight per-system test coverage (`cerbos compile --tests`,
  `fga model test`) running on every PR.
- WASM bundle from Cerbos commit inflates `size-cap.yml` LOC count; addressed by adding
  `:!**/*.wasm` to the size-cap git-diff exclusion list.

Follow-up work required:

- `infra/cerbos/policies/**` + tests + Dockerfile WASM build step.
- `infra/openfga/model.fga` + tests + `bootstrap.mjs` + compose profile `auth`.
- `infra/cdk/lib/app-stack.ts` — add OpenFGA sidecar container + SSM parameter reads.
- `packages/workers/src/lanes/permissions-drain.ts` — consume `permissions_outbox`
  using `withAdminBypass`.
- `apps/api/src/authz/**` — Cerbos module, OpenFGA module, AuthGuard with L1→L3→L2
  ordering documented at the top of `authz.guard.ts`.
- `apps/web/lib/authz.ts` — server-side helper for Node-runtime layouts that calls into
  the api authz endpoint (Cerbos + OpenFGA stay in the api process; web does not
  duplicate them). The edge-runtime `proxy.ts` keeps its cookie-only optimistic check.
- Integration tests covering all 3 layers in combination, including defense-in-depth
  cases (RLS blocks even when OpenFGA allows).
- Manual prod bootstrap step in `docs/runbooks/AWS-DEPLOY.md` — operator runs
  `CREATE SCHEMA openfga AUTHORIZATION app_owner` + `openfga migrate` + `bootstrap.mjs`
  once before the first `cdk deploy App-{env}`.

## Alternatives considered

- **RLS only** — rejected. Cannot express graph traversal, ad-hoc shares without
  workspace membership, or AI agent action gates cleanly. Recursive CTEs are slow and
  brittle at any non-trivial graph depth.
- **Casbin embedded** — rejected. node-casbin's `getImplicitPermissionsForUser` is
  broken with domains (GitHub issue #322, open since 2021). All Postgres adapters for
  Node are 4+ years stale. No explain API. Model semantics are data-level convention
  not engine-enforced (drain bug = silent privilege grant). See
  `.context/decision-casbin-vs-openfga.md`.
- **OpenFGA sidecar + no Cerbos** (action gates in TypeScript switch statements) —
  rejected. Switch statements grow unmaintainable beyond ~15 resource-type × action
  combos and are not independently auditable. The accounting domain already has more
  than that.
- **Lac's full stack (two separate ECS services)** — rejected for monorepo MVP scale.
  Two services = two scaling stories, two on-call concerns, ~$15/mo extra Fargate.
  Both Cerbos and OpenFGA support embedded / sidecar modes that fit inside the
  existing api task at $0 marginal cost.

## See also

- ADR-0007 — MVP single-account CDK-only deploy
- ADR-0008 — Cloudflare Tunnel + email
- ADR-0010 — Multi-tenant RLS (Related)
- ADR-0011 — Audit log (Cerbos policies must emit audit events)
- ADR-0017 — Workers backed by pg-boss only (drain worker lives there)
- `.context/decision-authz-stack.md` — full analysis (superseded conclusion at top)
- `.context/decision-casbin-vs-openfga.md` — Casbin rejection rationale
- `packages/db/src/tenancy.ts` — `withOrganization` / `withAdminBypass` helpers
- `packages/db/src/schema/permissions_outbox.ts` — drain source table
- `infra/cerbos/**` — policies + tests + WASM build
- `infra/openfga/**` — model + tests + bootstrap
