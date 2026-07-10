/**
 * Podklad pro přiznání k DPH + kontrolní hlášení (Act 235/2004 Sb., ZDPH).
 * Aggregates the period's captured VAT data straight from partial_record
 * (joined through individual_record → summary_record for the period + the
 * ISSUED/RECEIVED side), never from the read-model — the přiznání is a
 * tax-return view over the captured VAT facts (base_in_accounting_currency /
 * vat_in_accounting_currency / vat_rate / vat_mode), not the double-entry
 * ledger. All money arithmetic is in SQL (R13); self-assessed daň on a
 * REVERSE_CHARGE receipt is derived as round(base × rate / 100, 2), the same
 * §37 convention used by the předkontace expander.
 *
 * A FILING_PERIOD evidence scope uses document legal dates and may cross
 * accounting periods. ACCOUNTING_PERIOD remains available for the v1 public
 * read model. Input deductions require a proven received-document date.
 *
 * Přiznání rows covered (§ ZDPH references in comments below):
 *   ř.1/2   dodání zboží/služeb, plátce, 21%/12%  (ISSUED, STANDARD)
 *   ř.3/4   pořízení zboží z JČS — samovyměření 21%/12% (RECEIVED, REVERSE_CHARGE,
 *           vat_jurisdiction = 'EU', supply_kind ≠ 'SERVICES', §16)
 *   ř.5/6   přijetí služby dle §9/1 z JČS — samovyměření 21%/12% (RECEIVED,
 *           REVERSE_CHARGE, vat_jurisdiction = 'EU', supply_kind = 'SERVICES')
 *   ř.10/11 PDP odběratel — samovyměření 21%/12%  (RECEIVED, REVERSE_CHARGE,
 *           domestic §92e — vat_jurisdiction ≠ 'EU')
 *   ř.20    dodání zboží do JČS (ISSUED, REVERSE_CHARGE, vat_jurisdiction = 'EU',
 *           supply_kind ≠ 'SERVICES', §64); osvobozeno s nárokem, základ only, daň 0.
 *           V souhrnném hlášení kód "0"; NENÍ v kontrolním hlášení.
 *   ř.21    poskytnutí služby s místem plnění v JČS dle §9/1 (ISSUED,
 *           REVERSE_CHARGE, vat_jurisdiction = 'EU', supply_kind = 'SERVICES');
 *           základ only, daň 0. V souhrnném hlášení kód "3"; NENÍ v KH.
 *   ř.22    vývoz zboží do třetí země (ISSUED, EXEMPT, vat_jurisdiction =
 *           'IMPORT', §66); osvobozeno s nárokem na odpočet, základ only, daň 0.
 *           Nikdy v souhrnném hlášení (EU-only) ani v KH.
 *   ř.25    PDP dodavatel — dodání v režimu přenesení (ISSUED, REVERSE_CHARGE);
 *           základ only, daň 0 (odvádí odběratel, §92a)
 *   ř.40/41 odpočet daně na vstupu 21%/12%        (RECEIVED, STANDARD)
 *   ř.43/44 odpočet u samovyměření (z ř.3-13), 21%/12% (§73/4)
 *   ř.50    osvobozená plnění                     (EXEMPT, either side)
 *
 * EU-vs-domestic split (fixed): the EPIC-3 limitation — §16 pořízení zboží z EU
 * (ř.3/4) collapsing into domestic §92e PDP (ř.10/11) because both capture as
 * vat_mode = REVERSE_CHARGE — is resolved by partial_record.vat_jurisdiction
 * (migration 0038). A RECEIVED REVERSE_CHARGE row with vat_jurisdiction = 'EU'
 * routes to ř.3/4; anything else (domestic PDP, or a legacy NULL) stays on
 * ř.10/11. Both remain fully deductible on ř.43/44, so vlastní daň is unchanged
 * by the split — only the form line differs.
 *
 * The goods-vs-service sub-split within EU acquisitions (ř.3/4 §16 GOODS vs ř.5/6
 * §9/1 SERVICES) is driven by partial_record.supply_kind (migration 0043): a
 * RECEIVED REVERSE_CHARGE EU row with supply_kind = 'SERVICES' routes to ř.5/6,
 * everything else (goods, or a legacy NULL) stays on ř.3/4. Consistent with the
 * souhrnné hlášení kód-plnění mapping (SERVICES → 3). ř.5/6 is self-assessed and
 * deductible on ř.43/44 exactly like ř.3/4, so vlastní daň is unaffected.
 *
 * Export vs domestic-exempt split (#566): decideVat (classify.ts) previously
 * emitted vat_mode = 'IMPORT' for BOTH the RECEIVED import (§23) and the ISSUED
 * export (§66) sides of the "IMPORT" jurisdiction, while the catalogue's
 * S-EXPORT scenario is welded to vat_mode = 'EXEMPT' — a self-contradictory
 * decision that threw at posting (expand.ts's vat_mode match check) or
 * silently misfiled the export onto ř.50 (§51 exempt-WITHOUT-deduction, wrong:
 * vývoz is osvobozeno S nárokem, poisoning the §76 krácení koeficient for a
 * mixed-supply plátce). Fixed by splitting decideVat's IMPORT case per
 * direction (RECEIVED → vat_mode IMPORT; ISSUED → vat_mode EXEMPT, matching the
 * catalogue) and using vat_jurisdiction = 'IMPORT' as the ISSUED-side
 * discriminator — the #541 pattern applied to the export/import pair.
 *
 * Kontrolní hlášení: this module returns SECTION TOTALS only (A.1, A.4/A.5, B.1,
 * B.2/B.3) as a period-level checksum against the přiznání. The row-level,
 * per-counterparty KH the tenant actually files (DIČ + doklad + DPPD) lives in
 * kontrolni-hlaseni.ts (buildKontrolniHlaseni), §101c-101i.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal, VatEvidenceScope } from "../types"
import { ISSUED_EU_SUPPLY_DPH } from "./eu-supply-predicate"
import { vatClassificationPredicates } from "./vat-classification"
import {
  getVatEvidenceCompleteness,
  type VatEvidenceCompleteness,
} from "./vat-evidence-completeness"
import { vatEvidencePredicates } from "./vat-evidence-scope"

export interface DphRows {
  /** ř.1 — dodání zboží/služeb, plátce, 21 % (§13/§14). */
  r1_base: Decimal
  r1_dan: Decimal
  /** ř.2 — dodání zboží/služeb, plátce, 12 % (§13/§14, §47). */
  r2_base: Decimal
  r2_dan: Decimal
  /**
   * ř.3/4 — pořízení zboží z jiného členského státu, samovyměření 21 %/12 %
   * (§16). RECEIVED + REVERSE_CHARGE + vat_jurisdiction = 'EU' + supply_kind
   * = 'GOODS'. Missing or unsupported classifications are excluded and block
   * the worksheet completeness state.
   */
  r3_base: Decimal
  r3_dan: Decimal
  r4_base: Decimal
  r4_dan: Decimal
  /**
   * ř.5/6 — přijetí služby s místem plnění dle §9/1 od osoby registrované v JČS,
   * samovyměření 21 %/12 %. RECEIVED + REVERSE_CHARGE + vat_jurisdiction = 'EU' +
   * supply_kind = 'SERVICES'. Same self-assessment convention as ř.3/4; both are
   * deductible on ř.43/44, so vlastní daň is unaffected by the goods/service split.
   */
  r5_base: Decimal
  r5_dan: Decimal
  r6_base: Decimal
  r6_dan: Decimal
  /**
   * ř.10/11 — PDP odběratel, samovyměření 21 %/12 % (§92e). Domestic reverse
   * charge only: RECEIVED + REVERSE_CHARGE with vat_jurisdiction ≠ 'EU' (a
   * legacy NULL also lands here). EU acquisitions are split out to ř.3/4.
   */
  r10_base: Decimal
  r10_dan: Decimal
  r11_base: Decimal
  r11_dan: Decimal
  /**
   * ř.20 — dodání zboží do jiného členského státu (§64): ISSUED + REVERSE_CHARGE +
   * vat_jurisdiction = 'EU' + supply_kind = 'GOODS'. Unclassified legacy rows
   * remain outside this worksheet rather than being asserted as §64 goods.
   * Osvobozené plnění s nárokem na odpočet → základ only, no daň. Reported in the
   * souhrnné hlášení (kód 0), never in kontrolní hlášení.
   */
  r20_base: Decimal
  /**
   * ř.21 — poskytnutí služby s místem plnění v JČS dle §9/1 osobě registrované k
   * dani v JČS: ISSUED + REVERSE_CHARGE + vat_jurisdiction = 'EU' + supply_kind =
   * 'SERVICES'. Reverse-charged to the EU customer → základ only, no Czech daň.
   * Reported in the souhrnné hlášení (kód 3), never in kontrolní hlášení.
   */
  r21_base: Decimal
  /**
   * ř.22 — vývoz zboží do třetí země (§66 ZDPH): ISSUED + EXEMPT + vat_jurisdiction
   * = 'IMPORT' (the export-side marker; 'IMPORT' jurisdiction marks a third-country
   * supply bidirectionally, mirroring how 'EU' marks both an EU acquisition and
   * delivery). Osvobozeno s nárokem na odpočet → základ only, no daň. Never in the
   * souhrnné hlášení (EU-only) or the kontrolní hlášení. [#566]
   */
  r22_base: Decimal
  /**
   * ř.25 — domestic PDP dodavatel (§92a): základ only, daň 0 (odvádí odběratel).
   * [#516/#541] vat_jurisdiction IS DISTINCT FROM 'EU' — an EU-marked issued
   * reverse-charge supply (§64 goods → ř.20, §9(1) service → ř.21, both osvobozené
   * s nárokem, daň 0) is NOT a domestic §92 PDP and is excluded here. Keeps ř.25 +
   * the KH A.1 checksum consistent (no EU leak); the EU bases now land on ř.20/21.
   */
  r25_base: Decimal
  /** ř.40/41 — odpočet daně na vstupu, 21 %/12 % (§72-73). */
  r40_base: Decimal
  r40_dan: Decimal
  r41_base: Decimal
  r41_dan: Decimal
  /**
   * ř.43/44 — odpočet daně u samovyměření (PDP/§16 pořízení), 21 %/12 % (§73/4).
   * The deductible input half of a REVERSE_CHARGE receipt (vat_deductible = true).
   * For a fully-deductible plátce this equals ř.10/11, so the self-assessment is
   * net-neutral on vlastní daň — as it should be.
   */
  r43_base: Decimal
  r43_dan: Decimal
  r44_base: Decimal
  r44_dan: Decimal
  /** ř.50 — osvobozená plnění (§51 a násl.), both sides. */
  r50_base: Decimal
  /**
   * daň na výstupu celkem = ISSUED STANDARD daň (r1+r2) + ALL self-assessed
   * output daň on the received side (r3+r4 EU goods + r5+r6 EU services + r10+r11
   * domestic PDP). The self-assessed half is net-neutral against ř.43/44, so
   * vlastní daň is unaffected by the EU/domestic + goods/service splits.
   */
  dan_na_vystupu: Decimal
  /** odpočet celkem = r40_dan + r41_dan + r43_dan + r44_dan. */
  odpocet: Decimal
  /** vlastní daň (kladné) / nadměrný odpočet (záporné) = dan_na_vystupu − odpocet. */
  vlastni_dan: Decimal
}

export interface KontrolniHlaseniTotals {
  /** A.1 — PDP dodavatel, dodání v režimu přenesení (ISSUED, REVERSE_CHARGE). */
  a1_base: Decimal
  a1_dan: Decimal
  /** A.4/A.5 — tuzemská výstupní plnění, plátce (ISSUED, STANDARD). */
  a4_base: Decimal
  a4_dan: Decimal
  /** B.1 — PDP odběratel, samovyměření (RECEIVED, REVERSE_CHARGE). */
  b1_base: Decimal
  b1_dan: Decimal
  /** B.2/B.3 — tuzemská vstupní plnění, odpočet (RECEIVED, STANDARD). */
  b2_base: Decimal
  b2_dan: Decimal
}

export interface Dph {
  type: "VAT_RETURN"
  rows: DphRows
  kh: KontrolniHlaseniTotals
  completeness: VatEvidenceCompleteness
}

/**
 * A statutory filing scope can cross accounting-period boundaries. The
 * ACCOUNTING_PERIOD scope remains for the period-scoped public read model.
 */
export async function buildDph(
  db: RowExecutor,
  scope: VatEvidenceScope,
): Promise<Dph> {
  const predicates = vatEvidencePredicates(
    scope,
    sql`s.period_id`,
    sql`s.tax_point_date`,
    sql`s.received_date`,
  )
  const classification = vatClassificationPredicates({
    documentType: sql`type`,
    mode: sql`vat_mode`,
    jurisdiction: sql`vat_jurisdiction`,
    supplyKind: sql`supply_kind`,
  })
  const [r, completeness] = await Promise.all([
    one<DphRows & KontrolniHlaseniTotals>(
      db,
      sql`
      WITH p AS (
        SELECT s.type,
               pr.vat_mode,
               pr.vat_rate,
               pr.vat_jurisdiction,
               pr.supply_kind,
               pr.vat_deductible,
               (${predicates.taxPoint}) AS tax_point_in_scope,
               (${predicates.deduction}) AS deduction_in_scope,
               pr.base_in_accounting_currency AS base,
               pr.vat_in_accounting_currency  AS dan,
               round(pr.base_in_accounting_currency * COALESCE(pr.vat_rate, 0) / 100, 2) AS self_assessed_dan
          FROM partial_record pr
          JOIN individual_record ir ON ir.id = pr.individual_record_id
          JOIN summary_record s     ON s.id = ir.summary_record_id
         WHERE ${predicates.candidate}
      )
      SELECT
        -- ř.1/2 — ISSUED, STANDARD, 21%/12%
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r1_base,
        COALESCE(SUM(dan)  FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r1_dan,
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r2_base,
        COALESCE(SUM(dan)  FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r2_dan,

        -- ř.3/4 — RECEIVED, REVERSE_CHARGE, EU acquisition of GOODS (§16), 21%/12% (samovyměření).
        --         Only explicit GOODS evidence is classified as §16.
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'GOODS' AND vat_rate = 21), 0)::numeric(19,4) AS r3_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'GOODS' AND vat_rate = 21), 0)::numeric(19,4) AS r3_dan,
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'GOODS' AND vat_rate = 12), 0)::numeric(19,4) AS r4_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'GOODS' AND vat_rate = 12), 0)::numeric(19,4) AS r4_dan,

        -- ř.5/6 — RECEIVED, REVERSE_CHARGE, EU receipt of a SERVICE with place of supply §9/1, 21%/12% (samovyměření).
        --         supply_kind = 'SERVICES' splits these out of ř.3/4 (goods).
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'SERVICES' AND vat_rate = 21), 0)::numeric(19,4) AS r5_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'SERVICES' AND vat_rate = 21), 0)::numeric(19,4) AS r5_dan,
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'SERVICES' AND vat_rate = 12), 0)::numeric(19,4) AS r6_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND supply_kind = 'SERVICES' AND vat_rate = 12), 0)::numeric(19,4) AS r6_dan,

        -- ř.10/11 — RECEIVED, REVERSE_CHARGE, domestic PDP §92e (jurisdiction ≠ EU; NULL legacy lands here), 21%/12%
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 21), 0)::numeric(19,4) AS r10_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 21), 0)::numeric(19,4) AS r10_dan,
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 12), 0)::numeric(19,4) AS r11_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 12), 0)::numeric(19,4) AS r11_dan,

        -- ř.20 — ISSUED, REVERSE_CHARGE, EU delivery of GOODS (§64), osvobozeno s nárokem: základ only, no daň.
        --        Shared ISSUED_EU_SUPPLY predicate (identical to the souhrnné hlášení gate, so SH ≡ ř.20+ř.21).
        --        Only explicit GOODS evidence is classified as §64.
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND ${ISSUED_EU_SUPPLY_DPH} AND supply_kind = 'GOODS'), 0)::numeric(19,4) AS r20_base,

        -- ř.21 — ISSUED, REVERSE_CHARGE, EU supply of a SERVICE with place of supply §9/1: základ only, no daň.
        --        supply_kind = 'SERVICES' splits these out of ř.20 (goods).
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND ${ISSUED_EU_SUPPLY_DPH} AND supply_kind = 'SERVICES'), 0)::numeric(19,4) AS r21_base,

        -- ř.22 — ISSUED, EXEMPT, export of goods to a third country (§66): základ only, no daň.
        --        vat_jurisdiction = 'IMPORT' marks the export side (mirrors 'EU' marking both EU
        --        acquisition/delivery). Osvobozeno s nárokem na odpočet; never SH or KH. [#566]
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND ${classification.issuedExport}), 0)::numeric(19,4) AS r22_base,

        -- ř.25 — ISSUED, domestic §92 PDP dodavatel: základ only, daň odvádí odběratel.
        -- [#516/#541] jurisdiction IS DISTINCT FROM 'EU' — an EU-marked issued reverse-charge
        -- supply (§64 goods → ř.20 / §9(1) service → ř.21) is NOT a domestic §92 PDP supply; it is
        -- osvobozené s nárokem (ř.20/21) + Souhrnné hlášení, never ř.25.
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU'), 0)::numeric(19,4) AS r25_base,

        -- ř.40/41 — RECEIVED, STANDARD, 21%/12% (odpočet)
        COALESCE(SUM(base) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r40_base,
        COALESCE(SUM(dan)  FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r40_dan,
        COALESCE(SUM(base) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r41_base,
        COALESCE(SUM(dan)  FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r41_dan,

        -- ř.43/44 — deductible input of the samovyměření (PDP/EU), vat_deductible = true
        COALESCE(SUM(base)              FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence} AND vat_deductible AND vat_rate = 21), 0)::numeric(19,4) AS r43_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence} AND vat_deductible AND vat_rate = 21), 0)::numeric(19,4) AS r43_dan,
        COALESCE(SUM(base)              FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence} AND vat_deductible AND vat_rate = 12), 0)::numeric(19,4) AS r44_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence} AND vat_deductible AND vat_rate = 12), 0)::numeric(19,4) AS r44_dan,

        -- ř.50 — EXEMPT, both sides. [#541] belt-and-braces: exclude vat_jurisdiction 'EU'
        -- so an EXEMPT+EU row can never masquerade as §51 exempt-without-deduction here
        -- (unreachable once the capture guard + REVERSE_CHARGE normalization land, but defends
        -- any future/legacy EXEMPT+EU from double-counting against the ř.20/21 osvobozeno-s-nárokem).
        -- [#566] Same guard for 'IMPORT' — an EXEMPT+IMPORT row is a §66 export (ř.22,
        -- osvobozeno S nárokem), never §51 exempt-WITHOUT-deduction; excluding it here
        -- keeps it from poisoning the §76 krácení koeficient denominator.
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND vat_mode = 'EXEMPT' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_jurisdiction IS DISTINCT FROM 'IMPORT'), 0)::numeric(19,4) AS r50_base,

        -- totals: daň na výstupu / odpočet (incl. deductible samovyměření) / vlastní daň
        (COALESCE(SUM(dan)              FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE'   AND vat_mode = 'STANDARD'),      0)
          + COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence}), 0)
        )::numeric(19,4) AS dan_na_vystupu,
        (COALESCE(SUM(dan) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)
          + COALESCE(SUM(self_assessed_dan) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence} AND vat_deductible), 0)
        )::numeric(19,4) AS odpocet,
        (
          (COALESCE(SUM(dan)              FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE'   AND vat_mode = 'STANDARD'),      0)
            + COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence}), 0))
          - (COALESCE(SUM(dan) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)
            + COALESCE(SUM(self_assessed_dan) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND ${classification.supportedDapEvidence} AND vat_deductible), 0))
        )::numeric(19,4) AS vlastni_dan,

        -- kontrolní hlášení — section totals (no per-counterparty breakdown; see module doc)
        -- [#516] A.1 checksum mirrors the row-level A.1 filter (kontrolni-hlaseni.ts):
        -- domestic §92 PDP only (jurisdiction IS DISTINCT FROM 'EU'), so the two A.1
        -- numbers on the same filed KH agree; EU-marked issued RC is SH-only.
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU'), 0)::numeric(19,4) AS a1_base,
        0::numeric(19,4) AS a1_dan,
        COALESCE(SUM(base) FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS a4_base,
        COALESCE(SUM(dan)  FILTER (WHERE tax_point_in_scope AND type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS a4_dan,
        COALESCE(SUM(base)              FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)::numeric(19,4) AS b1_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE tax_point_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)::numeric(19,4) AS b1_dan,
        COALESCE(SUM(base) FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS b2_base,
        COALESCE(SUM(dan)  FILTER (WHERE deduction_in_scope AND type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS b2_dan
      FROM p`,
    ),
    getVatEvidenceCompleteness(db, scope, "DAP"),
  ])

  const {
    a1_base,
    a1_dan,
    a4_base,
    a4_dan,
    b1_base,
    b1_dan,
    b2_base,
    b2_dan,
    ...rows
  } = r

  return {
    type: "VAT_RETURN",
    rows,
    kh: { a1_base, a1_dan, a4_base, a4_dan, b1_base, b1_dan, b2_base, b2_dan },
    completeness,
  }
}
