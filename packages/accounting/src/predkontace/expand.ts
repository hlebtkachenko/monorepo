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

/**
 * The amount bases a předkontace entry can post — `net`/`vat`/`gross` from the
 * partial, `self_assessed_vat` for reverse-charge/import self-assessment.
 * `expandPartialRecord` computes these in SQL (exact decimals); a DB-free
 * caller (the MD/D preview) computes them itself and passes them straight to
 * `expandScenarioEntries`.
 */
export interface PartialAmounts {
  net: Decimal
  vat: Decimal
  gross: Decimal
  self_assessed_vat: Decimal
}

function resolveScenario(s: PredkontaceScenario | string): PredkontaceScenario {
  return typeof s === "string" ? getScenario(s) : s
}

/** One scenario entry expanded against known amounts — account NUMBER (not yet
 * resolved to an `account_id`), so this is safe to compute with no DB access. */
export interface ScenarioLine {
  /** Account NUMBER, after `accountOverrides` — the caller resolves this to an `account_id`. */
  account: string
  side: DoubleEntryLineInput["side"]
  amount: Decimal
  description?: string
}

/**
 * Pure core of the předkontace expansion: turn one scenario's `entries` into
 * concrete lines given ALREADY-KNOWN amounts — no DB, no persisted read, no
 * side effects. `expandPartialRecord` calls this after reading the partial's
 * SQL-computed amounts (exact decimals) and resolving each line's account
 * NUMBER to the period's `account_id`. Anything that already has the amounts
 * in hand (e.g. a held-write MD/D PREVIEW, computed from the proposed
 * `input_json` before anything is posted) can call this directly and skip the
 * DB round-trip entirely — same scenario table, same entry→line mapping, zero
 * duplicated logic.
 */
export function expandScenarioEntries(
  scenario: PredkontaceScenario | string,
  amounts: PartialAmounts,
  opts?: {
    accountOverrides?: Record<string, string>
    extraAmounts?: Record<string, Decimal>
  },
): ScenarioLine[] {
  const s = resolveScenario(scenario)
  return s.entries.map((entry) => {
    const account = opts?.accountOverrides?.[entry.account] ?? entry.account
    const amount = SQL_BASES.has(entry.basis)
      ? amounts[entry.basis as keyof PartialAmounts]
      : opts?.extraAmounts?.[entry.basis]
    if (amount === undefined) {
      throw new Error(
        `accounting: předkontace "${s.id}" entry needs amount for basis "${entry.basis}" — pass it in extraAmounts`,
      )
    }
    return { account, side: entry.side, amount, description: entry.description }
  })
}

/** Expand a partial_record into double-entry lines using a předkontace scenario. */
export async function expandPartialRecord(
  db: RowExecutor,
  _ctx: OrgCtx,
  input: ExpandInput,
): Promise<DoubleEntryLineInput[]> {
  const scenario = resolveScenario(input.scenario)

  const row = await one<PartialAmounts & { vat_mode: string }>(
    db,
    // self_assessed_vat rounds to 2 dp — the §37 ZDPH VAT-rounding convention
    // (daň se zaokrouhluje na haléře / celé koruny); the numeric(19,4) column stores it exactly.
    sql`SELECT base_in_accounting_currency::text                                  AS net,
               vat_in_accounting_currency::text                                   AS vat,
               (base_in_accounting_currency + vat_in_accounting_currency)::text   AS gross,
               round(base_in_accounting_currency * COALESCE(vat_rate, 0) / 100, 2)::text AS self_assessed_vat,
               vat_mode
          FROM partial_record
         WHERE id = ${input.partialRecordId}::uuid`,
  )
  const { vat_mode, ...amounts } = row

  if (vat_mode !== scenario.vatMode) {
    throw new Error(
      `accounting: předkontace "${scenario.id}" is for vat_mode ${scenario.vatMode}, but partial_record ${input.partialRecordId} is ${vat_mode}`,
    )
  }

  const lines = expandScenarioEntries(scenario, amounts, {
    accountOverrides: input.accountOverrides,
    extraAmounts: input.extraAmounts,
  })
  const numbers = lines.map((line) => line.account)
  const accountIds = await resolveAccountIds(db, input.periodId, numbers)

  return lines.map((line) => ({
    accountId: accountIds.get(line.account) as string,
    side: line.side,
    amount: line.amount,
    partialRecordId: input.partialRecordId,
  }))
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
