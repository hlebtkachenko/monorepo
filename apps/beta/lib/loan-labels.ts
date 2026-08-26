import type { BetaLoanInstallmentPeriod, BetaLoanKind } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Úvěry a leasingy display labels — the enum-to-Czech-string maps for
 * `lib/data/loans.ts` views, mirroring `lib/asset-labels.ts`.
 *
 * `satisfies Record<...>` makes a new enum value a compile error here rather
 * than a blank cell in the Úvěry table.
 */

export const LOAN_KIND_LABEL_KEY = {
  loan: "uvery.kindLoan",
  lease: "uvery.kindLease",
  overdraft: "uvery.kindOverdraft",
} as const satisfies Record<BetaLoanKind, BetaMessageKey>

export const LOAN_INSTALLMENT_PERIOD_LABEL_KEY = {
  monthly: "uvery.periodMonthly",
  quarterly: "uvery.periodQuarterly",
  semiannual: "uvery.periodSemiannual",
  annual: "uvery.periodAnnual",
} as const satisfies Record<BetaLoanInstallmentPeriod, BetaMessageKey>
