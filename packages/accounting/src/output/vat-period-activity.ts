import { sql } from "drizzle-orm"
import { rows, type RowExecutor } from "../sql"
import type { VatEvidenceScope } from "../types"
import type { VatPeriodActivity } from "../obligations/obligations"
import { vatClassificationPredicates } from "./vat-classification"
import { vatEvidencePredicates } from "./vat-evidence-scope"

/** Project captured VAT facts into the monthly evidence consumed by schedules. */
export async function getVatPeriodActivity(
  db: RowExecutor,
  scope: VatEvidenceScope,
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

  return rows<VatPeriodActivity>(
    db,
    sql`
      SELECT to_char(date_trunc('month', sr.tax_point_date), 'YYYY-MM') AS month,
             bool_or(${classification.khReportable}) AS "hasKhReportableTransactions",
             bool_or(${classification.issuedEuGoods}) AS "hasShGoodsSupplies",
             bool_or(${classification.issuedEuServices}) AS "hasShServiceSupplies",
             bool_or(${classification.identifiedPersonVatLiability}) AS "hasIdentifiedPersonVatLiability"
        FROM partial_record pr
        JOIN individual_record ir ON ir.id = pr.individual_record_id
        JOIN summary_record sr ON sr.id = ir.summary_record_id
       WHERE ${evidence.taxPoint}
       GROUP BY date_trunc('month', sr.tax_point_date)
       ORDER BY date_trunc('month', sr.tax_point_date)`,
  )
}
