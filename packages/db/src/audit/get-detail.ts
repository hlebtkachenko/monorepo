/**
 * Single audit-row detail fetch for the click-through drawer.
 *
 * Returns the full row including `input_json` and `output_json`. Redaction
 * was applied at write time (`redactForAudit` per tool + baseline paths), so
 * the values stored here are already-masked payloads. The drawer renders as-is.
 *
 * RLS scopes the row to the organization via the bound transaction; the
 * `organizationId` predicate is defence-in-depth.
 */
import { and, eq } from "drizzle-orm"
import type { OrganizationBoundDb } from "../tenancy"
import { app_user } from "../schema/app_user"
import { tool_call_log } from "../schema/tool_call_log"
import type { ActorKind } from "./types"

export interface AuditDetail {
  id: string
  createdAt: string
  actorKind: ActorKind
  userName: string | null
  toolName: string
  idempotencyKey: string
  conversationId: string | null
  confidence: number | null
  autoApplied: boolean
  rationale: string | null
  inputJson: unknown
  outputJson: unknown
}

export async function getAuditDetail(
  tx: OrganizationBoundDb,
  input: { organizationId: string; id: string },
): Promise<AuditDetail | null> {
  const rows = await tx
    .select({
      id: tool_call_log.id,
      createdAt: tool_call_log.created_at,
      actorKind: tool_call_log.actor_kind,
      userName: app_user.name,
      toolName: tool_call_log.tool_name,
      idempotencyKey: tool_call_log.idempotency_key,
      conversationId: tool_call_log.conversation_id,
      confidence: tool_call_log.confidence,
      autoApplied: tool_call_log.auto_applied,
      rationale: tool_call_log.rationale,
      inputJson: tool_call_log.input_json,
      outputJson: tool_call_log.output_json,
    })
    .from(tool_call_log)
    .leftJoin(app_user, eq(tool_call_log.user_id, app_user.id))
    .where(
      and(
        eq(tool_call_log.organization_id, input.organizationId),
        eq(tool_call_log.id, input.id),
      ),
    )
    .limit(1)

  const r = rows[0]
  if (!r) return null

  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actorKind: r.actorKind as ActorKind,
    userName: r.userName ?? null,
    toolName: r.toolName,
    idempotencyKey: r.idempotencyKey,
    conversationId: r.conversationId ?? null,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    autoApplied: r.autoApplied,
    rationale: r.rationale ?? null,
    inputJson: r.inputJson,
    outputJson: r.outputJson ?? null,
  }
}
