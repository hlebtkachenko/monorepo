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
 * Přiznání rows covered (§ ZDPH references in comments below):
 *   ř.1/2   dodání zboží/služeb, plátce, 21%/12%  (ISSUED, STANDARD)
 *   ř.3/4   pořízení zboží z JČS — samovyměření 21%/12% (RECEIVED, REVERSE_CHARGE,
 *           vat_jurisdiction = 'EU', §16)
 *   ř.10/11 PDP odběratel — samovyměření 21%/12%  (RECEIVED, REVERSE_CHARGE,
 *           domestic §92e — vat_jurisdiction ≠ 'EU')
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
 * by the split — only the form line differs. Remaining sub-split (ř.5/6 EU
 * SERVICES §9 vs ř.3/4 EU GOODS §16) needs the supply kind on the captured fact,
 * not just the jurisdiction — a documented follow-up.
 *
 * Kontrolní hlášení: this module returns SECTION TOTALS only (A.1, A.4/A.5, B.1,
 * B.2/B.3) as a period-level checksum against the přiznání. The row-level,
 * per-counterparty KH the tenant actually files (DIČ + doklad + DPPD) lives in
 * kontrolni-hlaseni.ts (buildKontrolniHlaseni), §101c-101i.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface DphRows {
  /** ř.1 — dodání zboží/služeb, plátce, 21 % (§13/§14). */
  r1_base: Decimal
  r1_dan: Decimal
  /** ř.2 — dodání zboží/služeb, plátce, 12 % (§13/§14, §47). */
  r2_base: Decimal
  r2_dan: Decimal
  /**
   * ř.3/4 — pořízení zboží z jiného členského státu, samovyměření 21 %/12 %
   * (§16). RECEIVED + REVERSE_CHARGE + vat_jurisdiction = 'EU'.
   */
  r3_base: Decimal
  r3_dan: Decimal
  r4_base: Decimal
  r4_dan: Decimal
  /**
   * ř.10/11 — PDP odběratel, samovyměření 21 %/12 % (§92e). Domestic reverse
   * charge only: RECEIVED + REVERSE_CHARGE with vat_jurisdiction ≠ 'EU' (a
   * legacy NULL also lands here). EU acquisitions are split out to ř.3/4.
   */
  r10_base: Decimal
  r10_dan: Decimal
  r11_base: Decimal
  r11_dan: Decimal
  /** ř.25 — PDP dodavatel (§92a): základ only, daň 0 (odvádí odběratel). */
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
   * output daň on the received side (r3+r4 EU acquisition + r10+r11 domestic PDP).
   * The self-assessed half is net-neutral against ř.43/44, so vlastní daň is
   * unaffected by the EU/domestic split.
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
}

export async function buildDph(
  db: RowExecutor,
  periodId: string,
): Promise<Dph> {
  const r = await one<DphRows & KontrolniHlaseniTotals>(
    db,
    sql`
      WITH p AS (
        SELECT s.type,
               pr.vat_mode,
               pr.vat_rate,
               pr.vat_jurisdiction,
               pr.vat_deductible,
               pr.base_in_accounting_currency AS base,
               pr.vat_in_accounting_currency  AS dan,
               round(pr.base_in_accounting_currency * COALESCE(pr.vat_rate, 0) / 100, 2) AS self_assessed_dan
          FROM partial_record pr
          JOIN individual_record ir ON ir.id = pr.individual_record_id
          JOIN summary_record s     ON s.id = ir.summary_record_id
         WHERE s.period_id = ${periodId}::uuid
      )
      SELECT
        -- ř.1/2 — ISSUED, STANDARD, 21%/12%
        COALESCE(SUM(base) FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r1_base,
        COALESCE(SUM(dan)  FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r1_dan,
        COALESCE(SUM(base) FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r2_base,
        COALESCE(SUM(dan)  FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r2_dan,

        -- ř.3/4 — RECEIVED, REVERSE_CHARGE, EU acquisition (§16), 21%/12% (samovyměření)
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND vat_rate = 21), 0)::numeric(19,4) AS r3_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND vat_rate = 21), 0)::numeric(19,4) AS r3_dan,
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND vat_rate = 12), 0)::numeric(19,4) AS r4_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction = 'EU' AND vat_rate = 12), 0)::numeric(19,4) AS r4_dan,

        -- ř.10/11 — RECEIVED, REVERSE_CHARGE, domestic PDP §92e (jurisdiction ≠ EU; NULL legacy lands here), 21%/12%
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 21), 0)::numeric(19,4) AS r10_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 21), 0)::numeric(19,4) AS r10_dan,
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 12), 0)::numeric(19,4) AS r11_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU' AND vat_rate = 12), 0)::numeric(19,4) AS r11_dan,

        -- ř.25 — ISSUED, REVERSE_CHARGE (PDP dodavatel): základ only, daň odvádí odběratel
        COALESCE(SUM(base) FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)::numeric(19,4) AS r25_base,

        -- ř.40/41 — RECEIVED, STANDARD, 21%/12% (odpočet)
        COALESCE(SUM(base) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r40_base,
        COALESCE(SUM(dan)  FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 21), 0)::numeric(19,4) AS r40_dan,
        COALESCE(SUM(base) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r41_base,
        COALESCE(SUM(dan)  FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD' AND vat_rate = 12), 0)::numeric(19,4) AS r41_dan,

        -- ř.43/44 — deductible input of the samovyměření (PDP/EU), vat_deductible = true
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_deductible AND vat_rate = 21), 0)::numeric(19,4) AS r43_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_deductible AND vat_rate = 21), 0)::numeric(19,4) AS r43_dan,
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_deductible AND vat_rate = 12), 0)::numeric(19,4) AS r44_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_deductible AND vat_rate = 12), 0)::numeric(19,4) AS r44_dan,

        -- ř.50 — EXEMPT, both sides
        COALESCE(SUM(base) FILTER (WHERE vat_mode = 'EXEMPT'), 0)::numeric(19,4) AS r50_base,

        -- totals: daň na výstupu / odpočet (incl. deductible samovyměření) / vlastní daň
        (COALESCE(SUM(dan)              FILTER (WHERE type = 'ISSUED_INVOICE'   AND vat_mode = 'STANDARD'),      0)
          + COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)
        )::numeric(19,4) AS dan_na_vystupu,
        (COALESCE(SUM(dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)
          + COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_deductible), 0)
        )::numeric(19,4) AS odpocet,
        (
          (COALESCE(SUM(dan)              FILTER (WHERE type = 'ISSUED_INVOICE'   AND vat_mode = 'STANDARD'),      0)
            + COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0))
          - (COALESCE(SUM(dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)
            + COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE' AND vat_deductible), 0))
        )::numeric(19,4) AS vlastni_dan,

        -- kontrolní hlášení — section totals (no per-counterparty breakdown; see module doc)
        COALESCE(SUM(base) FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)::numeric(19,4) AS a1_base,
        0::numeric(19,4) AS a1_dan,
        COALESCE(SUM(base) FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS a4_base,
        COALESCE(SUM(dan)  FILTER (WHERE type = 'ISSUED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS a4_dan,
        COALESCE(SUM(base)              FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)::numeric(19,4) AS b1_base,
        COALESCE(SUM(self_assessed_dan) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'REVERSE_CHARGE'), 0)::numeric(19,4) AS b1_dan,
        COALESCE(SUM(base) FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS b2_base,
        COALESCE(SUM(dan)  FILTER (WHERE type = 'RECEIVED_INVOICE' AND vat_mode = 'STANDARD'), 0)::numeric(19,4) AS b2_dan
      FROM p`,
  )

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
  }
}
