"use server"

import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm"
import { z } from "zod"

import { withAdminBypass } from "@workspace/db"
import {
  audit_event,
  organization,
  organization_membership,
  workspace,
} from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"
import { exportRowsAsCsv } from "@/lib/admin-export"

/**
 * Row cap shared by every CSV export tonight. Anything above this returns an
 * error rather than producing a partial file — see plan §C10.
 */
const ROW_CAP = 10_000

/**
 * Result returned by every admin CSV export action. Successful exports carry
 * the raw CSV string plus a suggested filename; failures carry a `error`
 * message ready to surface in a toast.
 */
export type ExportCsvResult =
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string }

const ExportOrgsInput = z.object({
  filters: z.record(z.string(), z.string().optional()),
})

/**
 * Export the orgs list as CSV under the SAME filter logic the
 * `/orgs` page uses (q ILIKE slug/legal_name, workspace eq, person_kind eq).
 *
 * Caps the result at 10,000 rows. If the filtered count exceeds the cap,
 * returns `{ ok: false, error }` so the client can surface a toast instead of
 * downloading a truncated file.
 *
 * Audit: `admin.orgs.exported` with `{ filter_keys: <count> }`.
 */
export async function exportOrgsCsv(
  rawInput: z.infer<typeof ExportOrgsInput>,
): Promise<ExportCsvResult> {
  try {
    await requireAdminCapability("admin:read")
    const input = ExportOrgsInput.parse(rawInput)

    const q = input.filters.q?.trim() ?? ""
    const workspaceId = input.filters.workspace?.trim() ?? ""
    const personKind = input.filters.person_kind?.trim() ?? ""

    const where = and(
      q.length > 0
        ? or(
            ilike(organization.slug, `%${q}%`),
            ilike(organization.legal_name, `%${q}%`),
          )
        : undefined,
      workspaceId.length > 0
        ? eq(organization.workspace_id, workspaceId)
        : undefined,
      personKind.length > 0
        ? eq(organization.person_kind, personKind)
        : undefined,
    )

    const { rows, total } = await withAdminBypass(async (db) => {
      const memberCountSq = db
        .select({
          org_id: organization_membership.organization_id,
          member_count: sql<number>`count(*)::int`.as("member_count"),
        })
        .from(organization_membership)
        .groupBy(organization_membership.organization_id)
        .as("member_counts")

      const lastActivitySq = db
        .select({
          org_id: audit_event.organization_id,
          last_activity_at: sql<Date | null>`max(${audit_event.created_at})`.as(
            "last_activity_at",
          ),
        })
        .from(audit_event)
        .where(isNotNull(audit_event.organization_id))
        .groupBy(audit_event.organization_id)
        .as("last_activity")

      const countRow = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(organization)
        .where(where)
      const totalRows = countRow[0]?.total ?? 0

      if (totalRows > ROW_CAP) {
        return { rows: [], total: totalRows }
      }

      const dataRows = await db
        .select({
          id: organization.id,
          slug: organization.slug,
          legal_name: organization.legal_name,
          workspace_id: organization.workspace_id,
          workspace_display_name: workspace.display_name,
          person_kind: organization.person_kind,
          fiscal_year_start_month: organization.fiscal_year_start_month,
          created_at: organization.created_at,
          member_count: memberCountSq.member_count,
          last_activity_at: lastActivitySq.last_activity_at,
        })
        .from(organization)
        .leftJoin(workspace, eq(workspace.id, organization.workspace_id))
        .leftJoin(memberCountSq, eq(memberCountSq.org_id, organization.id))
        .leftJoin(lastActivitySq, eq(lastActivitySq.org_id, organization.id))
        .where(where)
        .orderBy(desc(organization.created_at))
        .limit(ROW_CAP)

      return { rows: dataRows, total: totalRows }
    })

    if (total > ROW_CAP) {
      return { ok: false, error: "Too many rows (cap 10k)" }
    }

    const csv = exportRowsAsCsv(rows, [
      { key: "id", label: "ID" },
      { key: "slug", label: "Slug" },
      { key: "legal_name", label: "Legal name" },
      { key: "workspace_id", label: "Workspace ID" },
      { key: "workspace_display_name", label: "Workspace" },
      { key: "person_kind", label: "Kind" },
      { key: "fiscal_year_start_month", label: "FY start" },
      { key: "member_count", label: "Members" },
      { key: "last_activity_at", label: "Last activity" },
      { key: "created_at", label: "Created" },
    ])

    await auditAdminAction({
      action: "admin.orgs.exported",
      payload: { filter_keys: Object.keys(input.filters).length },
    })

    return { ok: true, csv, filename: "orgs.csv" }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
