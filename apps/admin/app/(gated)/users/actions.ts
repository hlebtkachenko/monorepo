"use server"

import { and, desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"

import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"
import { exportRowsAsCsv } from "@/lib/admin-export"

import type { ExportCsvResult } from "../orgs/actions"

const ROW_CAP = 10_000

const ExportUsersInput = z.object({
  filters: z.record(z.string(), z.string().optional()),
})

/**
 * Export the users list as CSV under the SAME filter logic the `/users` page
 * uses (q ILIKE email/name, banned eq, email_verified eq). Caps the result at
 * 10,000 rows and writes `admin.users.exported`.
 */
export async function exportUsersCsv(
  rawInput: z.infer<typeof ExportUsersInput>,
): Promise<ExportCsvResult> {
  try {
    await requireAdminCapability("admin:read")
    const input = ExportUsersInput.parse(rawInput)

    const q = input.filters.q?.trim() ?? ""
    const banned = input.filters.banned?.trim() ?? ""
    const emailVerified = input.filters.email_verified?.trim() ?? ""

    const workspacesCountSq = sql<number>`(
      SELECT count(*)::int
      FROM workspace_membership wm
      WHERE wm.user_id = ${app_user.id}
      AND wm.active = true
    )`

    const orgsCountSq = sql<number>`(
      SELECT count(*)::int
      FROM organization_membership om
      WHERE om.user_id = ${app_user.id}
      AND om.active = true
    )`

    const { rows, total } = await withAdminBypass(async (db) => {
      const whereClauses = []
      if (q.length > 0) {
        whereClauses.push(
          or(ilike(app_user.email, `%${q}%`), ilike(app_user.name, `%${q}%`)),
        )
      }
      if (banned === "true") {
        whereClauses.push(eq(app_user.banned, true))
      } else if (banned === "false") {
        whereClauses.push(eq(app_user.banned, false))
      }
      if (emailVerified === "true") {
        whereClauses.push(eq(app_user.email_verified, true))
      } else if (emailVerified === "false") {
        whereClauses.push(eq(app_user.email_verified, false))
      }

      const whereClause =
        whereClauses.length === 0
          ? undefined
          : whereClauses.length === 1
            ? whereClauses[0]
            : and(...whereClauses)

      const countRow = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(app_user)
        .where(whereClause)
      const totalRows = countRow[0]?.total ?? 0

      if (totalRows > ROW_CAP) {
        return { rows: [], total: totalRows }
      }

      const dataRows = await db
        .select({
          id: app_user.id,
          email: app_user.email,
          name: app_user.name,
          banned: app_user.banned,
          email_verified: app_user.email_verified,
          workspaces_count: workspacesCountSq,
          orgs_count: orgsCountSq,
          created_at: app_user.created_at,
        })
        .from(app_user)
        .where(whereClause)
        .orderBy(desc(app_user.created_at))
        .limit(ROW_CAP)

      return { rows: dataRows, total: totalRows }
    })

    if (total > ROW_CAP) {
      return { ok: false, error: "Too many rows (cap 10k)" }
    }

    const csv = exportRowsAsCsv(rows, [
      { key: "id", label: "ID" },
      { key: "email", label: "Email" },
      { key: "name", label: "Name" },
      { key: "banned", label: "Banned" },
      { key: "email_verified", label: "Email verified" },
      { key: "workspaces_count", label: "Workspaces" },
      { key: "orgs_count", label: "Orgs" },
      { key: "created_at", label: "Created" },
    ])

    await auditAdminAction({
      action: "admin.users.exported",
      payload: { filter_keys: Object.keys(input.filters).length },
    })

    return { ok: true, csv, filename: "users.csv" }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
