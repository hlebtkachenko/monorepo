import { desc, eq, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { organization, workspace } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { DataTablePage } from "../_components"
import type { ColumnDef } from "../_components"

export const metadata = { title: "Workspaces" }

async function loadWorkspaces() {
  return withAdminBypass(async (db) => {
    const orgCountSq = db
      .select({
        workspace_id: organization.workspace_id,
        org_count: sql<number>`count(*)::int`.as("org_count"),
      })
      .from(organization)
      .groupBy(organization.workspace_id)
      .as("org_counts")

    return db
      .select({
        id: workspace.id,
        display_name: workspace.display_name,
        plan: workspace.plan,
        use_case: workspace.use_case,
        team_size: workspace.team_size,
        org_count: orgCountSq.org_count,
        created_at: workspace.created_at,
      })
      .from(workspace)
      .leftJoin(orgCountSq, eq(orgCountSq.workspace_id, workspace.id))
      .orderBy(desc(workspace.created_at))
      .limit(100)
  })
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().slice(0, 10)
}

const COLUMNS: ColumnDef[] = [
  { key: "display_name", label: "Name" },
  { key: "plan", label: "Plan" },
  { key: "use_case", label: "Use case", render: (v) => String(v ?? "—") },
  { key: "team_size", label: "Team", render: (v) => String(v ?? "—") },
  {
    key: "org_count",
    label: "Orgs",
    align: "right" as const,
    render: (v) => String(v ?? 0),
  },
  { key: "created_at", label: "Created", render: (v) => fmtDate(v as Date) },
]

export default async function WorkspacesPage() {
  let rows: Awaited<ReturnType<typeof loadWorkspaces>>
  try {
    rows = await loadWorkspaces()
  } catch {
    rows = []
  }

  void auditAdminAction({ action: "admin.workspaces.list_viewed" })

  return (
    <DataTablePage
      title="Workspaces"
      description="Accountant offices — each owns one or more client organizations."
      columns={COLUMNS}
      rows={rows.map((r) => ({ ...r }) as Record<string, unknown>)}
      auditPrefix="admin.workspaces"
    />
  )
}
