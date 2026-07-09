/**
 * Souhrnné hlášení (§102 ZDPH) — the recapitulative statement of intra-Community
 * supplies. A plátce who supplies goods/services to a VAT-registered person in
 * another member state files it per counterparty VAT id + kód plnění. Built from
 * the ISSUED reverse-charge EU partial_records (vat_mode = 'REVERSE_CHARGE' +
 * vat_jurisdiction = 'EU', migration 0038 — the shared ISSUED_EU_SUPPLY predicate,
 * identical to the DPH ř.20/21 filter) joined to the counterparty tax identity
 * (migration 0039). §102(1) is a B2B intra-Community obligation only.
 *
 * Kód plnění (Pokyny k SH):
 *   0  dodání zboží do JČS osobě registrované k dani (§64) — the default
 *   1  přemístění obchodního majetku / prostřední osoba u třístranného obchodu
 *   2  dodání zboží prostřední osobou v třístranném obchodu (§17)
 *   3  poskytnutí služby s místem plnění v JČS dle §9/1 (reverse-charged service)
 *
 * Goods (kód 0) vs service (kód 3) is driven by the SUPPLY KIND persisted on the
 * captured fact (partial_record.supply_kind, migration 0043): a SERVICES supply
 * is reported under kód 3 (§9/1 reverse-charged service), everything else —
 * including a NULL/undistinguished supply_kind (legacy rows) — under kód 0
 * (dodání zboží §64). The kód is part of the grouping key, so one partner that
 * receives both goods and services yields two lines (one per kód), as required.
 *
 * v1 LIMITATION (still flagged): kód 1 (přemístění majetku) and kód 2 (třístranný
 * obchod §17) are NOT derivable from the supply kind alone (they need own-goods-
 * transfer / triangular-trade facts) — those remain unsupported. DPH ř.5/6 EU-
 * services split is the remaining related follow-up.
 *
 * Hodnota plnění is the base in accounting currency (CZK), no VAT (EU supplies are
 * osvobozené s nárokem). All money arithmetic in SQL (R13).
 *
 * A FILING_PERIOD evidence scope uses summary_record.tax_point_date and may
 * cross accounting periods. ACCOUNTING_PERIOD remains available for the v1
 * period-scoped public read model.
 */

import { sql } from "drizzle-orm"
import { rows } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal, VatEvidenceScope } from "../types"
import { ISSUED_EU_SUPPLY_SH } from "./eu-supply-predicate"
import {
  getVatEvidenceCompleteness,
  type VatEvidenceCompleteness,
} from "./vat-evidence-completeness"
import { vatEvidencePredicates } from "./vat-evidence-scope"

/** One souhrnné-hlášení line: member state + VAT id + kód + count + value. */
export interface ShRow {
  /** ISO 3166-1 alpha-2 member state of the acquirer (from counterparty). */
  country_code: string | null
  /** acquirer's VAT identification number (DIČ), incl. country prefix. */
  tax_id: string | null
  /** kód plnění (0 goods / 1 transfer / 2 triangular / 3 service). */
  kod_plneni: string
  /** počet plnění — distinct dokladů to this partner. */
  count: number
  /** celková hodnota plnění (CZK, bez daně). */
  value: Decimal
}

export interface SouhrnneHlaseni {
  type: "SOUHRNNE_HLASENI"
  rows: ShRow[]
  completeness: VatEvidenceCompleteness
}

/**
 * Build the souhrnné hlášení for a period from EU-marked ISSUED supplies, grouped
 * per counterparty VAT id + member state + kód plnění. A SERVICES supply_kind
 * maps to kód 3 (§9/1 service); everything else — including a NULL supply_kind —
 * maps to kód 0 (goods §64), preserving the legacy behavior. See the module doc.
 */
export async function buildSouhrnneHlaseni(
  db: RowExecutor,
  scope: VatEvidenceScope,
): Promise<SouhrnneHlaseni> {
  // SERVICES → kód 3 (§9/1); goods and any NULL/undistinguished supply → kód 0
  // (§64). NULL falls to the ELSE branch, so legacy rows report kód 0 unchanged.
  const kodPlneni = sql`CASE WHEN pr.supply_kind = 'SERVICES' THEN '3' ELSE '0' END`
  const scopeFilter = vatEvidencePredicates(
    scope,
    sql`sr.period_id`,
    sql`sr.tax_point_date`,
    sql`sr.received_date`,
  ).taxPoint
  const [shRows, completeness] = await Promise.all([
    rows<ShRow>(
      db,
      sql`
      SELECT cp.country_code                                        AS country_code,
             cp.tax_id                                              AS tax_id,
             ${kodPlneni}                                           AS kod_plneni,
             COUNT(DISTINCT sr.id)::int                             AS count,
             COALESCE(SUM(pr.base_in_accounting_currency), 0)::numeric(19,4) AS value
        FROM partial_record pr
        JOIN individual_record ir ON ir.id = pr.individual_record_id
        JOIN summary_record   sr ON sr.id = ir.summary_record_id
        JOIN accounting_event ae ON ae.id = ir.accounting_event_id
        LEFT JOIN counterparty cp ON cp.id = ae.counterparty_id
       WHERE ${scopeFilter}
         -- Shared issued-EU predicate (§102(1) B2B intracom): ISSUED + REVERSE_CHARGE
         -- + vat_jurisdiction 'EU' — identical to the DPH ř.20/21 filter, so SH and
         -- ř.20+ř.21 cannot diverge (#541). The vat_mode gate also excludes a
         -- STANDARD+EU distance sale / OUTSIDE_VAT+EU §10 service from the recap.
         AND ${ISSUED_EU_SUPPLY_SH}
       GROUP BY cp.country_code, cp.tax_id, ${kodPlneni}
       ORDER BY cp.tax_id, ${kodPlneni}`,
    ),
    getVatEvidenceCompleteness(db, scope, "SH"),
  ])
  return { type: "SOUHRNNE_HLASENI", rows: shRows, completeness }
}
