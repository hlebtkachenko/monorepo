import "server-only"

import type { BetaLoanInstallmentPeriod, BetaLoanKind } from "@/db/schema"

/**
 * Reading a `FormData` at the Úvěry write boundary. Mirrors
 * `majetek/_actions/input.ts`: every closed-list value arrives as a string and
 * leaves as a value from the list or `null` — a `<select>` is a suggestion to a
 * browser, not a constraint on a POST — and there is no cast anywhere in the
 * action layer.
 */

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/** Empty input reads as "not provided", the shape every optional column takes. */
export function formOptionalString(
  formData: FormData,
  key: string,
): string | null {
  const value = formString(formData, key)
  return value.length === 0 ? null : value
}

const LOAN_KINDS: readonly BetaLoanKind[] = ["loan", "lease", "overdraft"]

export function formLoanKind(
  formData: FormData,
  key: string,
): BetaLoanKind | null {
  const value = formString(formData, key)
  return LOAN_KINDS.find((kind) => kind === value) ?? null
}

const INSTALLMENT_PERIODS: readonly BetaLoanInstallmentPeriod[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]

/**
 * `undefined` distinguishes "a value was posted and it is not on the list" from
 * "nothing was posted" — the first is a refusal, the second is an empty
 * frequency, which is legitimate for a kontokorent.
 */
export function formInstallmentPeriod(
  formData: FormData,
  key: string,
): BetaLoanInstallmentPeriod | null | undefined {
  const value = formString(formData, key)
  if (value.length === 0) return null
  return INSTALLMENT_PERIODS.find((period) => period === value)
}

/** `YYYY-MM-DD`, the shape a `<input type="date">` posts and `date` stores. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function formDate(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return ISO_DATE.test(value) ? value : null
}

/**
 * `numeric(14,2)` syntax (spec §0.7): an optional sign, up to 12 integer
 * digits, an optional 1-2 digit fraction. Postgres is the authority on the
 * column's actual precision and range (`loan_principal_nonnegative` etc.) —
 * this is a syntax gate only, so a malformed string is an ordinary form refusal
 * rather than a driver error surfacing as a 500.
 */
const MONEY = /^-?\d{1,12}(\.\d{1,2})?$/

export function formMoney(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return MONEY.test(value) ? value : null
}

/** Same shape as `formMoney`, but empty input is "not provided", not a refusal. */
export function formOptionalMoney(
  formData: FormData,
  key: string,
): string | null | undefined {
  const raw = formString(formData, key)
  if (raw.length === 0) return null
  return MONEY.test(raw) ? raw : undefined
}

/**
 * `numeric(6,3)` syntax — a PERCENT, not money and not a fraction: up to three
 * integer digits and three decimals, so `4.125` survives verbatim as 4,125 %.
 * The 0-100 range itself is `loan_interest_rate_range`'s job.
 */
const RATE = /^\d{1,3}(\.\d{1,3})?$/

export function formOptionalRate(
  formData: FormData,
  key: string,
): string | null | undefined {
  const raw = formString(formData, key)
  if (raw.length === 0) return null
  return RATE.test(raw) ? raw : undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}
