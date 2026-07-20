/**
 * Monetary (cash-book) posting (SINGLE_ENTRY §13b / TAX_RECORDS §7b ZDP).
 * Creates the shared posting header plus its posting_monetary_line classified
 * rows (§9). A single cash movement may need several rows (multiple categories,
 * base vs VAT, průběžné položky for own-account transfers) — pass them all. The
 * DB maintains monetary_period_summary in the same transaction and asserts the
 * posting has at least one line (a zaúčtování must record the money movement).
 *
 * For TAX_RECORDS the posting is a technical container, not a legal účetní zápis
 * (§7b ZDP). Run inside one withOrganization transaction.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { MonetaryInput, OrgCtx, PostedPosting } from "../types"
import { insertPostingHeader } from "./header"

export async function postMonetary(
  db: RowExecutor,
  ctx: OrgCtx,
  input: MonetaryInput,
): Promise<PostedPosting> {
  const postingId = await insertPostingHeader(db, ctx, {
    periodId: input.periodId,
    regimeCode: input.regime,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    postingKind:
      input.postingKind ?? (input.lines.length === 1 ? "SIMPLE" : "COMPOUND"),
    responsibleUserId: input.responsibleUserId,
    correctsPostingId: input.correctsPostingId,
    correctionType: input.correctionType,
    depreciationPlanId: input.depreciationPlanId,
    inventoryCountId: input.inventoryCountId,
    isOpening: input.isOpening,
    isClosing: input.isClosing,
  })

  const lineIds: string[] = []
  for (const line of input.lines) {
    // A tax-relevant, non-clearing row ALWAYS has a §7b/§9 daňový základ; default
    // it to the cash amount when the caller didn't give a distinct net base (the
    // neplátce case — cash amount IS the base). This keeps total_tax_base
    // authoritative so the přehledy / DPFO base is never guessed from gross cash.
    const isClearing = line.isClearing ?? false
    const taxBase =
      line.taxBase ?? (line.isTaxRelevant && !isClearing ? line.amount : null)
    const row = await one<{ id: string }>(
      db,
      sql`INSERT INTO posting_monetary_line
            (organization_id, posting_id, regime_code, partial_record_id, category_id,
             location, direction, is_tax_relevant, is_clearing, tax_base, amount, inbox_id)
          VALUES
            (${ctx.organizationId}::uuid, ${postingId}::uuid, ${input.regime}, ${line.partialRecordId ?? null}, ${line.categoryId ?? null},
             ${line.location}, ${line.direction}, ${line.isTaxRelevant}, ${isClearing}, ${taxBase}, ${line.amount}, ${ctx.inboxId ?? null})
          RETURNING id`,
    )
    lineIds.push(row.id)
  }

  return { postingId, lineIds }
}
