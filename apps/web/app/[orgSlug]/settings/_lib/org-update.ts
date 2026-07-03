/**
 * Pure mapping of settings-form patch → (column, value) pairs for the
 * organization UPDATE. Client-safe (no db import) — unit-testable. Only the
 * mutable identity/contact columns are writable; regime / legal form / slug /
 * person kind are not editable here (they drive domain logic).
 */
export interface OrgSettingsUpdate {
  legalName?: string
  ico?: string
  legalFormCode?: string
  dataBoxId?: string
  contactEmail?: string
  contactPhone?: string
  website?: string
  registeredStreet?: string
  registeredHouseNumber?: string
  registeredOrientationNumber?: string
  registeredCity?: string
  registeredPostalCode?: string
  registeredRegion?: string
  taxOfficeCode?: string
  registryFileNumber?: string
}

const FIELD_TO_COLUMN: ReadonlyArray<[keyof OrgSettingsUpdate, string]> = [
  ["legalName", "legal_name"],
  ["ico", "ico"],
  ["legalFormCode", "legal_form_code"],
  ["dataBoxId", "data_box_id"],
  ["contactEmail", "contact_email"],
  ["contactPhone", "contact_phone"],
  ["website", "website"],
  ["registeredStreet", "registered_street"],
  ["registeredHouseNumber", "registered_house_number"],
  ["registeredOrientationNumber", "registered_orientation_number"],
  ["registeredCity", "registered_city"],
  ["registeredPostalCode", "registered_postal_code"],
  ["registeredRegion", "registered_region"],
  ["taxOfficeCode", "tax_office_code"],
  ["registryFileNumber", "registry_file_number"],
]

/** A field present in the patch is updated; empty string clears it (→ NULL). */
export function collectOrgUpdates(
  values: OrgSettingsUpdate,
): Array<[column: string, value: string | null]> {
  const out: Array<[string, string | null]> = []
  for (const [field, column] of FIELD_TO_COLUMN) {
    const raw = values[field]
    if (raw === undefined) continue
    const trimmed = raw.trim()
    out.push([column, trimmed === "" ? null : trimmed])
  }
  return out
}

// datová schránka = 7-char lowercase alphanumeric (mirrors the
// organization_data_box_format_chk CHECK in 0042_org_config.sql).
const DATA_BOX_RE = /^[a-z0-9]{7}$/

/**
 * Validate a data box id. Empty clears the value (allowed). Returns an i18n
 * error key when the format is wrong, or null when it is acceptable. Pure —
 * shared by the client form (pre-submit) and the server action (boundary).
 */
export function dataBoxError(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  return DATA_BOX_RE.test(trimmed) ? null : "dataBoxFormat"
}
