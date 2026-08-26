import "server-only"

import type { BetaOrgRole } from "@/db/schema"
import {
  IDENTITY_FIELDS,
  isAresField,
  normalizeIco,
  type AresField,
  type OrganizationIdentityPatch,
} from "@/lib/ares/suggestions"

/**
 * Reading a `FormData` at the Nastavení write boundary.
 *
 * Same discipline as `majetek/_actions/input.ts` and `admin/_actions/input.ts`:
 * a form control is a suggestion to a browser, never a constraint on a POST, so
 * every value is validated here and nothing is cast.
 */

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * The Lidé helpers (PR 22). Deliberately duplicated from `admin/_actions/
 * input.ts` rather than shared: both files exist to state that THIS boundary
 * reads THESE fields, and a shared "form input" module is the kind of
 * convenience that ends with one surface accepting a field the other never
 * meant to offer. Three total functions of two lines each is a cheaper price
 * than a common vocabulary between two doors with different privileges.
 */

const ORG_ROLES: readonly BetaOrgRole[] = ["owner", "admin", "member", "guest"]

export function formRole(formData: FormData, key: string): BetaOrgRole | null {
  const value = formString(formData, key)
  return ORG_ROLES.find((role) => role === value) ?? null
}

/** A deliberate two-state field: "the field was missing" is never `false`. */
export function formFlag(formData: FormData, key: string): boolean | null {
  const value = formString(formData, key)
  if (value === "true") return true
  if (value === "false") return false
  return null
}

/**
 * Postgres answers a non-uuid `= $1` against a uuid column with 22P02, which
 * reaches the browser as a 500. A malformed id has to be an ordinary refusal so
 * a probe cannot tell a typo from a real id it is not allowed to see.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function formUuid(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return UUID.test(value) ? value : null
}

function formOptionalString(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return value.length === 0 ? null : value
}

/**
 * The identity-card edit, read field by field from the declared list.
 *
 * ITERATING `IDENTITY_FIELDS` IS THE POINT. Reading the posted keys instead
 * would make the writable set whatever the request says it is; reading the
 * declared set means a field nobody put in `IDENTITY_FIELDS` is not merely
 * rejected — it is never looked at. That is what keeps `vat_regime` (spec §3.5,
 * /admin's) out of reach from this form no matter what a POST carries.
 *
 * `ico` is the one field with a shape of its own: it is left-padded to 8 digits
 * (spec §2.10) and a value that cannot be an IČO is refused rather than mangled
 * into a different company's identifier.
 */
export type IdentityFormResult =
  | { ok: true; patch: OrganizationIdentityPatch }
  | { ok: false; reason: "ico_invalid" | "name_required" }

export function identityPatchFromForm(formData: FormData): IdentityFormResult {
  const patch: OrganizationIdentityPatch = {}

  for (const field of IDENTITY_FIELDS) {
    if (field === "ico") continue
    patch[field] = formOptionalString(formData, field)
  }

  const ico = normalizeIco(formString(formData, "ico"))
  if (!ico.ok) return { ok: false, reason: "ico_invalid" }
  patch.ico = ico.ico

  // The legal name is the one column the table declares NOT NULL, and an
  // identity card without one is not a card. Refused rather than silently kept:
  // a save that quietly ignores a cleared field is how people discover later
  // that their edit did not take.
  if ((patch.legalName ?? "") === "") {
    return { ok: false, reason: "name_required" }
  }

  return { ok: true, patch }
}

/**
 * The suggestion field names the human ticked.
 *
 * NAMES ONLY — never values. The server re-derives what ARES said (from the 24h
 * cache or a fresh call) and writes its OWN value for each accepted name, so
 * the browser cannot post a value ARES did not give: the worst a hand-built
 * POST can do is accept a suggestion the server already computed and displayed.
 *
 * Unknown names are dropped rather than refused. A stale form (the office
 * accepted one suggestion, then reloaded) posting a field ARES no longer
 * differs on is an ordinary race, not an attack, and refusing the whole
 * submission over it would lose the accepted fields that are still valid.
 */
export function acceptedAresFields(formData: FormData): AresField[] {
  const accepted: AresField[] = []
  for (const value of formData.getAll("accept")) {
    if (typeof value !== "string") continue
    if (isAresField(value) && !accepted.includes(value)) accepted.push(value)
  }
  return accepted
}
