import type { BetaPayrollContractType } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Mzdy display labels — the enum-to-Czech-string map for `payroll_employee`'s
 * `contract_type`, mirroring `lib/loan-labels.ts`. Extracted out of
 * `mzdy/zamestnanci/page.tsx` (where it started as a page-local const) once a
 * second consumer — `employee-fields.tsx`'s contract-type `<select>` — needed
 * the same map: one enum, one label source.
 *
 * `satisfies Record<...>` makes a new enum value a compile error here rather
 * than a blank cell in the Zaměstnanci table or the entry form.
 */
export const PAYROLL_CONTRACT_TYPE_LABEL_KEY = {
  hpp: "mzdy.contractHpp",
  dpc: "mzdy.contractDpc",
  dpp: "mzdy.contractDpp",
} as const satisfies Record<BetaPayrollContractType, BetaMessageKey>
