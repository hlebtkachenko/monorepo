import "server-only"

import {
  betaPayrollContractType,
  type BetaPayrollContractType,
} from "@/db/schema"

/**
 * Reading a `FormData` at Mzdy's write boundary. Mirrors `finance/uvery/_actions/input.ts`:
 * every closed-list value arrives as a string and leaves as a value from the
 * list or `null`, and there is no cast anywhere in the action layer.
 *
 * `formString` and `formUuid` were previously duplicated inline inside
 * `employee-seat.ts` (that file's own comment explained why — each write
 * boundary declares which fields it reads). This module is that same
 * boundary now shared by a SECOND action file in the SAME module
 * (`employees.ts`), so the two readers move here rather than tripling: the
 * "no cross-import" rule guards against one module reaching into another's
 * `_actions/`, not against a module sharing a reader with itself.
 */

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/** Empty input reads as "not provided" — an unstated nástup/ukončení date. */
export function formOptionalString(
  formData: FormData,
  key: string,
): string | null {
  const value = formString(formData, key)
  return value.length === 0 ? null : value
}

/**
 * Postgres answers a non-uuid `= $1` against a uuid column with 22P02, which
 * reaches the browser as a 500. A malformed id has to be an ordinary refusal.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function formUuid(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return UUID.test(value) ? value : null
}

/** `YYYY-MM-DD`, the shape a `<input type="date">` posts and `date` stores. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function formDate(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return ISO_DATE.test(value) ? value : null
}

export function formContractType(
  formData: FormData,
  key: string,
): BetaPayrollContractType | null {
  const value = formString(formData, key)
  return (
    betaPayrollContractType.enumValues.find((type) => type === value) ?? null
  )
}

/**
 * A two-valued choice posted as an explicit `"true"` / `"false"` string —
 * the Aktivní / Neaktivní select. "The field was missing" must never be
 * readable as `false`, the same discipline `pro-ucetni`'s own
 * `formBooleanChoice` states: a mis-read here would silently retire an
 * employee row.
 */
export function formBooleanChoice(
  formData: FormData,
  key: string,
): boolean | null {
  const value = formString(formData, key)
  if (value === "true") return true
  if (value === "false") return false
  return null
}
