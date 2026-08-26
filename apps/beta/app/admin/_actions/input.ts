import "server-only"

import type { BetaOrgRole, BetaVatRegime } from "@/db/schema"

/**
 * Reading a `FormData` at the /admin boundary.
 *
 * A Server Action's argument is request input, whatever the surrounding page
 * rendered — a `<select>` with four options is a suggestion to a browser, not a
 * constraint on a POST. So every enum arrives here as a string and leaves as a
 * value from a closed list or as `null`; there is no cast anywhere in the
 * action layer, and an unrecognised value is a refusal rather than a database
 * error about an invalid enum literal.
 *
 * Booleans are read as PRESENCE, the way an unchecked checkbox behaves: it is
 * simply absent from the payload. Explicit two-state writes (activate /
 * deactivate) use their own field with a literal value instead, so "the field
 * was missing" can never be read as "set it to false".
 */

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/** Checkbox semantics: present means true. */
export function formChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true"
}

/** A deliberate two-state field. Anything but the literals is a refusal. */
export function formFlag(formData: FormData, key: string): boolean | null {
  const value = formString(formData, key)
  if (value === "true") return true
  if (value === "false") return false
  return null
}

const ORG_ROLES: readonly BetaOrgRole[] = ["owner", "admin", "member", "guest"]

export function formRole(formData: FormData, key: string): BetaOrgRole | null {
  const value = formString(formData, key)
  return ORG_ROLES.find((role) => role === value) ?? null
}

const VAT_REGIMES: readonly BetaVatRegime[] = ["platce", "neplatce"]

export function formVatRegime(
  formData: FormData,
  key: string,
): BetaVatRegime | null {
  const value = formString(formData, key)
  return VAT_REGIMES.find((regime) => regime === value) ?? null
}

/**
 * There is deliberately NO `formPurpose`. A setup link's purpose is decided
 * server-side from the target account's own state (`issueUserLinkAction`) or
 * from the route that issues it, never taken from the form: `account_setup`,
 * `org_invite` and `password_reset` do not carry the same privilege, and a
 * select whose options differ in privilege is a select somebody will POST past.
 */

/** `YYYY-MM-DD`, the shape a `<input type="date">` posts and `date` stores. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function formDate(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return ISO_DATE.test(value) ? value : null
}

/** A uuid, or null. Ids reach the actions as hidden fields. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function formUuid(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return UUID.test(value) ? value : null
}
