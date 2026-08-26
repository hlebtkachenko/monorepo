import "server-only"

import {
  BETA_CLIENT_DOCUMENT_TYPES,
  type BetaClientDocumentType,
} from "@/db/schema"

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
