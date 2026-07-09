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
    khReportable,
    identifiedPersonVatLiability,
    supportedDapEvidence,
  }
}
