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
 *        Per doklad: DIČ odběratele, ev. číslo, DPPD, kód předmětu plnění (§92,
 *        partial_record.commodity_code), základ (daň odvádí odběratel).
 *   A.2  přijatá plnění, kde daň přiznává příjemce z pořízení z EU (§16/§9(1))
 *        nebo §108 residual od osoby neusazené v tuzemsku (RECEIVED
 *        REVERSE_CHARGE, vat_jurisdiction IN {'EU','SECTION_108'}). Per doklad:
 *        DIČ dodavatele, ev. číslo, DPPD, základ + samovyměřená daň. [#540]
 *   A.4  uskutečněná zdanitelná plnění > 10 000 Kč vč. daně s DIČ odběratele
 *        (ISSUED STANDARD). Per doklad: DIČ, ev. číslo, DPPD, základ+daň dle sazby.
 *   A.5  ostatní uskutečněná zdanitelná plnění (≤ 10 000 vč. daně nebo bez DIČ) —
 *        SOUHRNNĚ (aggregate základ + daň).
 *   B.1  přijatá plnění v režimu PDP — ODBĚRATEL (§92, domestic); RECEIVED
 *        REVERSE_CHARGE, vat_jurisdiction ≠ 'EU' AND ≠ 'SECTION_108' (§108
 *        residual is A.2, not B.1). Per doklad: DIČ dodavatele, ev. číslo, DPPD,
 *        kód předmětu plnění (§92), základ + samovyměřená daň.
 *   B.2  přijatá zdanitelná plnění > 10 000 Kč vč. daně s DIČ (RECEIVED STANDARD).
 *        Per doklad: DIČ, ev. číslo, DPPD, základ+daň dle sazby.
 *   B.3  ostatní přijatá zdanitelná plnění (≤ 10 000 vč. daně) — SOUHRNNĚ.
 *
 * The 10 000 Kč threshold is on the ABSOLUTE DOKLAD total INCLUDING daň
 * (§101d/1) — a negative opravný doklad (dobropis) over 10 000 Kč in absolute
 * value goes on an A.4/B.2 row with its negative amounts, not into the
 * aggregate. Rows are grouped per (doklad, counterparty); all money arithmetic
 * is in SQL (R13).
 *
 * A FILING_PERIOD evidence scope uses document legal dates and may cross
 * accounting periods. Received STANDARD sections follow proven deduction
 * eligibility; other sections follow the document tax point.
 */

import { sql } from "drizzle-orm"
import { rows } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal, VatEvidenceScope } from "../types"
import {
  getVatEvidenceCompleteness,
  type VatEvidenceCompleteness,
} from "./vat-evidence-completeness"
import { vatEvidencePredicates } from "./vat-evidence-scope"
import { vatClassificationPredicates } from "./vat-classification"

/** §101d/1 limit — plnění nad 10 000 Kč včetně daně (v absolutní hodnotě —
 * opravné doklady jsou záporné) jde na řádkovou evidenci. */
export const KH_ROW_THRESHOLD = "10000"

/** One per-counterparty, per-doklad KH row (A.1/A.2/A.4/B.1/B.2). */
export interface KhRow {
  /** DIČ of the other party (odběratel for A, dodavatel for B). */
  tax_id: string | null
  /** evidenční číslo daňového dokladu (summary_record.designation). */
  doklad: string
  /** DPPD — datum povinnosti přiznat daň (≈ okamžik uskutečnění). */
  dppd: string
  /**
   * §92 kód předmětu plnění — set on the DOMESTIC reverse-charge rows (A.1
   * dodavatel, B.1 odběratel): "1" zlato / "3" nemovitost / "4" stavební-
   * montážní / "5" příloha 5. NULL on A.2 (EU acquisition) and on the STANDARD
   * rows (A.4/B.2), which carry no §92 kód.
   */
  kod: string | null
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
  completeness: VatEvidenceCompleteness
}

/**
 * Doklad-level aggregation of STANDARD partial_records for one document side
 * (ISSUED for A.4/A.5, RECEIVED for B.2/B.3): base+daň per rate, doklad gross,
 * DIČ. Reused by the >10k row query and the ≤10k aggregate query.
 */
function standardDokladCte(scope: VatEvidenceScope, type: string) {
  const predicates = vatEvidencePredicates(
    scope,
    sql`sr.period_id`,
    sql`sr.tax_point_date`,
    sql`sr.received_date`,
  )
  const scopeFilter =
    type === "RECEIVED_INVOICE" ? predicates.deduction : predicates.taxPoint
  const classification = vatClassificationPredicates({
    documentType: sql`sr.type`,
    mode: sql`pr.vat_mode`,
    jurisdiction: sql`pr.vat_jurisdiction`,
    supplyKind: sql`pr.supply_kind`,
  })
  return sql`
    doklad AS (
      SELECT sr.id                                                          AS summary_record_id,
             sr.designation                                                 AS doklad,
             sr.tax_point_date                                              AS dppd,
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
       WHERE ${scopeFilter}
         AND sr.type = ${type}
         AND pr.vat_mode = 'STANDARD'
         AND ${classification.khReportable}
       GROUP BY sr.id, sr.designation, sr.tax_point_date, cp.tax_id
    )`
}

/**
 * Reverse-charge doklad rows (A.1 issued PDP, A.2 recipient self-assessment, B.1
 * domestic PDP received): base + self-assessed daň per rate per doklad.
 * `euFilter` selects the SELF_ASSESSED group (A.2 — the recipient přiznává daň
 * under §108: EU acquisitions §16/§9(1) AND §108 residual from a non-established
 * supplier, jurisdiction IN {'EU','SECTION_108'}) vs the DOMESTIC §92 group
 * (B.1/A.1, jurisdiction not one of those). A.1 uses `DOMESTIC` ([#516]) so
 * EU-marked issued reverse-charge supplies (SH-only) do not leak onto the KH;
 * the ISSUED side still carries daň 0. [#540] SECTION_108 joins the A.2 group
 * (§108 residual) and is excluded from B.1 (it is not a domestic §92 PDP).
 */
async function reverseChargeRows(
  db: RowExecutor,
  scope: VatEvidenceScope,
  type: string,
  // Every caller MUST pick a jurisdiction group. There is deliberately no
  // unfiltered ("ANY") mode: that was the #516 leak that put EU-marked issued
  // reverse-charge onto KH A.1, and dropping it from the union makes that
  // regression unrepresentable — a new call site cannot reintroduce it.
  // "SELF_ASSESSED" = A.2 (recipient self-assesses, §108: EU + SECTION_108);
  // "DOMESTIC" = A.1/B.1 (§92 PDP). Named "EU" for back-compat with the two call
  // sites; the group now also admits SECTION_108.
  euFilter: "EU" | "DOMESTIC",
): Promise<KhRow[]> {
  const jurisdiction =
    euFilter === "EU"
      ? sql`AND pr.vat_jurisdiction IN ('EU', 'SECTION_108')`
      : sql`AND pr.vat_jurisdiction IS DISTINCT FROM 'EU' AND pr.vat_jurisdiction IS DISTINCT FROM 'SECTION_108'`
  // §92 kód předmětu plnění is grouped and emitted unconditionally: the DB CHECK
  // (partial_record_commodity_code_rc_chk, migration 0046, tightened by 0056)
  // guarantees a non-NULL commodity_code only ever sits on a DOMESTIC
  // reverse-charge line — the constraint excludes BOTH 'EU' AND 'SECTION_108' —
  // so on the SELF_ASSESSED filter (A.2) every code is provably NULL: grouping
  // by an all-NULL column is a no-op and kod comes out NULL, no read-side
  // masking needed. On A.1/B.1 the kód is part of the grouping key, so a doklad
  // mixing §92 commodities yields a row per kód.
  //
  // A.1 (ISSUED PDP dodavatel) carries no daň — the odběratel self-assesses; the
  // A.1 form has základ + kód only. On the received side the příjemce self-assesses.
  const dan = (rate: number) =>
    type === "ISSUED_INVOICE"
      ? sql`0`
      : sql`SUM(round(pr.base_in_accounting_currency * COALESCE(pr.vat_rate,0) / 100, 2)) FILTER (WHERE pr.vat_rate = ${rate})`
  const scopeFilter = vatEvidencePredicates(
    scope,
    sql`sr.period_id`,
    sql`sr.tax_point_date`,
    sql`sr.received_date`,
  ).taxPoint
  const classification = vatClassificationPredicates({
    documentType: sql`sr.type`,
    mode: sql`pr.vat_mode`,
    jurisdiction: sql`pr.vat_jurisdiction`,
    supplyKind: sql`pr.supply_kind`,
  })
  return rows<KhRow>(
    db,
    sql`
      SELECT sr.designation                                              AS doklad,
             sr.tax_point_date                                           AS dppd,
             cp.tax_id                                                   AS tax_id,
             pr.commodity_code                                           AS kod,
             COALESCE(SUM(pr.base_in_accounting_currency) FILTER (WHERE pr.vat_rate = 21), 0)::numeric(19,4) AS base21,
             COALESCE(${dan(21)}, 0)::numeric(19,4) AS dan21,
             COALESCE(SUM(pr.base_in_accounting_currency) FILTER (WHERE pr.vat_rate = 12), 0)::numeric(19,4) AS base12,
             COALESCE(${dan(12)}, 0)::numeric(19,4) AS dan12
        FROM partial_record pr
        JOIN individual_record ir ON ir.id = pr.individual_record_id
        JOIN summary_record   sr ON sr.id = ir.summary_record_id
        JOIN accounting_event ae ON ae.id = ir.accounting_event_id
        LEFT JOIN counterparty cp ON cp.id = ae.counterparty_id
       WHERE ${scopeFilter}
         AND sr.type = ${type}
         AND pr.vat_mode = 'REVERSE_CHARGE'
         AND ${classification.khReportable}
         ${jurisdiction}
       GROUP BY sr.designation, sr.tax_point_date, cp.tax_id, pr.commodity_code
       ORDER BY sr.designation`,
  )
}

/** STANDARD taxable rows over the §101d threshold (A.4 / B.2). */
async function standardRowsOverThreshold(
  db: RowExecutor,
  scope: VatEvidenceScope,
  type: string,
): Promise<KhRow[]> {
  return rows<KhRow>(
    db,
    sql`
      WITH ${standardDokladCte(scope, type)}
      SELECT doklad,
             dppd,
             tax_id,
             NULL::text AS kod,
             base21::numeric(19,4) AS base21,
             dan21::numeric(19,4)  AS dan21,
             base12::numeric(19,4) AS base12,
             dan12::numeric(19,4)  AS dan12
        FROM doklad
       WHERE abs(gross) > ${KH_ROW_THRESHOLD}::numeric
         AND tax_id IS NOT NULL
       ORDER BY doklad`,
  )
}

/** STANDARD taxable plnění under the threshold or without DIČ, aggregated (A.5 / B.3). */
async function standardAggregate(
  db: RowExecutor,
  scope: VatEvidenceScope,
  type: string,
): Promise<KhAggregate> {
  const r = await rows<KhAggregate>(
    db,
    sql`
      WITH ${standardDokladCte(scope, type)}
      SELECT COALESCE(SUM(base21 + base12), 0)::numeric(19,4) AS base,
             COALESCE(SUM(dan21 + dan12), 0)::numeric(19,4)   AS dan,
             COUNT(*)::int                                    AS count
        FROM doklad
       WHERE NOT (abs(gross) > ${KH_ROW_THRESHOLD}::numeric AND tax_id IS NOT NULL)`,
  )
  return r[0] ?? { base: "0.0000", dan: "0.0000", count: 0 }
}

/**
 * Build the full kontrolní hlášení for a period: every row-level section plus the
 * two aggregate sections.
 *
 * A statutory filing scope can cross accounting-period boundaries. The
 * ACCOUNTING_PERIOD scope remains for the period-scoped public read model.
 */
export async function buildKontrolniHlaseni(
  db: RowExecutor,
  scope: VatEvidenceScope,
): Promise<KontrolniHlaseni> {
  const [a1, a2, a4, a5, b1, b2, b3, completeness] = await Promise.all([
    // [#516] A.1 = domestic §92 PDP dodavatel ONLY. An EU-marked ISSUED
    // reverse-charge supply (a §9/1 service reverse-charged to the EU customer)
    // belongs on Souhrnné hlášení (kód 3), never on KH A.1 — `DOMESTIC`
    // (vat_jurisdiction IS DISTINCT FROM 'EU') keeps the real §92 rows
    // (jurisdiction 'REVERSE_CHARGE' / legacy NULL) and drops only 'EU'. The
    // souhrnné-hlášení emitter already reports those EU rows, so `ANY` here
    // double-reported them onto the KH. Symmetric with B.1 (RECEIVED domestic).
    reverseChargeRows(db, scope, "ISSUED_INVOICE", "DOMESTIC"),
    reverseChargeRows(db, scope, "RECEIVED_INVOICE", "EU"),
    standardRowsOverThreshold(db, scope, "ISSUED_INVOICE"),
    standardAggregate(db, scope, "ISSUED_INVOICE"),
    reverseChargeRows(db, scope, "RECEIVED_INVOICE", "DOMESTIC"),
    standardRowsOverThreshold(db, scope, "RECEIVED_INVOICE"),
    standardAggregate(db, scope, "RECEIVED_INVOICE"),
    getVatEvidenceCompleteness(db, scope, "KH"),
  ])
  return {
    type: "KONTROLNI_HLASENI",
    a1,
    a2,
    a4,
    a5,
    b1,
    b2,
    b3,
    completeness,
  }
}
