/**
 * Confident-wrong circuit-breaker seams (constitution §I8).
 *
 * Three workspace-scoped operations on `brain_confident_wrong`:
 *
 *   1. `readConfidentWrongCount` — the write gate reads this at run entry
 *      (`runGatedWrite`). FAIL-CLOSED: a count > 0 halts the lane, and any
 *      failure reading it must ALSO halt (the caller treats a throw as a refuse).
 *   2. `recordConfidentWrong` — the INCREMENT seam. Called from the human review
 *      surface when a reviewer confirms a previously AUTO-APPLIED booking was
 *      confidently wrong. GUARDED: it refuses unless the target `tool_call_log`
 *      row was `auto_applied = true` — a held / rejected write never applied, so
 *      it can NEVER be a confident-wrong. DORMANT until post-M3 auto-apply exists.
 *   3. `resetConfidentWrongCount` — the human-only RESET. An OPERATOR/ADMIN
 *      action after investigation; deliberately NOT an org-member self-service
 *      path (see the migration header). Zeroes the counter and stamps who/when.
 *
 * All three run inside a `withOrganization` frame: `brain_confident_wrong` is
 * WORKSPACE-scoped (ADR-0029), and `withOrganization` sets `app.workspace_id`
 * (derived from the org row), so RLS resolves to the caller's workspace and the
 * writes carry the GUC workspace_id (RLS WITH CHECK passes). The human-only
 * property of increment/reset is the tool/API surface (I5), never these grants:
 * an agent runs as `app_user` too, but has no tool and no raw SQL that reaches
 * this table.
 */
import { sql } from "drizzle-orm"
import { executeRows, type OrganizationBoundDb } from "../tenancy"

/**
 * Read the workspace's confident-wrong count for the circuit breaker.
 *
 * FAIL-CLOSED contract:
 *   - no row for the workspace  → 0 (a workspace that has never had an incident);
 *   - a row with count 0        → 0 (a cleared breaker);
 *   - a row with count > 0      → that count (breaker is OPEN — caller refuses);
 *   - a corrupt / non-integer / negative value → THROW (caller refuses).
 *
 * The read is RLS-scoped on `app.workspace_id` (the GUC `withOrganization` set),
 * so it can only ever see the caller's workspace row.
 */
export async function readConfidentWrongCount(
  db: OrganizationBoundDb,
): Promise<number> {
  const rows = await executeRows<{ confident_wrong_count: number | string }>(
    db,
    sql`SELECT confident_wrong_count
        FROM brain_confident_wrong
        WHERE workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid`,
  )
  const row = rows[0]
  if (!row) return 0
  const raw = row.confident_wrong_count
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    // A value we cannot trust is treated as a tripped breaker: fail closed.
    throw new Error(
      "brain_confident_wrong: confident_wrong_count is unreadable or corrupt",
    )
  }
  return n
}

export interface RecordConfidentWrongInput {
  /** The AUTO-APPLIED `tool_call_log` row a human marked confidently wrong. */
  toolCallLogId: string
  /** The reviewer who marked it wrong (provenance). */
  actorUserId: string
  /** Optional free-text note for the investigation. */
  note?: string | null
}

/**
 * Increment the workspace's confident-wrong counter — the seam a human review
 * action calls when it confirms a previously AUTO-APPLIED booking was
 * confidently wrong. This is what TRIPS the breaker.
 *
 * GUARD (the load-bearing safety property): it refuses unless the target
 * `tool_call_log` row was `auto_applied = true`. A held or rejected write never
 * reached the ledger, so it can never be a confident-wrong — only a write that
 * the gate AUTO-APPLIED (read green, applied without a human) can. At cold start
 * green is unreachable, so no row is ever `auto_applied` and this seam can never
 * fire — it is DORMANT by construction until post-M3 auto-apply.
 *
 * `tool_call_log` is org-scoped; the read is RLS-scoped on `app.organization_id`
 * (the same tx's GUC). The upsert writes `workspace_id` from `app.workspace_id`,
 * so RLS WITH CHECK passes and the row is the caller's workspace.
 */
export async function recordConfidentWrong(
  db: OrganizationBoundDb,
  input: RecordConfidentWrongInput,
): Promise<void> {
  const rows = await executeRows<{ auto_applied: boolean }>(
    db,
    sql`SELECT auto_applied
        FROM tool_call_log
        WHERE id = ${input.toolCallLogId}::uuid`,
  )
  const row = rows[0]
  if (!row) {
    throw new Error("recordConfidentWrong: tool_call_log row not found")
  }
  if (row.auto_applied !== true) {
    // A held / rejected write never applied — it cannot be a confident-wrong.
    throw new Error(
      "recordConfidentWrong: only an AUTO-APPLIED write can be a confident-wrong; " +
        "this write was held or never applied",
    )
  }

  await db.execute(sql`
    INSERT INTO brain_confident_wrong (
      workspace_id, confident_wrong_count, last_incident_at,
      last_incident_tool_call_log_id, last_incident_note
    )
    VALUES (
      NULLIF(current_setting('app.workspace_id', true), '')::uuid, 1, now(),
      ${input.toolCallLogId}::uuid, ${input.note ?? null}
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
      confident_wrong_count = brain_confident_wrong.confident_wrong_count + 1,
      last_incident_at = now(),
      last_incident_tool_call_log_id = EXCLUDED.last_incident_tool_call_log_id,
      last_incident_note = EXCLUDED.last_incident_note,
      updated_at = now()
  `)
}

export interface ResetConfidentWrongInput {
  /** The operator/admin who cleared the breaker (provenance). */
  actorUserId: string
  /** Optional note recording the investigation outcome. */
  note?: string | null
}

/**
 * Reset the workspace's confident-wrong counter to 0 — the human-only breaker
 * clear. An OPERATOR/ADMIN action taken AFTER investigation (add an infra signal
 * / eval case, tighten calibration, per §I8). NOT an org-member self-service
 * path. Zeroes the count and stamps `cleared_at` / `cleared_by_user_id`; leaves
 * the `last_incident_*` provenance intact for the audit trail. A no-op if the
 * workspace has no row (nothing to clear).
 */
export async function resetConfidentWrongCount(
  db: OrganizationBoundDb,
  input: ResetConfidentWrongInput,
): Promise<void> {
  await db.execute(sql`
    UPDATE brain_confident_wrong
    SET confident_wrong_count = 0,
        cleared_at = now(),
        cleared_by_user_id = ${input.actorUserId}::uuid,
        cleared_note = ${input.note ?? null},
        updated_at = now()
    WHERE workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  `)
}
