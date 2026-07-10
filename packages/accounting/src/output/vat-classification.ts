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
  const supportedDapEvidence = sql`${jurisdiction} IS DISTINCT FROM 'EU' OR ${supplyKind} IN ('GOODS', 'SERVICES')`

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
