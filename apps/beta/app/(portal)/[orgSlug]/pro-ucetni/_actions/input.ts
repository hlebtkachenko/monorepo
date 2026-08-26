import "server-only"

import {
  BETA_CLIENT_DOCUMENT_TYPES,
  betaAccountKind,
  betaAccountMatchKind,
  betaClientTaskLinkKind,
  type BetaAccountKind,
  type BetaAccountMatchKind,
  type BetaClientDocumentType,
  type BetaClientTaskLinkKind,
  type BetaFilingKind,
  type BetaFilingStatus,
  type BetaObligationGroup,
  type BetaPeriodKind,
} from "@/db/schema"
import { MANUAL_OBLIGATION_GROUPS } from "@/lib/obligation-labels"

/**
 * Reading a `FormData` at the Pro účetní boundary — the org-tier twin of
 * `app/admin/_actions/input.ts`.
 *
 * Copied rather than imported: `app/admin/_actions/` is a PRIVATE folder
 * (`_actions`) inside the office-only `/admin` route tree, and cross-importing
 * a private folder from a sibling route group is the kind of coupling that
 * turns an unrelated admin refactor into a Pro účetní regression. Every one of
 * these functions is pure and small; duplication is the cheaper failure mode,
 * the same call `lib/role-labels.ts` makes against `admin/_components/labels.ts`.
 *
 * Same discipline as the admin file: every enum arrives as a string and
 * leaves as a value from a closed list or `null` — a `<select>` is a
 * suggestion to a browser, not a constraint on a POST, so there is no cast
 * anywhere in the action layer and an unrecognised value is a refusal rather
 * than a Postgres error about an invalid enum literal.
 */

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/** Checkbox semantics: present means true, absent means false. */
export function formChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true"
}

/**
 * A trimmed string, or `null` for an empty one — the reading the edit-mode
 * sheet's textareas and text inputs share (office_message, internal_note,
 * site_ref, the raw text of document_date and amount before their own
 * format checks in `documents-office.ts`). The sheet always submits every
 * field, so there is no third state to represent here: an empty box IS the
 * office clearing that field, not "leave it alone".
 */
export function formOptionalText(
  formData: FormData,
  key: string,
): string | null {
  const value = formString(formData, key)
  return value.length > 0 ? value : null
}

const DOCUMENT_STATUSES = [
  "received",
  "in_processing",
  "processed",
  "returned",
] as const

export function formDocumentStatus(
  formData: FormData,
  key: string,
): (typeof DOCUMENT_STATUSES)[number] | null {
  const value = formString(formData, key)
  return DOCUMENT_STATUSES.find((status) => status === value) ?? null
}

/**
 * Never accepts `"payslip"` — reusing the enum's OWN client-facing subtype
 * (`BETA_CLIENT_DOCUMENT_TYPES`, the same list `uploadDocument`'s input type
 * is built from) rather than a second hand-written list, so the two cannot
 * drift about which type is office-assignable.
 */
export function formClientDocType(
  formData: FormData,
  key: string,
): BetaClientDocumentType | null {
  const value = formString(formData, key)
  return BETA_CLIENT_DOCUMENT_TYPES.find((docType) => docType === value) ?? null
}

/**
 * Ids reach the actions as hidden fields and pages as route segments, and both
 * are request input. Postgres answers a non-uuid `= $1` against a uuid column
 * with 22P02 (invalid input syntax), which reaches the browser as a 500 — a
 * malformed id has to be an ordinary refusal so a probe cannot tell a typo
 * from a real id it is not allowed to see.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export function formUuid(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return isUuid(value) ? value : null
}

// ---------------------------------------------------------------------------
// Zadávání dat (PR 18) — the closed lists and value shapes the forms post
// ---------------------------------------------------------------------------

/**
 * A field that may legitimately be EMPTY, read as "present and valid" vs
 * "malformed" vs "empty".
 *
 * The two-state `X | null` above works for a field where null IS the refusal
 * (an id, an enum). It cannot express an optional money amount: `null` there
 * means "the office has not stated one", which is a real, storable value
 * (§0.4 — an unknown is not a zero), and folding it together with "you typed
 * letters" would silently store a blank instead of refusing.
 */
export type FieldResult<T> = { ok: true; value: T } | { ok: false }

const OK_EMPTY = { ok: true, value: null } as const
const REFUSED = { ok: false } as const

/**
 * `YYYY-MM-DD` — the shape `<input type="date">` posts and a `date` column
 * stores. The regex is a SHAPE check, not a calendar check: Postgres rejects
 * `2026-02-31` itself, and re-implementing the Gregorian calendar here would be
 * a second authority on what a date is.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function formDate(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return ISO_DATE.test(value) ? value : null
}

/** The same, optional: empty is a value, malformed is a refusal. */
export function formOptionalDate(
  formData: FormData,
  key: string,
): FieldResult<string | null> {
  const value = formString(formData, key)
  if (value.length === 0) return OK_EMPTY
  return ISO_DATE.test(value) ? { ok: true, value } : REFUSED
}

/**
 * A `numeric(14,2)` money value, AS A STRING, checked for shape and passed
 * through untouched.
 *
 * NOTHING IS PARSED, ROUNDED OR REFORMATTED HERE — not even to validate it.
 * `Number(value)` would be a float, and a float is what §0.7 keeps money away
 * from; the check is a regex over the digits the office typed, and those exact
 * digits are what reaches Postgres.
 *
 * A comma is accepted and rewritten to a dot: a Czech keyboard produces
 * "1234,50" and refusing it would be a validation error about the decimal
 * separator of the user's own locale. That IS a rewrite of the input, and the
 * only one — it moves no digit.
 *
 * `allowNegative` is false by default and true only for a filing's
 * `amount_due`, which is sign-carrying (a DPH nadměrný odpočet is a refund owed
 * to the client). A liability's amount is strictly positive at the database.
 */
const DECIMAL = /^-?\d{1,12}(?:\.\d{1,2})?$/

export function formDecimal(
  formData: FormData,
  key: string,
  options: { required?: boolean; allowNegative?: boolean } = {},
): FieldResult<string | null> {
  const raw = formString(formData, key).replace(",", ".")
  if (raw.length === 0) return options.required ? REFUSED : OK_EMPTY
  if (!DECIMAL.test(raw)) return REFUSED
  if (!options.allowNegative && raw.startsWith("-")) return REFUSED
  return { ok: true, value: raw }
}

/**
 * Variabilní symbol — 1 to 10 digits, or empty.
 *
 * Mirrors the `*_variable_symbol_digits` CHECK both `filing` and `liability`
 * carry. Checked here as well as there so a typo is a Czech sentence rather
 * than a 500 carrying a constraint name.
 */
const VARIABLE_SYMBOL = /^\d{1,10}$/

export function formVariableSymbol(
  formData: FormData,
  key: string,
): FieldResult<string | null> {
  const value = formString(formData, key)
  if (value.length === 0) return OK_EMPTY
  return VARIABLE_SYMBOL.test(value) ? { ok: true, value } : REFUSED
}

/**
 * A whole number in an inclusive range — the period's year, month and quarter.
 *
 * `Number()` is safe here in a way it is not for money: these are small
 * integers with no fractional part and no precision to lose, and the range
 * check refuses anything a `smallint` column would not take anyway. The
 * `Number.isInteger` guard is what stops "2026.5" and "1e3" from passing.
 */
export function formInteger(
  formData: FormData,
  key: string,
  range: { min: number; max: number },
): number | null {
  const raw = formString(formData, key)
  if (!/^\d{1,4}$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isInteger(value)) return null
  return value >= range.min && value <= range.max ? value : null
}

/**
 * The closed lists Zadávání dat's selects post.
 *
 * Written out rather than read off the pgEnum's `enumValues`, deliberately and
 * only in the one case where the two differ: `OBLIGATION_GROUPS` is the enum
 * MINUS `dodavatele`, because that group belongs wholly to PR 28's imported
 * saldokonto and the database refuses a manual liability in it
 * (`liability_group_is_residue`, migration 0006). Reading the enum here would
 * put a fourth option in the select whose only outcome is a constraint
 * violation. The other three lists are the enums in full, and are asserted
 * total against `enumValues` in `input.test.ts` so a value added to the
 * migration cannot quietly go missing from a form.
 */
const FILING_KINDS: readonly BetaFilingKind[] = [
  "dph_priznani",
  "dph_kontrolni_hlaseni",
  "dph_souhrnne_hlaseni",
  "dppo_priznani",
  "dppo_zaloha",
  "ucetni_zaverka",
  "vyuctovani_dane",
  "prehled_cssz",
  "prehled_zp",
  "jmhz",
  "silnicni_dan",
  "ostatni",
]

export function formFilingKind(
  formData: FormData,
  key: string,
): BetaFilingKind | null {
  const value = formString(formData, key)
  return FILING_KINDS.find((kind) => kind === value) ?? null
}

const FILING_STATUSES: readonly BetaFilingStatus[] = [
  "planned",
  "filed",
  "confirmed",
  "corrective",
]

export function formFilingStatus(
  formData: FormData,
  key: string,
): BetaFilingStatus | null {
  const value = formString(formData, key)
  return FILING_STATUSES.find((status) => status === value) ?? null
}

const PERIOD_KINDS: readonly BetaPeriodKind[] = ["month", "quarter", "year"]

export function formPeriodKind(
  formData: FormData,
  key: string,
): BetaPeriodKind | null {
  const value = formString(formData, key)
  return PERIOD_KINDS.find((kind) => kind === value) ?? null
}

/**
 * The creditor group of a MANUAL liability — the enum MINUS `dodavatele`.
 *
 * The list lives in `@/lib/obligation-labels` rather than here because the
 * liability form's `<select>` renders it in a Client Component, and this module
 * is `server-only`. Reader and select therefore share ONE list: an option the
 * form can offer is exactly an option this reader accepts, and vice versa.
 */
export function formObligationGroup(
  formData: FormData,
  key: string,
): BetaObligationGroup | null {
  const value = formString(formData, key)
  return MANUAL_OBLIGATION_GROUPS.find((group) => group === value) ?? null
}

/**
 * Úkoly klientovi's own closed set (`db/schema/_enums.ts`'s
 * `betaClientTaskLinkKind`) — same discipline as `formObligationGroup` above:
 * an unrecognised value is a refusal, never a cast. `year` / `month` /
 * `templateDueDay` reuse `formInteger` above rather than a new reader — they
 * are all "a whole number in an inclusive range", which is exactly what that
 * one already checks.
 */
export function formClientTaskLinkKind(
  formData: FormData,
  key: string,
): BetaClientTaskLinkKind | null {
  const value = formString(formData, key)
  return (
    betaClientTaskLinkKind.enumValues.find((kind) => kind === value) ?? null
  )
}

// ---------------------------------------------------------------------------
// Účty a hotovost (PR 27) — the account map's own fields
// ---------------------------------------------------------------------------

/**
 * `beta_account_kind` and `beta_account_match_kind`, read off the pgEnums the
 * same way `formClientTaskLinkKind` is: an unrecognised value is a refusal,
 * never a cast. Both enums are total here (unlike `formObligationGroup`, whose
 * list is the enum MINUS one value) — every kind a client can have is a kind
 * the office may assign.
 */
export function formAccountKind(
  formData: FormData,
  key: string,
): BetaAccountKind | null {
  const value = formString(formData, key)
  return betaAccountKind.enumValues.find((kind) => kind === value) ?? null
}

export function formAccountMatchKind(
  formData: FormData,
  key: string,
): BetaAccountMatchKind | null {
  const value = formString(formData, key)
  return betaAccountMatchKind.enumValues.find((kind) => kind === value) ?? null
}

/**
 * An účet as the office's rozvrh spells it — 1 to 20 characters, no padding.
 *
 * Mirrors `account_balance_map_account_code_shape` (migration 0014) and NOTHING
 * MORE. There is deliberately no digit rule: a Czech účtový rozvrh carries
 * "343.01", "311100" and worse, and a validator that guessed wrong would refuse
 * a real client's real rozvrh. The one rule that IS enforced is the one the
 * matching depends on — a leading or trailing space would make a prefix entry
 * match nothing while looking correct in every UI that renders it.
 */
export function formAccountCode(
  formData: FormData,
  key: string,
): string | null {
  // `formString` already trims, so this cannot be tripped by the padding it
  // removes; what it catches is a value that is nothing BUT padding, and a code
  // longer than the column.
  const value = formString(formData, key)
  return value.length >= 1 && value.length <= 20 ? value : null
}

/**
 * A two-valued choice posted as an explicit `"true"` / `"false"` string.
 *
 * The same discipline `setFilingPaidAction` uses inline, and for the same
 * reason: "the field was missing" must never be readable as `false`. Here it
 * backs the Aktivní / Neaktivní select — a mis-read would retire an account and
 * silently drop it out of the client's Účty a hotovost.
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
