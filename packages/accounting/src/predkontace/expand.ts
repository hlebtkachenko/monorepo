/**
 * Předkontace expansion + posting. Turns one captured partial_record into the
 * balanced MD/Dal lines of a double-entry posting by applying a scenario:
 *
 *   1. read the partial's účetní-měna amounts (net / vat / gross /
 *      self_assessed_vat) computed IN SQL — exact decimals, zero JS arithmetic;
 *   2. check the scenario's vat_mode matches the partial's vat_mode;
 *   3. resolve every entry's account NUMBER (after overrides) to the period's
 *      account_id (D8, fail-loud on a missing account);
 *   4. emit DoubleEntryLineInput[] tagged with the source partial_record_id.
 *
 * The koeficient ξ / reverse-charge self-assessment is the `self_assessed_vat`
 * basis — base × vat_rate computed at posting, never persisted on the doc.
 * Double-entry only (the monetary regimes classify into the peněžní deník, not
 * via předkontace).
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import { resolveAccountIds } from "../accounts"
import { postDoubleEntry } from "../posting/double-entry"
import type {
  CorrectionType,
  Decimal,
  DoubleEntryLineInput,
  OrgCtx,
  PostedPosting,
} from "../types"
import { getScenario } from "./catalogue"
import type { PredkontaceScenario } from "./types"

const SQL_BASES = new Set(["net", "vat", "gross", "self_assessed_vat"])

export interface ExpandInput {
  partialRecordId: string
  periodId: string
  scenario: PredkontaceScenario | string
  /** Template account number → the tenant chart's actual number (analytics). */
  accountOverrides?: Record<string, string>
  /** Amounts for bases not derivable from the partial (cost of goods, ZC, …). */
  extraAmounts?: Record<string, Decimal>
}

interface PartialAmounts {
  net: Decimal
  vat: Decimal
  gross: Decimal
  self_assessed_vat: Decimal
  vat_mode: string
}

function resolveScenario(s: PredkontaceScenario | string): PredkontaceScenario {
  return typeof s === "string" ? getScenario(s) : s
}

/** Expand a partial_record into double-entry lines using a předkontace scenario. */
export async function expandPartialRecord(
  db: RowExecutor,
  _ctx: OrgCtx,
  input: ExpandInput,
): Promise<DoubleEntryLineInput[]> {
  const scenario = resolveScenario(input.scenario)

  const amounts = await one<PartialAmounts>(
    db,
    sql`SELECT base_in_accounting_currency::text                                  AS net,
               vat_in_accounting_currency::text                                   AS vat,
               (base_in_accounting_currency + vat_in_accounting_currency)::text   AS gross,
               round(base_in_accounting_currency * COALESCE(vat_rate, 0) / 100, 2)::text AS self_assessed_vat,
               vat_mode
          FROM partial_record
         WHERE id = ${input.partialRecordId}::uuid`,
  )

  if (amounts.vat_mode !== scenario.vatMode) {
    throw new Error(
      `accounting: předkontace "${scenario.id}" is for vat_mode ${scenario.vatMode}, but partial_record ${input.partialRecordId} is ${amounts.vat_mode}`,
    )
  }

  const numbers = scenario.entries.map(
    (e) => input.accountOverrides?.[e.account] ?? e.account,
  )
  const accountIds = await resolveAccountIds(db, input.periodId, numbers)

  return scenario.entries.map((entry, i) => {
    const number = numbers[i] as string
    const accountId = accountIds.get(number) as string
    const amount = SQL_BASES.has(entry.basis)
      ? amounts[entry.basis as keyof PartialAmounts]
      : input.extraAmounts?.[entry.basis]
    if (amount === undefined) {
      throw new Error(
        `accounting: předkontace "${scenario.id}" entry needs amount for basis "${entry.basis}" — pass it in extraAmounts`,
      )
    }
    return {
      accountId,
      side: entry.side,
      amount: amount as Decimal,
      partialRecordId: input.partialRecordId,
    }
  })
}

export interface PostFromPredkontaceInput extends ExpandInput {
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
  correctsPostingId?: string | null
  correctionType?: CorrectionType | null
}

/**
 * Expand a partial_record via předkontace and post it as one double-entry
 * posting. The DB asserts the result balances (R4) at COMMIT.
 */
export async function postFromPredkontace(
  db: RowExecutor,
  ctx: OrgCtx,
  input: PostFromPredkontaceInput,
): Promise<PostedPosting> {
  const lines = await expandPartialRecord(db, ctx, input)
  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    correctsPostingId: input.correctsPostingId,
    correctionType: input.correctionType,
    lines,
  })
}
