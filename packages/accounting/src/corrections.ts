/**
 * Corrections (R8, ČÚS 001 §35). Posted records are never edited or deleted (the
 * DB blocks UPDATE/DELETE); a correction is a NEW posting linked to the original
 * via corrects_posting_id. A REVERSAL (úplné storno) reverses the original with
 * NEGATIVE amounts on the same sides — the červené-storno convention — and must
 * be posted into an OPEN period (the DB rejects a closed-period posting). The
 * original stays visible; the read-model self-corrects (negated turnover). A
 * SUPPLEMENTARY (doplňkový) correction is just a normal post() with
 * correctsPostingId + correctionType set.
 *
 * The reversal posts into the ORIGINAL's period (the common case — an error
 * found while the period is still open). Reversing into a different period would
 * require by-number account re-resolution and is a follow-up.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import type { OrgCtx, Regime } from "./types"
import { insertPostingHeader } from "./posting/header"

export interface ReverseInput {
  /** The posted record being reversed. */
  originalPostingId: string
  postingDate: string
  responsibleUserId: string
}

/**
 * Úplné storno: fully reverse a posted record as a new linked posting with
 * negated lines (same accounts / sides / classification, negative amounts).
 * Reverses both DOUBLE_ENTRY and monetary postings.
 */
export async function reverse(
  db: RowExecutor,
  ctx: OrgCtx,
  input: ReverseInput,
): Promise<{ postingId: string }> {
  const orig = await one<{
    regime_code: Regime
    period_id: string
    summary_record_id: string
    accounting_event_id: string
  }>(
    db,
    sql`SELECT regime_code, period_id, summary_record_id, accounting_event_id
          FROM posting WHERE id = ${input.originalPostingId}::uuid`,
  )

  const postingId = await insertPostingHeader(db, ctx, {
    periodId: orig.period_id,
    regimeCode: orig.regime_code,
    summaryRecordId: orig.summary_record_id,
    accountingEventId: orig.accounting_event_id,
    postingDate: input.postingDate,
    postingKind: "COMPOUND",
    responsibleUserId: input.responsibleUserId,
    correctsPostingId: input.originalPostingId,
    correctionType: "REVERSAL",
  })

  if (orig.regime_code === "DOUBLE_ENTRY") {
    await db.execute(sql`
      INSERT INTO posting_double_entry_line
        (organization_id, posting_id, period_id, regime_code, account_id, partial_record_id, side, amount)
      SELECT organization_id, ${postingId}::uuid, period_id, regime_code, account_id, partial_record_id, side, -amount
        FROM posting_double_entry_line WHERE posting_id = ${input.originalPostingId}::uuid`)
  } else {
    await db.execute(sql`
      INSERT INTO posting_monetary_line
        (organization_id, posting_id, regime_code, partial_record_id, category_id, location, direction, is_tax_relevant, is_clearing, tax_base, amount)
      SELECT organization_id, ${postingId}::uuid, regime_code, partial_record_id, category_id, location, direction, is_tax_relevant, is_clearing,
             CASE WHEN tax_base IS NULL THEN NULL ELSE -tax_base END, -amount
        FROM posting_monetary_line WHERE posting_id = ${input.originalPostingId}::uuid`)
  }

  return { postingId }
}
