import "server-only"

import { and, desc, eq, gte } from "drizzle-orm"

import { withAdminBypass, writeAuditEventGlobal } from "@workspace/db"
import { audit_event } from "@workspace/db/schema"

import { requireAdminSession } from "./admin-session"

/**
 * Input for `auditAdminAction`. The admin section + verb belong to the
 * `admin.<section>.<verb>` taxonomy (see plan §C9). `organizationId` is
 * optional — pass it when the action targets a specific tenant.
 */
export interface AuditAdminActionInput {
  action: string
  payload?: Record<string, unknown>
  organizationId?: string | null
}

/**
 * Coerce an audit payload to a plain, structured-cloneable object.
 *
 * Callers sometimes pass framework objects straight through (most commonly a
 * page's resolved Next `searchParams` as `{ filters: params }`). Those are NOT
 * structured-cloneable, and the audit redaction step (`applyBaselineKeyRedactions`
 * → `structuredClone`) throws `DataCloneError` on them. A JSON round-trip drops
 * functions/undefined and stringifies Dates + bigints, leaving a plain object
 * the redactor can walk. Best-effort: on any failure return `{}` so a weird
 * payload can never break the (fire-and-forget) audit write.
 */
function toPlainPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return JSON.parse(
      JSON.stringify(payload, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Write an admin audit row tied to the current staff session. Pulls
 * `actorUserId` + `workspaceId` from `requireAdminSession()` so callers only
 * declare the verb + payload.
 *
 * Fire-and-forget semantics: this never throws to the caller. A failed
 * audit write is logged via `console.error` (pino wiring lands in a later
 * milestone) but must NOT block the originating action.
 */
export async function auditAdminAction(
  input: AuditAdminActionInput,
): Promise<void> {
  try {
    const ctx = await requireAdminSession()
    await writeAuditEventGlobal({
      workspaceId: ctx.workspaceId,
      organizationId: input.organizationId ?? undefined,
      actorUserId: ctx.userId,
      action: input.action,
      payload: toPlainPayload(input.payload ?? {}),
    })
  } catch (err) {
    console.error("auditAdminAction: failed to write audit_event", err)
  }
}

const DEFAULT_DEBOUNCE_MS = 5_000

/**
 * Debounced variant of `auditAdminAction` for frequently-emitted
 * `admin.*.viewed` / `admin.search.queried` events.
 *
 * The previous cookie-based debounce was removed (Next 16 forbids cookie
 * writes from Server Components). The cookieless replacement queries the
 * most recent `audit_event` row with the same `(actor_user_id, action)`
 * within `ttlMs`. If one exists, this call is a no-op — the call site can
 * keep its naive fire-and-forget shape while the DB stops accumulating
 * burst-rate duplicates.
 *
 * The signature is preserved so existing call sites (`auditOnce("action",
 * 5_000, ...)`) keep working without edits.
 */
export async function auditOnce(
  action: string,
  ttlMs: number = DEFAULT_DEBOUNCE_MS,
  payload: Record<string, unknown> = {},
  organizationId: string | null = null,
): Promise<void> {
  try {
    const ctx = await requireAdminSession()
    const effectiveTtl = ttlMs > 0 ? ttlMs : DEFAULT_DEBOUNCE_MS
    const since = new Date(Date.now() - effectiveTtl)
    const recent = await withAdminBypass((db) =>
      db
        .select({ id: audit_event.id })
        .from(audit_event)
        .where(
          and(
            eq(audit_event.actor_user_id, ctx.userId),
            eq(audit_event.action, action),
            gte(audit_event.created_at, since),
          ),
        )
        .orderBy(desc(audit_event.created_at))
        .limit(1),
    )
    if (recent.length > 0) return
    await writeAuditEventGlobal({
      workspaceId: ctx.workspaceId,
      organizationId: organizationId ?? undefined,
      actorUserId: ctx.userId,
      action,
      payload: toPlainPayload(payload),
    })
  } catch (err) {
    console.error("auditOnce: failed to write audit_event", err)
  }
}
