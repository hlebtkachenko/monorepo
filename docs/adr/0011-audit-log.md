# 11. Audit log: two-table append-only with two-pass redaction

- Status: **Proposed**
- Date: 2026-05-11
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The platform must retain a tamper-evident record of two distinct event categories:

1. **AI tool calls.** Every invocation of an AI-driven mutation (post journal entry, classify
   invoice, reconcile bank statement) requires structured input/output, idempotency
   enforcement, redacted payloads for 10-year statutory retention under Czech accounting law,
   and forensic queryability by actor, tool, time, and organization.
2. **Human + system events.** Login, role grants, BYPASSRLS use, configuration changes,
   workspace mutations, and other actions that are not AI tool calls but still need a record
   for compliance and incident response.

A single unified `audit_log` table was the obvious starting point but fails at scale: AI tool
calls carry tool-specific input/output shapes, confidence scores, rationale, and idempotency
keys that have no analogue in a login event. Polymorphic columns inflate row width, complicate
indexing, and turn redaction into a per-event-type matrix. A single table also conflates
retention requirements: tool calls demand 10 years; login events arguably less.

A separate problem: PII redaction must run before any data hits the audit row. Input shapes
vary per tool (an invoice-import tool exposes IBAN; a journal-post tool exposes amounts and
account codes). A single static redact rule cannot cover both. The application also writes
the same payload structure to pino logs for live debugging — the same redaction must apply
at both sinks.

## Decision

Two tables, append-only, with a per-tool redaction registry that drives both audit writes
and pino log paths.

`tool_call_log` holds AI tool invocations. Primary key `id uuid`, plus columns for
`organization_id`, `tool_name`, `idempotency_key` (UNIQUE per org/tool), `actor_kind`
(`human`/`agent`/`system`), `actor_user_id`, `input_redacted jsonb`, `output_redacted jsonb`,
`status`, `confidence_score numeric`, `rationale_redacted text`, `auto_applied boolean`,
`approved_by_user_id uuid`, `created_at timestamptz`. RLS by `organization_id`.

`audit_event` holds workspace-tier events. Primary key `id uuid`, plus `workspace_id`,
`organization_id` (nullable; some events are workspace-scoped), `event_type`,
`actor_user_id`, `payload_redacted jsonb`, `created_at timestamptz`. RLS by `workspace_id`
with NULLIF guards.

The redaction stack is two-pass:

1. **Baseline keys, recursive.** Any object key matching `BASELINE_REDACT_KEYS` (password,
   token, secret, api_key, authorization, etc.) gets value-replaced with `[REDACTED]`
   regardless of depth. Shipped in `@workspace/observability/redact-baseline`. Used by both
   audit and pino.
2. **Per-tool dot-path rules.** Tool-specific paths (`input.invoice.iban`,
   `output.lines[*].account_code`) registered via
   `@workspace/db/audit/redaction-registry`. Applied AFTER baseline. Each tool registers
   its own paths at module load.

Append-only is enforced at three layers in the database:

- **Layer 1** — catalog `REVOKE UPDATE, DELETE, TRUNCATE ON tool_call_log, audit_event FROM
  app_user`. No-op today under `GRANT app_admin TO app_user` because `app_user` inherits all
  of `app_admin`'s DML. Becomes load-bearing if the inheritance chain is severed.
- **Layer 2** — `BEFORE UPDATE` and `BEFORE DELETE` triggers raise `check_violation` on any
  attempt. The load-bearing layer. Fires regardless of role membership unless explicitly
  disabled in the same transaction (which the trigger function blocks).
- **Layer 3** — `BEFORE TRUNCATE` triggers prevent bulk-delete via TRUNCATE statement.

## Why two tables, not one

A unified `audit_log` would carry `tool_name`, `idempotency_key`, `confidence_score`,
`rationale_redacted`, `auto_applied`, `approved_by_user_id` as nullable on every row,
including login events that never need them. Row width grows ~6× and storage cost
scales linearly. Idempotency enforcement (`UNIQUE (organization_id, tool_name,
idempotency_key)`) would require a partial index `WHERE tool_name IS NOT NULL` —
workable but awkward. Querying "all tool calls for organization X in May" becomes
`WHERE event_type = 'tool_call' AND organization_id = X AND created_at ...` instead of
a direct table scan with a tight index.

The split also matches a real difference in access patterns: AI tool-call audit is read by
the AI agent layer (`@workspace/permissions` and future `@workspace/ai`) for idempotency
replay and confidence-trend analytics. `audit_event` is read by ops dashboards and
incident-response runbooks. Different SLA, different index strategy.

## Two-pass redaction

A single pass is insufficient because of two overlapping constraints. Baseline key matching
must run recursively (an `authorization` key buried five levels deep in tool output must be
redacted regardless of tool). Per-tool dot-path rules must run by exact path (the bank
statement tool exposes `input.lines[*].counterparty_iban`, which is not redacted by
baseline because `counterparty_iban` is not in the baseline key list).

Order matters. If per-tool paths ran first, a tool that emits `input.password` would be
caught by `BASELINE_REDACT_KEYS` only on the second pass — but the second pass walks the
tree once for the registered paths, not for arbitrary keys. Running baseline first
guarantees no key-named secret ever survives the audit write.

Per-tool rules live in a module-scoped `Map<string, RedactionRules>` populated at tool
registration time. The map is also consumed by `@workspace/observability/logger` to
configure pino's `redact` paths — same rules, same dot-path syntax, same matcher. Logger
and audit cannot drift.

## Defense-in-depth note (Layer 1 caveat)

`GRANT app_admin TO app_user` (carried forward from lac's role topology) makes the catalog
REVOKE on `app_user` a no-op: `app_user` inherits everything `app_admin` can do. The Layer 1
defense exists for the day the inheritance is severed, but until then it is documentation.

Layer 2 (BEFORE triggers) is the actual enforcement. The trigger function uses
`pg_has_role(current_user, ...)` to identify the caller, raises `check_violation` on any
UPDATE or DELETE, and cannot be bypassed without dropping the trigger — an action that
itself requires schema ownership and shows up in `pg_event_trigger` audit if one is wired
later.

The implication for `withAdminBypass` is that even an admin path cannot DELETE audit rows:
the BEFORE trigger fires regardless of role. Admins who need to redact a specific row in
response to a privacy request must INSERT a corrective row with a `redaction_marker` payload
and link via `corrects_audit_id`. This convention is enforced by code review and the
`workspace-rls/single-audit-writer` ESLint rule which restricts who can write to
`tool_call_log`.

## Alternatives considered

- **Single unified `audit_log` with polymorphic payload.** Rejected: 6× row width inflation,
  weaker indexing, conflated retention, and the idempotency UNIQUE becomes a partial index
  conditional on `event_type = 'tool_call'`. Loses type clarity at the schema level.
- **No append-only triggers; rely solely on REVOKE.** Rejected: REVOKE is no-op under the
  GRANT chain. A bug or misconfiguration that removes the trigger function leaves Layer 1
  unsupported and a `DELETE FROM tool_call_log` from `withAdminBypass` would silently succeed.
- **Per-row payload encryption.** Considered. Rejected for v1: the redacted-jsonb model
  already removes PII, encryption adds key-management overhead, and decryption-on-read
  defeats the indexability of jsonb. Reconsider when a privacy-sensitive use case demands
  it (PHI, biometric data).
- **Event sourcing into Kafka / Redpanda.** Rejected for v1: adds a second source of truth,
  requires a stream-to-table sync for query, doubles compliance audit surface. PostgreSQL
  with append-only triggers is sufficient for the volume (estimated &lt; 10⁶ events/day per
  workspace at launch).
- **Single-pass redaction with a unified per-tool rule list.** Rejected: per-tool rule lists
  inevitably forget baseline keys, and baseline keys are most likely to be the source of a
  PII leak. Two passes guarantee defense-in-depth.

## Consequences

Positive:

- Type-clear schema; queries land on the right table without a discriminator filter.
- Idempotency replay is a simple `SELECT WHERE (organization_id, tool_name, idempotency_key)`.
- Tight per-table indexes (`(organization_id, created_at desc)` on `tool_call_log`).
- Redaction logic is shared with logging; no drift.
- Layer 2 triggers are the only honest enforcement; documenting the GRANT-chain caveat
  prevents future engineers from treating REVOKE as load-bearing.

Negative / trade-offs:

- Two tables to maintain (DDL, RLS policies, triggers, indexes) instead of one.
- Cross-table queries (e.g., "all audit events for user X across both types") require
  UNION ALL. Workspace dashboards must compose.
- Redaction registry must be populated at tool-module load. A tool that imports without
  calling `registerToolRedactions` silently uses baseline-only redaction. Mitigated by
  the `workspace-rls/single-audit-writer` ESLint rule (which fires when audit writes
  happen outside `packages/db/src/audit/`) and by a Section 3 pgTap test asserting every
  tool registered in the codebase has a redaction entry.

Follow-up work required:

- Section 3 testcontainer test: insert a tool_call_log row, attempt UPDATE — expect
  `check_violation`. Same for DELETE and TRUNCATE on both tables.
- Section 3 test: register a fake tool, write a row with `input.password = 'x'` and
  `input.iban = 'CZ...'`, assert baseline strips password but per-tool path keeps iban
  unless the tool registers it.
- Section 3 test: confirm two-pass order — registering a per-tool path on the same key as
  a baseline key cannot un-redact (baseline runs first; per-tool can only add redactions,
  not remove).
- ADR for retention policy: lifecycle on `tool_call_log` (10 years CZ statutory) and
  `audit_event` (likely shorter; needs Section 4 input).

## Code anchors

- `packages/db/src/audit/types.ts` — input/output shapes for both tables.
- `packages/db/src/audit/redact.ts` — two-pass implementation.
- `packages/db/src/audit/redaction-registry.ts` — per-tool registration API.
- `packages/db/src/audit/write-log.ts` — `writeToolCallLog`, `updateToolCallLogOutput`.
- `packages/db/src/audit/query.ts` — `listAuditTimeline`.
- `packages/db/migrations/0004_audit.sql` — table DDL + Layer 2 + Layer 3 triggers.
- `packages/db/migrations/0006_permissions_outbox.sql` — outbox triggers (sibling pattern).
- `packages/observability/src/redact-baseline.ts` — baseline keys + paths.
- `packages/observability/src/logger.ts` — pino redact configuration.

## See also

- ADR-0009 — ORM and migration style (governs how this schema is delivered).
- ADR-0010 — Multi-tenant RLS design (`tool_call_log` and `audit_event` both use the
  organization and workspace GUC contract).
- Future ADR-0014 — Audit retention and lifecycle (10-year statutory window).
