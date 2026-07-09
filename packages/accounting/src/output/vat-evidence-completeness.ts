import { sql } from "drizzle-orm"
import { one, type RowExecutor } from "../sql"
import type { VatEvidenceScope } from "../types"

export interface VatEvidenceCompleteness {
  /** These builders are worksheets, not filing-ready statutory submissions. */
  status: "PARTIAL" | "NEEDS_INPUT"
  missingTaxPointDocuments: number
  missingReceivedDateDocuments: number
  missingClassificationDocuments: number
  limitations: readonly string[]
}

export type VatArtifactKind = "DAP" | "KH" | "SH"

const LIMITATIONS: Record<VatArtifactKind, readonly string[]> = {
  DAP: [
    "Only implemented VAT lines are calculated; adjustments, coefficients, imports, and other unsupported statutory lines require review.",
    "The result is not EPO/XML validated, signed, submitted, or accepted by the tax authority.",
  ],
  KH: [
    "Counterparty identity, correction status, and unsupported KH classifications require review.",
    "The result is not EPO/XML validated, signed, submitted, or accepted by the tax authority.",
  ],
  SH: [
    "Only explicitly classified goods and services are included; transfers of own goods, triangular transactions, and unclassified supplies are unsupported.",
    "The result is not EPO/XML validated, signed, submitted, or accepted by the tax authority.",
  ],
}

/** Count missing legal-date evidence that can affect the requested scope. */
export async function getVatEvidenceCompleteness(
  db: RowExecutor,
  scope: VatEvidenceScope,
  artifact: VatArtifactKind,
): Promise<VatEvidenceCompleteness> {
  const candidate =
    scope.kind === "ACCOUNTING_PERIOD"
      ? sql`sr.period_id = ${scope.periodId}::uuid`
      : sql`EXISTS (
          SELECT 1
            FROM accounting_period ap
           WHERE ap.id = sr.period_id
             AND ap.period_start <= ${scope.period.to}::date
             AND ap.period_end >= ${scope.period.from}::date
        )`
  const receiptRelevant =
    scope.kind === "ACCOUNTING_PERIOD"
      ? sql`true`
      : sql`sr.tax_point_date <= ${scope.period.to}::date`
  const taxRelevant =
    artifact === "SH"
      ? sql`sr.type = 'ISSUED_INVOICE' AND EXISTS (
          SELECT 1
            FROM individual_record ir
            JOIN partial_record pr ON pr.individual_record_id = ir.id
           WHERE ir.summary_record_id = sr.id
             AND pr.vat_mode = 'REVERSE_CHARGE'
             AND pr.vat_jurisdiction = 'EU'
        )`
      : artifact === "KH"
        ? sql`EXISTS (
            SELECT 1
              FROM individual_record ir
              JOIN partial_record pr ON pr.individual_record_id = ir.id
             WHERE ir.summary_record_id = sr.id
               AND pr.vat_mode IN ('STANDARD', 'REVERSE_CHARGE')
          )`
        : sql`EXISTS (
            SELECT 1
              FROM individual_record ir
              JOIN partial_record pr ON pr.individual_record_id = ir.id
             WHERE ir.summary_record_id = sr.id
               AND pr.vat_mode <> 'OUTSIDE_VAT'
          )`
  const receiptRequired =
    artifact === "SH"
      ? sql`false`
      : artifact === "KH"
        ? sql`EXISTS (
          SELECT 1
            FROM individual_record ir
            JOIN partial_record pr ON pr.individual_record_id = ir.id
           WHERE ir.summary_record_id = sr.id
             AND pr.vat_mode = 'STANDARD'
        )`
        : sql`EXISTS (
          SELECT 1
            FROM individual_record ir
            JOIN partial_record pr ON pr.individual_record_id = ir.id
           WHERE ir.summary_record_id = sr.id
             AND (
               pr.vat_mode = 'STANDARD'
               OR (pr.vat_mode = 'REVERSE_CHARGE' AND pr.vat_deductible)
             )
        )`
  const classificationRequired =
    artifact === "KH"
      ? sql`false`
      : artifact === "SH"
        ? sql`EXISTS (
            SELECT 1
              FROM individual_record ir
              JOIN partial_record pr ON pr.individual_record_id = ir.id
              JOIN accounting_event ae ON ae.id = ir.accounting_event_id
              LEFT JOIN counterparty cp ON cp.id = ae.counterparty_id
             WHERE ir.summary_record_id = sr.id
               AND pr.vat_mode = 'REVERSE_CHARGE'
               AND pr.vat_jurisdiction = 'EU'
               AND (
                 pr.supply_kind NOT IN ('GOODS', 'SERVICES')
                 OR pr.supply_kind IS NULL
                 OR cp.tax_id IS NULL
                 OR cp.country_code IS NULL
               )
          )`
        : sql`EXISTS (
            SELECT 1
              FROM individual_record ir
              JOIN partial_record pr ON pr.individual_record_id = ir.id
             WHERE ir.summary_record_id = sr.id
               AND pr.vat_mode = 'REVERSE_CHARGE'
               AND pr.vat_jurisdiction = 'EU'
               AND (
                 pr.supply_kind NOT IN ('GOODS', 'SERVICES')
                 OR pr.supply_kind IS NULL
               )
          )`
  const counts = await one<{
    missing_tax_point_documents: number
    missing_received_date_documents: number
    missing_classification_documents: number
  }>(
    db,
    sql`
      SELECT COUNT(*) FILTER (
               WHERE sr.type IN ('RECEIVED_INVOICE', 'ISSUED_INVOICE')
                 AND sr.tax_point_date IS NULL
                 AND ${candidate}
                 AND ${taxRelevant}
             )::int AS missing_tax_point_documents,
             COUNT(*) FILTER (
               WHERE sr.type = 'RECEIVED_INVOICE'
                 AND sr.received_date IS NULL
                 AND ${candidate}
                 AND ${receiptRelevant}
                 AND ${receiptRequired}
             )::int AS missing_received_date_documents,
             COUNT(*) FILTER (
               WHERE ${candidate}
                 AND ${classificationRequired}
             )::int AS missing_classification_documents
        FROM summary_record sr`,
  )
  const missingTaxPointDocuments = counts.missing_tax_point_documents
  const missingReceivedDateDocuments = counts.missing_received_date_documents
  const missingClassificationDocuments = counts.missing_classification_documents
  return {
    status:
      missingTaxPointDocuments > 0 ||
      missingReceivedDateDocuments > 0 ||
      missingClassificationDocuments > 0
        ? "NEEDS_INPUT"
        : "PARTIAL",
    missingTaxPointDocuments,
    missingReceivedDateDocuments,
    missingClassificationDocuments,
    limitations: LIMITATIONS[artifact],
  }
}
