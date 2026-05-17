# 14. Audit retention and lifecycle

- Status: Proposed
- Date: 2026-05-11
- Deciders: Hleb Tkachenko

## Context and Problem Statement

ADR-0011 established two append-only audit tables: `tool_call_log` (AI tool invocations) and
`audit_event` (workspace-tier human and system events). Neither ADR-0011 nor any subsequent
decision addressed how long rows must be retained, when and how rows may be removed, and how
to avoid unbounded table growth.

Czech statutory law sets the minimum retention floor for accounting records. The tables carry
two distinct legal categories: `tool_call_log` stores the structured evidence of AI-driven
accounting mutations (journal entries, invoice imports, reconciliations) and is subject to the
same 10-year floor as the underlying accounting documents. `audit_event` records operational
events (logins, role grants, BYPASSRLS use, configuration changes) that are not themselves
accounting records; the statutory floor for these is less clear and is likely shorter.

Privacy is a cross-cutting constraint: both tables are already write-time-redacted per
ADR-0011 (two-pass redaction via `@workspace/observability/redact-baseline` and the per-tool
redaction registry). Subsequent access via `withAdminBypass` itself leaves an `audit_event`
trail. Hard deletion of any row requires a documented ceremony rather than an automated purge,
because the row is evidence: its absence after a delete is itself a gap in the audit chain.

## Decision

Retain both tables indefinitely in v1 with no automatic purge. Enforce a soft row-count
warning (not a hard cap) via a scheduled health check at 10 million rows per table. Defer
partitioning and archival offload to the first compliance audit or when the row-count warning
fires in production.

Specific retention minimums, enforced by policy and not by automation in v1:

- `tool_call_log`: 10 years from `created_at`. Czech accounting law (zakon 563/1991 Sb., §31)
  requires accounting records to be retained for 10 years from the end of the accounting
  period in which the event occurred. AI tool calls that generate journal entries are
  accounting records for the purpose of this requirement.
- `audit_event`: 5 years from `created_at`. Operational events (login, role grant) are not
  accounting records under §31 but may be required for GDPR data-subject requests (Art. 17
  GDPR exemption for legal obligation) and for incident post-mortem. 5 years is a conservative
  estimate; this will be reviewed against Czech GDPR guidance at the first compliance audit.

Hard delete of any row in either table requires:

1. A written justification filed in the company's compliance record.
2. A regulatory body sign-off or legal counsel opinion that the record is no longer required.
3. Execution only via `withAdminBypass` by a named administrator, which itself writes an
   `audit_event` row recording the deletion.

No automatic purge runs in v1. The append-only triggers (ADR-0011, Layer 2) physically
prevent DELETE from any application code path; only explicit `withAdminBypass` can bypass the
trigger, and only via the ceremony above.

## Consequences

Positive:

- Zero operational risk of accidental purge in v1.
- Compliance-by-default: rows accumulate and are never silently dropped.
- No new infrastructure required for v1 (no pg_partman, no S3 archival, no lifecycle Lambda).

Negative / trade-offs:

- Tables grow indefinitely. Estimated volume at launch is below 10^6 rows/day per workspace,
  but this compounds. At 10^6 rows/day, `tool_call_log` hits 10 million rows in 10 days for a
  single busy workspace. The soft-cap warning is the only signal before storage pressure.
- pg_dump and VACUUM costs increase linearly. No mitigation in v1.
- `audit_event` has no per-row expiry mechanism. A 5-year old login event sits in the same
  heap as a yesterday's row. Partition pruning (future work) would isolate old data.

Follow-up work required:

- Implement a scheduled health-check query that counts rows in both tables and emits a
  warning metric when either crosses 10 million rows.
- Evaluate pg_partman range partitioning by month on `created_at` at the first compliance
  audit (or earlier if the soft-cap warning fires).
- Evaluate streaming old rows to S3 Parquet via pg_partman detach + COPY. The AWS layer
  (ADR-0007) is bootstrapped, so this is unblocked.
- Formalize the hard-delete ceremony in a runbook under `docs/runbooks/`.

## Alternatives considered

- **Append-only forever with no warning.** Rejected: table bloat becomes a production
  incident without advance notice. The soft-cap warning is lightweight insurance.
- **Automatic hard cutoff by date.** Rejected: automatic purge of accounting records
  without per-row review violates the compliance intent. Even after the statutory minimum
  has elapsed, a row may still be relevant to an ongoing dispute or audit.
- **Stream to S3 archival immediately.** Deferred: adding S3 archival before audit volume
  justifies it introduces more failure modes than it solves. The AWS layer (ADR-0007) is
  bootstrapped, so this is now unblocked — revisit in Section 5 or at the first soft-cap
  warning.
- **pg_partman by month, drop old partitions.** Deferred: partition DDL changes require
  careful migration sequencing and testing. Premature for v1; the schema is not yet under
  production load. Revisit at first compliance audit or soft-cap warning.
- **Per-row TTL via a background worker.** Rejected: a background worker that issues DELETE
  bypasses the append-only trigger enforcement unless it also goes through `withAdminBypass`,
  at which point it is indistinguishable from the hard-delete ceremony. Adds code for no
  benefit in v1.

## See also

- ADR-0011: Audit log design (two-table append-only, two-pass redaction).
- ADR-0007: MVP single-account CDK deployment (AWS bootstrap prerequisite for S3 archival).
- `packages/db/migrations/0004_audit.sql`: DDL for both audit tables.
- Czech law: zakon 563/1991 Sb. (Zakon o ucetnictvi), §31 (archivace ucetnich zaznamu).
- GDPR Art. 17(3)(b): right to erasure exemption for legal obligations.
