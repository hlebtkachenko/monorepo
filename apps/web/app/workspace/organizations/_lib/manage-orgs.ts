/**
 * Server-side queries for the manage-organizations hub. Workspace access is the
 * caller's responsibility (resolve via getWorkspaceContext before calling).
 */
import "server-only"
import { sql } from "drizzle-orm"
import { executeRows, withAdminBypass } from "@workspace/db"
import type { ManagedOrg } from "./org-export"

export type { ManagedOrg }

export async function listOrgsForWorkspace(
  workspaceId: string,
): Promise<ManagedOrg[]> {
  return await withAdminBypass(async (db) => {
    const rows = await executeRows<{
      id: string
      slug: string
      legal_name: string
      ico: string | null
      legal_form_code: string | null
      archived_at: string | null
    }>(
      db,
      sql`SELECT id, slug, legal_name, ico, legal_form_code, archived_at
          FROM organization
          WHERE workspace_id = ${workspaceId}::uuid
          ORDER BY legal_name`,
    )
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      legalName: r.legal_name,
      ico: r.ico,
      legalFormCode: r.legal_form_code,
      archived: r.archived_at !== null,
    }))
  })
}

/** Set/clear archived_at, scoped to the workspace. Returns false if not found. */
export async function setOrgArchived(
  workspaceId: string,
  orgId: string,
  archived: boolean,
): Promise<boolean> {
  return await withAdminBypass(async (db) => {
    const res = await executeRows<{ id: string }>(
      db,
      sql`UPDATE organization
          SET archived_at = ${archived ? sql`now()` : sql`NULL`}, updated_at = now()
          WHERE id = ${orgId}::uuid AND workspace_id = ${workspaceId}::uuid
          RETURNING id`,
    )
    return res.length > 0
  })
}
