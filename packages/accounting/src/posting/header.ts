/**
 * Single home for the posting header INSERT, shared by the double-entry and
 * monetary posting engines, the period opening posting, corrections, and the
 * supporting generators. A new header column is added here once, not in five
 * places. Append-only (R8): the posting is never updated after insert.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { CorrectionType, OrgCtx, PostingKind, Regime } from "../types"

export interface PostingHeaderInput {
  periodId: string
  regimeCode: Regime
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  postingKind: PostingKind
  responsibleUserId: string
  correctsPostingId?: string | null
  correctionType?: CorrectionType | null
  depreciationPlanId?: string | null
  inventoryCountId?: string | null
  isOpening?: boolean
  isClosing?: boolean
}

/** Insert one posting header and return its id. */
export async function insertPostingHeader(
  db: RowExecutor,
  ctx: OrgCtx,
  h: PostingHeaderInput,
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO posting
          (organization_id, period_id, regime_code, summary_record_id, accounting_event_id,
           depreciation_plan_id, inventory_count_id, posting_date, posting_kind,
           responsible_user_id, posted_at, corrects_posting_id, correction_type, is_opening, is_closing, inbox_id)
        VALUES
          (${ctx.organizationId}::uuid, ${h.periodId}::uuid, ${h.regimeCode}, ${h.summaryRecordId}::uuid, ${h.accountingEventId}::uuid,
           ${h.depreciationPlanId ?? null}, ${h.inventoryCountId ?? null}, ${h.postingDate}::date, ${h.postingKind},
           ${h.responsibleUserId}::uuid, now(), ${h.correctsPostingId ?? null}, ${h.correctionType ?? null}, ${h.isOpening ?? false}, ${h.isClosing ?? false}, ${ctx.inboxId ?? null})
        RETURNING id`,
  )
  return r.id
}
