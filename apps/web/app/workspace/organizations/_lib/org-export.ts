/**
 * Pure CSV builder for the manage-organizations export. No IO — unit-testable.
 */
export interface OrgExportRow {
  legalName: string
  slug: string
  ico: string | null
  legalFormCode: string | null
  archived: boolean
}

/** A row for the manage-orgs hub (client-safe). */
export interface ManagedOrg extends OrgExportRow {
  id: string
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildOrgCsv(rows: OrgExportRow[]): string {
  const header = ["legal_name", "slug", "ico", "legal_form", "status"]
  const body = rows.map((r) =>
    [
      r.legalName,
      r.slug,
      r.ico ?? "",
      r.legalFormCode ?? "",
      r.archived ? "archived" : "active",
    ]
      .map(csvCell)
      .join(","),
  )
  return [header.join(","), ...body].join("\n") + "\n"
}
