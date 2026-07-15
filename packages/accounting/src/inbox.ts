/**
 * inbox_item provenance — mint one record per APPROVED gated write.
 *
 * At approve, `resolveHeldWrite` mints an `inbox_item` from the held
 * `tool_call_log` row and threads its id onto `OrgCtx.inboxId`, so every domain
 * row the replay INSERTs carries `inbox_id` = this item ("Created by Agent").
 *
 * WORKSPACE-scoped: it resolves under the enclosing `withOrganization` tx, which
 * also sets `app.workspace_id` (the same seam `unconfirmTemplateOnReject` /
 * `screenTemplateBasis` rely on). Minted ONLY on approve (a landed fact) — never
 * on reject/hold, which the tool_call_log already records. The
 * UNIQUE(workspace_id, tool_call_log_id) constraint makes a double-mint (a
 * hypothetical unguarded re-approve) fail closed rather than duplicate.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import type { OrgCtx } from "./types"

export interface MintInboxItemInput {
  /** The tool_call_log row (the held write) this landed from. */
  toolCallLogId: string
  /** The gated operation (tool_name). */
  kind: string
  /** Actor that authored the underlying write (tool_call_log.actor_kind). */
  createdBy: string
  /** How it was received (e.g. "agent"); free-form provenance note. */
  source?: string | null
  /** Denormalized counterparty label for the inbox list. */
  counterpartyName?: string | null
  /** The agent's rationale for the write. */
  reasoning?: string | null
}

/** Mint the provenance record and return its id (to stamp on the landed rows). */
export async function mintInboxItem(
  db: RowExecutor,
  ctx: OrgCtx,
  input: MintInboxItemInput,
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO inbox_item
          (workspace_id, tool_call_log_id, kind, source, counterparty_name, reasoning, created_by)
        VALUES
          (${ctx.workspaceId}::uuid, ${input.toolCallLogId}::uuid, ${input.kind},
           ${input.source ?? null}, ${input.counterpartyName ?? null}, ${input.reasoning ?? null}, ${input.createdBy})
        RETURNING id`,
  )
  return r.id
}
