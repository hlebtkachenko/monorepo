/**
 * Audit timeline query — listAuditTimeline.
 *
 * Returns one page of audit rows for the organization currently bound to the
 * transaction (RLS enforces the scope; the `organizationId` parameter is
 * an additional predicate for defence-in-depth, not trusted in isolation).
 *
 * `input_json` and `output_json` are intentionally NOT returned here; the
 * list view shows metadata only. The click-through drawer fetches them via
 * `getAuditDetail`.
 */
import { and, count, desc, eq, gte, ilike, lte } from "drizzle-orm"
import type { OrganizationBoundDb } from "../tenancy"
import { app_user } from "../schema/app_user"
import { tool_call_log } from "../schema/tool_call_log"
import type {
  ActorKind,
  AuditTimelineInput,
  AuditTimelineResult,
  AuditTimelineRow,
} from "./types"

export async function listAuditTimeline(
  tx: OrganizationBoundDb,
  input: AuditTimelineInput,
): Promise<AuditTimelineResult> {
  const { organizationId, filters = {}, pageIndex, pageSize } = input

  const whereClauses = [eq(tool_call_log.organization_id, organizationId)]

  if (filters.actorKind) {
    whereClauses.push(eq(tool_call_log.actor_kind, filters.actorKind))
  }
  if (filters.userId) {
    whereClauses.push(eq(tool_call_log.user_id, filters.userId))
  }
  if (filters.toolName) {
    whereClauses.push(ilike(tool_call_log.tool_name, `%${filters.toolName}%`))
  }
  if (filters.dateFrom) {
    whereClauses.push(gte(tool_call_log.created_at, new Date(filters.dateFrom)))
  }
  if (filters.dateTo) {
    whereClauses.push(lte(tool_call_log.created_at, new Date(filters.dateTo)))
  }

  const whereClause =
    whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses)

  const offset = Math.max(0, pageIndex) * Math.max(1, pageSize)

  const rows = await tx
    .select({
      id: tool_call_log.id,
      createdAt: tool_call_log.created_at,
      actorKind: tool_call_log.actor_kind,
      userName: app_user.name,
      toolName: tool_call_log.tool_name,
      conversationId: tool_call_log.conversation_id,
      confidence: tool_call_log.confidence,
      autoApplied: tool_call_log.auto_applied,
    })
    .from(tool_call_log)
    .leftJoin(app_user, eq(tool_call_log.user_id, app_user.id))
    .where(whereClause)
    .orderBy(desc(tool_call_log.created_at))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await tx
    .select({ count: count() })
    .from(tool_call_log)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0

  const mapped: AuditTimelineRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actorKind: r.actorKind as ActorKind,
    userName: r.userName ?? null,
    toolName: r.toolName,
    conversationId: r.conversationId ?? null,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    autoApplied: r.autoApplied,
  }))

  return { rows: mapped, total: Number(total) }
}
