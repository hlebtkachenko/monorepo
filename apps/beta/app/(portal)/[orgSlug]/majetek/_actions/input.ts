import "server-only"

import type { BetaAssetCategory, BetaAssetEventKind } from "@/db/schema"

/**
 * Reading a `FormData` at the Majetek write boundary. Mirrors
 * `app/admin/_actions/input.ts`: every closed-list value arrives as a string
 * and leaves as a value from the list or `null` — a `<select>` is a
 * suggestion to a browser, not a constraint on a POST — and there is no cast
 * anywhere in the action layer.
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

/** Checkbox semantics: present means true. */
export function formChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true"
}

const ASSET_CATEGORIES: readonly BetaAssetCategory[] = [
  "machine",
  "vehicle",
  "tool",
  "real_estate",
  "other",
]

export function formAssetCategory(
  formData: FormData,
  key: string,
): BetaAssetCategory | null {
  const value = formString(formData, key)
  return ASSET_CATEGORIES.find((category) => category === value) ?? null
}

const ASSET_EVENT_KINDS: readonly BetaAssetEventKind[] = [
  "put_into_service",
  "improvement",
  "disposal",
]

export function formAssetEventKind(
  formData: FormData,
  key: string,
): BetaAssetEventKind | null {
  const value = formString(formData, key)
  return ASSET_EVENT_KINDS.find((kind) => kind === value) ?? null
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
 * column's actual precision and range (`asset_acquisition_cost_nonnegative`
 * etc.) — this is a syntax gate only, so a malformed string is an ordinary
 * form refusal rather than a driver error surfacing as a 500.
 */
const MONEY = /^-?\d{1,12}(\.\d{1,2})?$/

/**
 * Czech-written money in, `numeric` syntax out.
 *
 * THE FORM USED TO REFUSE ITS OWN DISPLAY FORMAT. Every amount in Majetek is
 * rendered through `format.number(value, "currency")`, which emits Czech
 * grouping — `650 000,00 Kč` — while the gate above accepts only
 * `650000.00`. A client who read a figure off the Přehled and typed it back
 * got "Neplatný vstup." with nothing on screen explaining which character was
 * wrong, and `inputMode="decimal"` on a `cs` keyboard offers a comma, not a
 * dot. So the separators are normalised here, before the gate, rather than the
 * gate being loosened: what reaches Postgres is still exactly `numeric(14,2)`
 * syntax.
 *
 * `\s` is the right class rather than a literal " ": it already covers U+00A0
 * and U+202F, and those — not the ASCII space — are what
 * `Intl.NumberFormat("cs-CZ")` actually puts between groups, so they are what
 * lands in the field on a copy-paste off the Přehled.
 *
 * DELIBERATELY NOT NORMALISED: a lone `.` stays a decimal point. `1.234` is
 * ambiguous (1234 written Czech-style, or 1.234 written with three decimals)
 * and is left to fail the gate as before — an ambiguous amount is a refusal
 * the client can see and correct, never a guess this layer makes on their
 * behalf. Dots are treated as grouping only when a comma proves they were
 * (`1.234,56`).
 */
function normalizeMoney(value: string): string {
  const ungrouped = value.replace(/\s/g, "")
  if (!ungrouped.includes(",")) return ungrouped
  return ungrouped.replace(/\./g, "").replace(",", ".")
}

export function formMoney(formData: FormData, key: string): string | null {
  const value = normalizeMoney(formString(formData, key))
  return MONEY.test(value) ? value : null
}

/** Same shape as `formMoney`, but empty input is "not provided", not a refusal. */
export function formOptionalMoney(
  formData: FormData,
  key: string,
): string | null | undefined {
  const raw = formString(formData, key)
  if (raw.length === 0) return null
  const value = normalizeMoney(raw)
  return MONEY.test(value) ? value : undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}
