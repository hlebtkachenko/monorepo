import { sql, type SQL } from "drizzle-orm"
import type { VatEvidenceScope } from "../types"

export interface VatEvidencePredicates {
  taxPoint: SQL
  deduction: SQL
  candidate: SQL
}

/** Build canonical tax-point and input-deduction predicates for one scope. */
export function vatEvidencePredicates(
  scope: VatEvidenceScope,
  periodId: SQL,
  taxPointDate: SQL,
  receivedDate: SQL,
): VatEvidencePredicates {
  const taxPoint =
    scope.kind === "ACCOUNTING_PERIOD"
      ? sql`${taxPointDate} IS NOT NULL AND ${periodId} = ${scope.periodId}::uuid`
      : sql`${taxPointDate} >= ${scope.period.from}::date AND ${taxPointDate} <= ${scope.period.to}::date`
  const deduction =
    scope.kind === "ACCOUNTING_PERIOD"
      ? sql`${taxPointDate} IS NOT NULL AND ${receivedDate} IS NOT NULL AND ${periodId} = ${scope.periodId}::uuid`
      : sql`${receivedDate} IS NOT NULL AND GREATEST(${taxPointDate}, ${receivedDate}) >= ${scope.period.from}::date AND GREATEST(${taxPointDate}, ${receivedDate}) <= ${scope.period.to}::date`

  return {
    taxPoint,
    deduction,
    candidate: sql`(${taxPoint}) OR (${deduction})`,
  }
}
