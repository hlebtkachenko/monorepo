"use server"

import { desc } from "drizzle-orm"
import { z } from "zod"

import { withAdminBypass } from "@workspace/db"
import { audit_event } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"
import { exportRowsAsCsv } from "@/lib/admin-export"

/**
 * Result for the audit CSV export from the command palette. Mirrors the
 * shape of `ExportCsvResult` in `/orgs/actions.ts` to keep the caller
 * pattern identical.
 */
export type ExportCsvResult =
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string }

const EXPORT_LIMIT = 1_000

const ExportInput = z.object({}).strict()

/**
 * Export the most recent `EXPORT_LIMIT` audit_event rows as CSV.
 *
 * Capability: `admin:read`.
 * Audit: `admin.compliance.audit_exported`.
 */
export async function exportLatestAuditCsv(
  rawInput?: z.infer<typeof ExportInput>,
): Promise<ExportCsvResult> {
  try {
    await requireAdminCapability("admin:read")
    ExportInput.parse(rawInput ?? {})

    const rows = await withAdminBypass((db) =>
      db
        .select({
          id: audit_event.id,
          workspace_id: audit_event.workspace_id,
          organization_id: audit_event.organization_id,
          actor_user_id: audit_event.actor_user_id,
          action: audit_event.action,
          payload: audit_event.payload,
          created_at: audit_event.created_at,
        })
        .from(audit_event)
        .orderBy(desc(audit_event.created_at))
        .limit(EXPORT_LIMIT),
    )

    const csv = exportRowsAsCsv(rows, [
      { key: "id", label: "ID" },
      { key: "created_at", label: "Created" },
      { key: "action", label: "Action" },
      { key: "actor_user_id", label: "Actor user ID" },
      { key: "workspace_id", label: "Workspace ID" },
      { key: "organization_id", label: "Organization ID" },
      { key: "payload", label: "Payload" },
    ])

    await auditAdminAction({
      action: "admin.compliance.audit_exported",
      payload: { limit: EXPORT_LIMIT, row_count: rows.length },
    })

    return { ok: true, csv, filename: "audit-last-1000.csv" }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
