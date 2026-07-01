/**
 * Podklad pro DPPO — daň z příjmů právnických osob (corporate income tax),
 * Act 586/1992 Sb. (ZDP). Derives the tax base from the ACCOUNTING result and
 * the statutory adjustments, then the tax:
 *
 *   účetní výsledek (§23/2 — from the closed books: výnosy − náklady)
 *     + daňově neuznatelné náklady (§25 — reprezentace 513, penále 545/544,
 *       manka nad limit, účetní odpisy nad daňové, …)
 *     − příjmy nezahrnované / osvobozené (§18a nevýdělečné, §19/§19b dary,
 *       §23/4 already-taxed, …)
 *   = základ daně (§23/1); if < 0 → daňová ztráta (base 0, §34 carry-forward)
 *     − odpočet daňové ztráty minulých let (§34/1 — max 5 období, up to the base)
 *   → základ zaokrouhlený na celé tisícikoruny DOLŮ (§21)
 *   → daň = základ × sazba (21 % od 2024; 19 % do 2023, §21/1), na celé Kč NAHORU
 *   − slevy (§35) − zaplacené zálohy = doplatek/přeplatek
 *
 * A veřejně prospěšný poplatník (§17a, e.g. spolek) is handled via
 * `excludeLossMakingMainActivity`: under §18a/1 the result of a loss-making
 * hlavní (non-business) činnost is NOT subject to tax, so it is removed from the
 * base (this is why a donation-funded nonprofit — a spolek — lands at base 0).
 *
 * §38a zálohy for the NEXT období are computed separately from the poslední známá
 * daňová povinnost by `computeIncomeTaxAdvances` (not part of the current return —
 * they schedule the next period's prepayments).
 *
 * All money arithmetic is in SQL (R13). Period-scoped; reads the read-model.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface DppoInput {
  /** Daňově neuznatelné náklady per §25 (added back to the base). */
  nonDeductibleExpenses?: Decimal
  /** Osvobozené / nezahrnované výnosy per §18a/§19 (removed from the base). */
  exemptRevenue?: Decimal
  /**
   * §18a/1: for a veřejně prospěšný poplatník, remove the result of a
   * loss-making hlavní činnost from the base (pass its accounting result here —
   * positive = loss amount to remove). Typically the whole accounting loss.
   */
  excludeLossMakingMainActivity?: Decimal
  /**
   * §34/1 daňová ztráta minulých let available to deduct. Applied AFTER the
   * §23/1 base, capped at the (non-negative) base — never turns a profit into a
   * loss. Defaults 0.
   */
  lossCarryForward?: Decimal
  /** Sazba daně (default 0.21 — 21 % from 2024). Use 0.19 for periods ≤ 2023. */
  taxRate?: Decimal
  /** Slevy na dani §35 (deducted from the computed tax). */
  taxReliefs?: Decimal
  /** Zaplacené zálohy na daň (§38a). */
  advancesPaid?: Decimal
}

export interface Dppo {
  type: "CORPORATE_INCOME_TAX"
  ucetni_vysledek: Decimal
  nedanove_naklady: Decimal
  osvobozene_vynosy: Decimal
  /** základ daně §23/1 (before the §34 loss deduction). */
  zaklad_dane: Decimal
  /** odpočet daňové ztráty minulých let §34 (applied, ≤ zaklad_dane). */
  odpocet_ztraty: Decimal
  zaklad_zaokrouhleny: Decimal
  sazba: Decimal
  dan: Decimal
  slevy: Decimal
  dan_po_slevach: Decimal
  zalohy: Decimal
  doplatek: Decimal
}

export async function buildDppo(
  db: RowExecutor,
  periodId: string,
  input: DppoInput = {},
): Promise<Dppo> {
  const rate = input.taxRate ?? "0.21"
  const nonDeductible = input.nonDeductibleExpenses ?? "0"
  const exempt = input.exemptRevenue ?? "0"
  const excludeLoss = input.excludeLossMakingMainActivity ?? "0"
  const lossCF = input.lossCarryForward ?? "0"
  const reliefs = input.taxReliefs ?? "0"
  const advances = input.advancesPaid ?? "0"

  const r = await one<Omit<Dppo, "type">>(
    db,
    sql`
      WITH result AS (
        -- účetní výsledek = Σ výnosy − Σ náklady, from the read-model closing balances
        SELECT
          COALESCE(SUM(-b.closing_balance) FILTER (WHERE a.nature = 'REVENUE'), 0)::numeric AS vynosy,
          COALESCE(SUM( b.closing_balance) FILTER (WHERE a.nature = 'EXPENSE'), 0)::numeric AS naklady
          FROM account_period_balance b
          JOIN account a ON a.id = b.account_id
         WHERE b.period_id = ${periodId}::uuid
      ),
      base AS (
        SELECT (vynosy - naklady)::numeric                                          AS ucetni_vysledek,
               ${nonDeductible}::numeric                                            AS nedanove,
               ${exempt}::numeric                                                   AS osvobozene,
               ${excludeLoss}::numeric                                              AS exclude_loss
          FROM result
      ),
      zd AS (
        SELECT ucetni_vysledek, nedanove, osvobozene,
               (ucetni_vysledek + nedanove - osvobozene + exclude_loss)::numeric    AS zaklad
          FROM base
      ),
      ztrata AS (
        SELECT ucetni_vysledek, nedanove, osvobozene, zaklad,
               -- §34: deduct prior-year loss, capped at the non-negative base
               LEAST(${lossCF}::numeric, GREATEST(zaklad, 0))::numeric              AS odpocet_ztraty
          FROM zd
      ),
      final AS (
        SELECT ucetni_vysledek, nedanove, osvobozene, zaklad, odpocet_ztraty,
               (GREATEST(zaklad, 0) - odpocet_ztraty)::numeric                      AS zaklad_po_ztrate
          FROM ztrata
      ),
      tax AS (
        SELECT ucetni_vysledek, nedanove, osvobozene, zaklad, odpocet_ztraty,
               -- základ po odpočtu ztráty, zaokrouhlený na celé tisícikoruny dolů (§21)
               (floor(GREATEST(zaklad_po_ztrate, 0) / 1000) * 1000)::numeric        AS zaklad_zaokr,
               -- daň: základ_zaokr × sazba, na celé Kč nahoru
               ceil(floor(GREATEST(zaklad_po_ztrate, 0) / 1000) * 1000 * ${rate}::numeric)::numeric AS dan
          FROM final
      ),
      slevy AS (
        SELECT ucetni_vysledek, nedanove, osvobozene, zaklad, odpocet_ztraty, zaklad_zaokr, dan,
               GREATEST(dan - ${reliefs}::numeric, 0)::numeric                      AS dan_po_slevach
          FROM tax
      )
      SELECT
        ucetni_vysledek::numeric(19,4)                                              AS ucetni_vysledek,
        nedanove::numeric(19,4)                                                     AS nedanove_naklady,
        osvobozene::numeric(19,4)                                                   AS osvobozene_vynosy,
        zaklad::numeric(19,4)                                                       AS zaklad_dane,
        odpocet_ztraty::numeric(19,4)                                               AS odpocet_ztraty,
        zaklad_zaokr::numeric(19,4)                                                 AS zaklad_zaokrouhleny,
        ${rate}::numeric(19,4)                                                      AS sazba,
        dan::numeric(19,4)                                                          AS dan,
        ${reliefs}::numeric(19,4)                                                   AS slevy,
        dan_po_slevach::numeric(19,4)                                               AS dan_po_slevach,
        ${advances}::numeric(19,4)                                                  AS zalohy,
        (dan_po_slevach - ${advances}::numeric)::numeric(19,4)                      AS doplatek
      FROM slevy`,
  )
  return { type: "CORPORATE_INCOME_TAX", ...r }
}

/**
 * §25/1 daňově neuznatelné náklady — the high-frequency catalogue. Each entry is
 * the účet (or account prefix) whose booked cost is added back to the DPPO base,
 * with the statute. This is the reference list the caller uses to sum
 * `nonDeductibleExpenses` from the read-model (some are partial / limit-based, so
 * the sum is a caller decision, not an automatic all-of-513 add-back).
 */
export const NON_DEDUCTIBLE_CATALOGUE: ReadonlyArray<{
  account: string
  label: string
  law: string
  /** whole balance non-deductible, or limit/partial (caller computes the excess). */
  scope: "full" | "partial"
}> = [
  {
    account: "513",
    label: "Náklady na reprezentaci",
    law: "§25/1/t",
    scope: "full",
  },
  {
    account: "545",
    label: "Ostatní pokuty a penále",
    law: "§25/1/f",
    scope: "full",
  },
  {
    account: "544",
    label: "Smluvní pokuty a úroky z prodlení (nezaplacené)",
    law: "§24/2/zi",
    scope: "partial",
  },
  {
    account: "543",
    label: "Dary (nad limit §20/8)",
    law: "§25/1/t",
    scope: "partial",
  },
  {
    account: "528",
    label: "Manka a škody nad náhrady",
    law: "§25/1/n",
    scope: "partial",
  },
  {
    account: "551",
    label: "Účetní odpisy nad rámec daňových (§23/3)",
    law: "§25/1/zg",
    scope: "partial",
  },
  {
    account: "554",
    label: "Tvorba účetních rezerv (nezákonných)",
    law: "§25/1/zc",
    scope: "partial",
  },
  {
    account: "559",
    label: "Tvorba účetních opravných položek (nezákonných)",
    law: "§25/1/zc",
    scope: "partial",
  },
] as const

/**
 * §38a zálohy na daň for the NEXT zdaňovací období, from the poslední známá
 * daňová povinnost (this year's assessed tax):
 *   ≤ 30 000 Kč           → no advances
 *   30 000 – 150 000 Kč   → 40 % pololetně (2 advances)
 *   > 150 000 Kč          → ¼ (25 %) čtvrtletně (4 advances), rounded up to 100 Kč
 * Each advance is rounded up to whole hundreds (§146/2 DŘ). Pure arithmetic on a
 * single scalar — safe in TS (not a ledger amount).
 */
export function computeIncomeTaxAdvances(lastKnownTax: Decimal): {
  frequency: "NONE" | "SEMIANNUAL" | "QUARTERLY"
  count: number
  amount: Decimal
} {
  const tax = Number(lastKnownTax)
  const roundUpHundred = (n: number) => (Math.ceil(n / 100) * 100).toFixed(2)
  if (tax <= 30000) return { frequency: "NONE", count: 0, amount: "0.00" }
  if (tax <= 150000)
    return {
      frequency: "SEMIANNUAL",
      count: 2,
      amount: roundUpHundred(tax * 0.4),
    }
  return {
    frequency: "QUARTERLY",
    count: 4,
    amount: roundUpHundred(tax * 0.25),
  }
}
