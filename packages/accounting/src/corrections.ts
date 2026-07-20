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
 *
 * The reversal PROPAGATES the original's `is_opening` / `is_closing` tags: a
 * storno of a 701 opening is itself opening-natured and a storno of a 702
 * balance-close is closing-natured, so the read-model maintain trigger (0071)
 * treats each reversal line the same way it treated the original — the 701 storno
 * nets `opening_balance` back to zero (not into turnover), and the 702 storno
 * stays read-model-neutral. Without this the period-reopen cascade would leave a
 * non-zero opening_balance in N+1 (blocking a re-close) and corrupt N's konečné
 * stavy. For every ordinary posting both flags are false, so propagation is a
 * no-op there.
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
    is_opening: boolean
    is_closing: boolean
  }>(
    db,
    sql`SELECT regime_code, period_id, summary_record_id, accounting_event_id, is_opening, is_closing
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
    isOpening: orig.is_opening,
    isClosing: orig.is_closing,
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
