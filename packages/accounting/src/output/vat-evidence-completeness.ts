import { sql } from "drizzle-orm"
import { one, type RowExecutor } from "../sql"
import type { VatEvidenceScope } from "../types"

export interface VatEvidenceCompleteness {
  status: "COMPLETE" | "NEEDS_INPUT"
  missingTaxPointDocuments: number
  missingReceivedDateDocuments: number
}

export type VatArtifactKind = "DAP" | "KH" | "SH"

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
      ? sql`sr.period_id = ${scope.periodId}::uuid`
      : sql`sr.tax_point_date >= ${scope.period.from}::date AND sr.tax_point_date <= ${scope.period.to}::date`
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
  const counts = await one<{
    missing_tax_point_documents: number
    missing_received_date_documents: number
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
                 AND ${receiptRelevant}
                 AND ${receiptRequired}
             )::int AS missing_received_date_documents
        FROM summary_record sr`,
  )
  const missingTaxPointDocuments = counts.missing_tax_point_documents
  const missingReceivedDateDocuments = counts.missing_received_date_documents
  return {
    status:
      missingTaxPointDocuments > 0 || missingReceivedDateDocuments > 0
        ? "NEEDS_INPUT"
        : "COMPLETE",
    missingTaxPointDocuments,
    missingReceivedDateDocuments,
  }
}
