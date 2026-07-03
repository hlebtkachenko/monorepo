# 25. Afframe Brain runtime — a dedicated worker lane, not the request path

- Status: Proposed (amended 2026-07-01 — see Amendment)
- Date: 2026-06-25
- Deciders: Hleb Tkachenko

> Records a decision from the approved Afframe Brain plan (v1.1). The Brain (`packages/brain`,
> Track B) is the autonomous Czech-accounting ingestion + booking agent.

## Amendment 2026-07-01 — Brain v1 is an external client, not a worker runtime

The original decision below (a net-new worker runtime holding a long-running **in-process** transaction) is
**superseded for v1** by the reframe (`.context/afframe-brain/REFRAME-v1.2.md`, R-1/R-2). Brain v1 is an
**unprivileged Claude Code CLIENT** of the system: Hleb personally launches Claude Code sessions that book by
calling the accounting domain's **MCP/HTTP API**. The Brain holds **no DB connection** and no in-process
`withOrganization` transaction, so the original rationale (a direct non-pgbouncer connection for a long
in-process transaction; a worker owning the loop/heartbeat/budget) **does not apply to v1**:

- **Write path + `withOrganization` + the confidence gate run SERVER-side**, inside the accounting API endpoint,
  resolving org from the API-key principal. A client structurally cannot forge a green booking.
- **The marshrutizátor (admission + queue + per-(org,period) write-lock) lives at the API front door**, not a
  worker lane — see [ADR-0028](0028-brain-marshrutizator-isolation.md).
- The agent loop, tool-calling, sub-agent (Opus advisor) escalation, model routing, and session resume are
  provided by **Claude Code itself** — no `runBrain` loop or bespoke container to build (WP-1.1/1.4b/1.5 shrink).
  A thin pg-boss supervisor lane that _launches + budgets_ CC sessions is an OPTIONAL robustness path (a
  v2/unattended concern), not v1-critical — v1 = Hleb driving sessions personally.

Brain-as-a-privileged-part-of-the-system (in-process, in-app chat for real customers) returns in **v2**. The
original decision below is retained for history and describes that v2/worker shape.

## Context and Problem Statement

The Brain runs long: an autonomous booking run is an Agent-SDK loop that ingests a messy per-org
dump, parses it to canonical IR, classifies, scores confidence, and serializes typed writes into
`@workspace/accounting` inside `withOrganization`. A single run spans minutes-to-hours, holds a
database transaction open across many steps, and must be pausable/resumable (heartbeat,
`sdk_session_id`) with budget + iteration guards. It writes through the pooled app path's tables but
needs a **direct** (non-pgbouncer) connection for the long-running transaction.

This cannot live on the synchronous request path. `apps/api` and `apps/web` serve sub-second HTTP
requests over a pgbouncer-pooled connection; parking a multi-minute agent loop there would exhaust the
pool, block the event loop, and tie the Brain's failure domain to user-facing latency.

## Decision

Run the Brain as a **net-new worker runtime** — a dedicated boot path / container (the `brain` lane)
that calls `boot()` and `runBrain(BrainRunContext)`, separate from the web/api request path, using
`DATABASE_DIRECT_URL` (direct Postgres, not the pgbouncer pool) for its long-running transactions. Each
run is a job keyed by `brain_run`, with heartbeat, budget, and iteration guards (§12). `BYPASSRLS`
lives **only** in the admin `brain-control.yml` path, never in the agent write path — agent writes go
through `withOrganization`, org injected server-side from `brain_run`.

## Consequences

Positive:

- Isolated failure domain — a stuck/looping run never degrades user-facing API/web latency.
- Correct connection semantics — a direct connection supports the long-running, multi-step transaction
  a pooled connection cannot.
- Clean resume + budget control — the worker owns `sdk_session_id`, heartbeat, and the iteration/budget
  caps without request-timeout pressure.

Negative / trade-offs:

- Another deployable to build, deploy, and observe (one more Fargate task class).
- The worker needs its own secrets/role wiring (direct DB URL, model creds).

Follow-up work required:

- WP-1.1 — the Brain worker runtime (boot path / container, `brain` lane, `DATABASE_DIRECT_URL`).
- WP-1.5 — `runtime/` (`BrainRunContext`, `runBrain`, budget/iteration guards).
- WP-1.4c — resume via `sdk_session_id` + heartbeat.

## Alternatives considered

- **Run inside `apps/api`** — rejected: couples a multi-minute agent loop to the sub-second request
  path; exhausts the pgbouncer pool and blocks the API event loop.
- **Run inside `apps/web`** — rejected: Next.js is a request/render runtime, not a long-running job host.
- **Serverless (Lambda/Fargate-spot one-shot)** — rejected: agent runs + budget exceed function time
  limits and need durable resume; a long-lived worker is the right shape.

## See also

- ADR-0007 (single-account CDK layout), ADR-0008 (Cloudflare Tunnel front door)
- [ADR-0026](0026-brain-confidence-model.md) (confidence model), [ADR-0027](0027-brain-learning-artifact-store.md) (learning store)
- `.context/afframe-brain/AFFRAME-BRAIN-EXECUTOR-BRIEF.md` §3 (layer diagram), `research/deep/D5-internal-tool-architecture.md`
- Code anchor: `packages/brain/` (runtime lands under `src/runtime/`)
