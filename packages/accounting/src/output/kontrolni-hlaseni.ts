/**
 * Kontrolní hlášení (§101c–101i ZDPH) — the ROW-LEVEL, per-counterparty control
 * statement the plátce actually files, distinct from dph.ts's period section
 * totals. Built straight from captured partial_record VAT facts joined through
 * individual_record → summary_record (the doklad + period) and → accounting_event
 * (the counterparty + DPPD). The counterparty DIČ + name come from the
 * counterparty tax-identity columns (migration 0039).
 *
 * Sections (2016+ KH structure):
 *   A.1  uskutečněná plnění v režimu PDP — DODAVATEL (§92); ISSUED REVERSE_CHARGE.
 *        Per doklad: DIČ odběratele, ev. číslo, DPPD, základ (daň odvádí odběratel).
 *   A.2  přijatá plnění, kde daň přiznává příjemce z pořízení z EU / §108
 *        (RECEIVED REVERSE_CHARGE, vat_jurisdiction = 'EU'). Per doklad: DIČ
 *        dodavatele, ev. číslo, DPPD, základ + samovyměřená daň.
 *   A.4  uskutečněná zdanitelná plnění > 10 000 Kč vč. daně s DIČ odběratele
 *        (ISSUED STANDARD). Per doklad: DIČ, ev. číslo, DPPD, základ+daň dle sazby.
 *   A.5  ostatní uskutečněná zdanitelná plnění (≤ 10 000 vč. daně nebo bez DIČ) —
 *        SOUHRNNĚ (aggregate základ + daň).
 *   B.1  přijatá plnění v režimu PDP — ODBĚRATEL (§92, domestic); RECEIVED
 *        REVERSE_CHARGE, vat_jurisdiction ≠ 'EU'. Per doklad: DIČ dodavatele,
 *        ev. číslo, DPPD, základ + samovyměřená daň.
 *   B.2  přijatá zdanitelná plnění > 10 000 Kč vč. daně s DIČ (RECEIVED STANDARD).
 *        Per doklad: DIČ, ev. číslo, DPPD, základ+daň dle sazby.
 *   B.3  ostatní přijatá zdanitelná plnění (≤ 10 000 vč. daně) — SOUHRNNĚ.
 *
 * The 10 000 Kč threshold is on the DOKLAD total INCLUDING daň (§101d/1). Rows
 * are grouped per (doklad, counterparty); all money arithmetic is in SQL (R13).
 */

import { sql } from "drizzle-orm"
import { rows } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

/** §101d/1 limit — plnění nad 10 000 Kč včetně daně jde na řádkovou evidenci. */
export const KH_ROW_THRESHOLD = "10000"

/** One per-counterparty, per-doklad KH row (A.1/A.2/A.4/B.1/B.2). */
export interface KhRow {
  /** DIČ of the other party (odběratel for A, dodavatel for B). */
  tax_id: string | null
  /** evidenční číslo daňového dokladu (summary_record.designation). */
  doklad: string
  /** DPPD — datum povinnosti přiznat daň (≈ okamžik uskutečnění). */
  dppd: string
  /** základ + daň, 21 % bucket. */
  base21: Decimal
  dan21: Decimal
  /** základ + daň, 12 % bucket. */
  base12: Decimal
  dan12: Decimal
}

/** Souhrnný řádek (A.5 / B.3) — one aggregate over the sub-threshold plnění. */
export interface KhAggregate {
  base: Decimal
  dan: Decimal
  /** number of dokladů folded into the aggregate. */
  count: number
}

export interface KontrolniHlaseni {
  type: "KONTROLNI_HLASENI"
  a1: KhRow[]
  a2: KhRow[]
  a4: KhRow[]
  a5: KhAggregate
  b1: KhRow[]
  b2: KhRow[]
  b3: KhAggregate
}

/**
 * Doklad-level aggregation of STANDARD partial_records for one document side
 * (ISSUED for A.4/A.5, RECEIVED for B.2/B.3): base+daň per rate, doklad gross,
 * DIČ. Reused by the >10k row query and the ≤10k aggregate query.
 */
function standardDokladCte(periodId: string, type: string) {
  return sql`
    doklad AS (
      SELECT sr.id                                                          AS summary_record_id,
             sr.designation                                                 AS doklad,
             MIN(ae.occurred_at)::date                                      AS dppd,
             cp.tax_id                                                      AS tax_id,
             COALESCE(SUM(pr.base_in_accounting_currency) FILTER (WHERE pr.vat_rate = 21), 0) AS base21,
             COALESCE(SUM(pr.vat_in_accounting_currency)  FILTER (WHERE pr.vat_rate = 21), 0) AS dan21,
             COALESCE(SUM(pr.base_in_accounting_currency) FILTER (WHERE pr.vat_rate = 12), 0) AS base12,
             COALESCE(SUM(pr.vat_in_accounting_currency)  FILTER (WHERE pr.vat_rate = 12), 0) AS dan12,
             COALESCE(SUM(pr.base_in_accounting_currency + pr.vat_in_accounting_currency), 0) AS gross
        FROM partial_record pr
        JOIN individual_record ir ON ir.id = pr.individual_record_id
        JOIN summary_record   sr ON sr.id = ir.summary_record_id
        JOIN accounting_event ae ON ae.id = ir.accounting_event_id
        LEFT JOIN counterparty cp ON cp.id = ae.counterparty_id
       WHERE sr.period_id = ${periodId}::uuid
         AND sr.type = ${type}
         AND pr.vat_mode = 'STANDARD'
       GROUP BY sr.id, sr.designation, cp.tax_id
    )`
}

/**
 * Reverse-charge doklad rows (A.1 issued PDP, A.2 EU acquisition, B.1 domestic
 * PDP received): base + self-assessed daň per rate per doklad. `euOnly` selects
 * A.2 (jurisdiction = 'EU') vs B.1 (domestic, jurisdiction ≠ 'EU'); ignored for
 * the ISSUED side (A.1, daň 0).
 */
async function reverseChargeRows(
  db: RowExecutor,
  periodId: string,
  type: string,
  euFilter: "EU" | "DOMESTIC" | "ANY",
): Promise<KhRow[]> {
  const jurisdiction =
    euFilter === "EU"
      ? sql`AND pr.vat_jurisdiction = 'EU'`
      : euFilter === "DOMESTIC"
        ? sql`AND pr.vat_jurisdiction IS DISTINCT FROM 'EU'`
        : sql``
  // A.1 (ISSUED PDP dodavatel) carries no daň — the odběratel self-assesses; the
  // A.1 form has základ + kód only. On the received side the příjemce self-assesses.
  const dan = (rate: number) =>
    type === "ISSUED_INVOICE"
      ? sql`0`
      : sql`SUM(round(pr.base_in_accounting_currency * COALESCE(pr.vat_rate,0) / 100, 2)) FILTER (WHERE pr.vat_rate = ${rate})`
  return rows<KhRow>(
    db,
    sql`
      SELECT sr.designation                                              AS doklad,
             MIN(ae.occurred_at)::date                                   AS dppd,
             cp.tax_id                                                   AS tax_id,
             COALESCE(SUM(pr.base_in_accounting_currency) FILTER (WHERE pr.vat_rate = 21), 0)::numeric(19,4) AS base21,
             COALESCE(${dan(21)}, 0)::numeric(19,4) AS dan21,
             COALESCE(SUM(pr.base_in_accounting_currency) FILTER (WHERE pr.vat_rate = 12), 0)::numeric(19,4) AS base12,
             COALESCE(${dan(12)}, 0)::numeric(19,4) AS dan12
        FROM partial_record pr
        JOIN individual_record ir ON ir.id = pr.individual_record_id
        JOIN summary_record   sr ON sr.id = ir.summary_record_id
        JOIN accounting_event ae ON ae.id = ir.accounting_event_id
        LEFT JOIN counterparty cp ON cp.id = ae.counterparty_id
       WHERE sr.period_id = ${periodId}::uuid
         AND sr.type = ${type}
         AND pr.vat_mode = 'REVERSE_CHARGE'
         ${jurisdiction}
       GROUP BY sr.designation, cp.tax_id
       ORDER BY sr.designation`,
  )
}

/** STANDARD taxable rows over the §101d threshold (A.4 / B.2). */
async function standardRowsOverThreshold(
  db: RowExecutor,
  periodId: string,
  type: string,
): Promise<KhRow[]> {
  return rows<KhRow>(
    db,
    sql`
      WITH ${standardDokladCte(periodId, type)}
      SELECT doklad,
             dppd,
             tax_id,
             base21::numeric(19,4) AS base21,
             dan21::numeric(19,4)  AS dan21,
             base12::numeric(19,4) AS base12,
             dan12::numeric(19,4)  AS dan12
        FROM doklad
       WHERE gross > ${KH_ROW_THRESHOLD}::numeric
         AND tax_id IS NOT NULL
       ORDER BY doklad`,
  )
}

/** STANDARD taxable plnění under the threshold or without DIČ, aggregated (A.5 / B.3). */
async function standardAggregate(
  db: RowExecutor,
  periodId: string,
  type: string,
): Promise<KhAggregate> {
  const r = await rows<KhAggregate>(
    db,
    sql`
      WITH ${standardDokladCte(periodId, type)}
      SELECT COALESCE(SUM(base21 + base12), 0)::numeric(19,4) AS base,
             COALESCE(SUM(dan21 + dan12), 0)::numeric(19,4)   AS dan,
             COUNT(*)::int                                    AS count
        FROM doklad
       WHERE NOT (gross > ${KH_ROW_THRESHOLD}::numeric AND tax_id IS NOT NULL)`,
  )
  return r[0] ?? { base: "0.0000", dan: "0.0000", count: 0 }
}

/**
 * Build the full kontrolní hlášení for a period: every row-level section plus the
 * two aggregate sections.
 */
export async function buildKontrolniHlaseni(
  db: RowExecutor,
  periodId: string,
): Promise<KontrolniHlaseni> {
  const [a1, a2, a4, a5, b1, b2, b3] = await Promise.all([
    reverseChargeRows(db, periodId, "ISSUED_INVOICE", "ANY"),
    reverseChargeRows(db, periodId, "RECEIVED_INVOICE", "EU"),
    standardRowsOverThreshold(db, periodId, "ISSUED_INVOICE"),
    standardAggregate(db, periodId, "ISSUED_INVOICE"),
    reverseChargeRows(db, periodId, "RECEIVED_INVOICE", "DOMESTIC"),
    standardRowsOverThreshold(db, periodId, "RECEIVED_INVOICE"),
    standardAggregate(db, periodId, "RECEIVED_INVOICE"),
  ])
  return { type: "KONTROLNI_HLASENI", a1, a2, a4, a5, b1, b2, b3 }
}
