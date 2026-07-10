import { sql, type SQL } from "drizzle-orm"

interface VatClassificationColumns {
  documentType: SQL
  mode: SQL
  jurisdiction: SQL
  supplyKind: SQL
}

/**
 * Canonical evidence predicates shared by VAT schedules and output builders.
 * KH applicability: §101c ZDPH. SH categories/cadence: §102 ZDPH, verified
 * 2026-07-09 against the Financial Administration guidance cited in ADR-0030.
 */
export function vatClassificationPredicates(columns: VatClassificationColumns) {
  const { documentType, mode, jurisdiction, supplyKind } = columns
  const issuedEuSupply = sql`${documentType} = 'ISSUED_INVOICE' AND ${mode} = 'REVERSE_CHARGE' AND ${jurisdiction} = 'EU'`
  const issuedEuGoods = sql`${issuedEuSupply} AND ${supplyKind} = 'GOODS'`
  const issuedEuServices = sql`${issuedEuSupply} AND ${supplyKind} = 'SERVICES'`
  /**
   * ISSUED export of goods to a third country (§66 ZDPH, DPH ř.22). "IMPORT"
   * jurisdiction marks a third-country supply on EITHER side (mirrors "EU"
   * marking both an EU acquisition and delivery); the ISSUED + EXEMPT pairing
   * is the export signature (the RECEIVED side self-assesses as vat_mode
   * IMPORT instead, scenario P-IMPORT). Osvobozeno s nárokem na odpočet — never
   * souhrnné hlášení (EU-only) or kontrolní hlášení (#566).
   */
  const issuedExport = sql`${documentType} = 'ISSUED_INVOICE' AND ${mode} = 'EXEMPT' AND ${jurisdiction} = 'IMPORT'`
  const khReportable = sql`(
    (${documentType} = 'ISSUED_INVOICE' AND ${mode} = 'STANDARD')
    OR (${documentType} = 'ISSUED_INVOICE' AND ${mode} = 'REVERSE_CHARGE' AND ${jurisdiction} IS DISTINCT FROM 'EU')
    OR (${documentType} = 'RECEIVED_INVOICE' AND ${mode} IN ('STANDARD', 'REVERSE_CHARGE'))
  )`
  const identifiedPersonVatLiability = sql`${documentType} = 'RECEIVED_INVOICE' AND ${mode} = 'REVERSE_CHARGE' AND ${jurisdiction} = 'EU'`
  // A received self-assessed supply is DAP-supported when it is NOT an EU
  // supply (domestic §92 PDP / §108 residual / import — routed by jurisdiction),
  // OR it is an EU supply whose kind is explicitly classified. [#540] RENT joins
  // GOODS/SERVICES here: a general-movable RENT from an EU lessor is a §9(1)
  // service (ř.5/6), so its self-assessed daň belongs in dan_na_vystupu / ř.43/44
  // (net-neutral). A §108 residual (jurisdiction 'SECTION_108') is already
  // supported via `IS DISTINCT FROM 'EU'`.
  //
  // MUST stay parenthesized: this fragment is spliced into FILTER (WHERE … AND
  // ${supportedDapEvidence} AND vat_deductible AND vat_rate = N). Without the
  // wrapping parens the inner OR would bind looser than the surrounding ANDs and
  // orphan the trailing `AND vat_rate = N` / `AND vat_deductible` onto the second
  // disjunct — a jurisdiction-distinct-from-'EU' row (domestic §92 PDP, §108
  // residual) would then leak across rate buckets (ř.43 ↔ ř.44) and past the
  // deductibility gate. [#540]
  const supportedDapEvidence = sql`(${jurisdiction} IS DISTINCT FROM 'EU' OR ${supplyKind} IN ('GOODS', 'SERVICES', 'RENT'))`

  return {
    issuedEuSupply,
    issuedEuGoods,
    issuedEuServices,
    issuedExport,
    khReportable,
    identifiedPersonVatLiability,
    supportedDapEvidence,
  }
}
