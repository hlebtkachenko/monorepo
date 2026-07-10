import { sql } from "drizzle-orm"
import { executeRows, type AdminBypassDb } from "@workspace/db"
import type { RowExecutor } from "../sql"
import type { VatEvidenceScope } from "../types"
import type { VatPeriodActivity } from "../obligations/obligations"
import { vatClassificationPredicates } from "./vat-classification"
import { vatEvidencePredicates } from "./vat-evidence-scope"

/** Project captured VAT facts into the monthly evidence consumed by schedules. */
export function getVatPeriodActivity(
  db: AdminBypassDb,
  scope: VatEvidenceScope,
  organizationId: string,
): Promise<VatPeriodActivity[]>
export function getVatPeriodActivity(
  db: RowExecutor,
  scope: VatEvidenceScope,
  organizationId?: string,
): Promise<VatPeriodActivity[]>
export async function getVatPeriodActivity(
  db: RowExecutor | AdminBypassDb,
  scope: VatEvidenceScope,
  organizationId?: string,
): Promise<VatPeriodActivity[]> {
  const evidence = vatEvidencePredicates(
    scope,
    sql`sr.period_id`,
    sql`sr.tax_point_date`,
    sql`sr.received_date`,
  )
  const classification = vatClassificationPredicates({
    documentType: sql`sr.type`,
    mode: sql`pr.vat_mode`,
    jurisdiction: sql`pr.vat_jurisdiction`,
    supplyKind: sql`pr.supply_kind`,
  })
  const deductionDated = sql`sr.type = 'RECEIVED_INVOICE' AND pr.vat_mode = 'STANDARD'`
  const activityDate = sql`CASE
    WHEN ${deductionDated} THEN GREATEST(sr.tax_point_date, sr.received_date)
    ELSE sr.tax_point_date
  END`
  const inScope = sql`(
    (${deductionDated} AND ${evidence.deduction})
    OR (NOT (${deductionDated}) AND ${evidence.taxPoint})
  )`

  return executeRows<VatPeriodActivity>(
    db,
    sql`
      SELECT to_char(date_trunc('month', ${activityDate}), 'YYYY-MM') AS month,
             bool_or(${classification.khReportable}) AS "hasKhReportableTransactions",
             bool_or(${classification.issuedEuGoods}) AS "hasShGoodsSupplies",
             bool_or(${classification.issuedEuServices}) AS "hasShServiceSupplies",
             bool_or(${classification.identifiedPersonVatLiability}) AS "hasIdentifiedPersonVatLiability"
        FROM partial_record pr
        JOIN individual_record ir ON ir.id = pr.individual_record_id
        JOIN summary_record sr ON sr.id = ir.summary_record_id
       WHERE ${inScope}
         AND (${organizationId ?? null}::uuid IS NULL OR sr.organization_id = ${organizationId ?? null}::uuid)
       GROUP BY date_trunc('month', ${activityDate})
       ORDER BY date_trunc('month', ${activityDate})`,
  )
}
