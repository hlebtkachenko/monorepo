/**
 * Double-entry posting (DOUBLE_ENTRY §13). Creates the shared posting header
 * plus its posting_double_entry_line Má dáti / Dal rows. The DB enforces balance
 * + non-empty (R4) via a DEFERRABLE constraint trigger at COMMIT, and maintains
 * account_period_balance in the same transaction, so the caller must run this
 * inside one withOrganization transaction. amount may be negative (storno on the
 * original sides, ČÚS 001).
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { DoubleEntryInput, OrgCtx, PostedPosting } from "../types"
import { insertPostingHeader } from "./header"

export async function postDoubleEntry(
  db: RowExecutor,
  ctx: OrgCtx,
  input: DoubleEntryInput,
): Promise<PostedPosting> {
  const postingId = await insertPostingHeader(db, ctx, {
    periodId: input.periodId,
    regimeCode: "DOUBLE_ENTRY",
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    postingKind:
      input.postingKind ?? (input.lines.length === 2 ? "SIMPLE" : "COMPOUND"),
    responsibleUserId: input.responsibleUserId,
    correctsPostingId: input.correctsPostingId,
    correctionType: input.correctionType,
    depreciationPlanId: input.depreciationPlanId,
    inventoryCountId: input.inventoryCountId,
    isOpening: input.isOpening,
  })

  const lineIds: string[] = []
  for (const line of input.lines) {
    const row = await one<{ id: string }>(
      db,
      sql`INSERT INTO posting_double_entry_line
            (organization_id, posting_id, period_id, regime_code, account_id, partial_record_id, side, amount, inbox_id)
          VALUES
            (${ctx.organizationId}::uuid, ${postingId}::uuid, ${input.periodId}::uuid, 'DOUBLE_ENTRY',
             ${line.accountId}::uuid, ${line.partialRecordId ?? null}, ${line.side}, ${line.amount}, ${ctx.inboxId ?? null})
          RETURNING id`,
    )
    lineIds.push(row.id)
  }

  return { postingId, lineIds }
}
