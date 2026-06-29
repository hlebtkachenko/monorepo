import "server-only"

import { and, desc, eq, inArray } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user, workspace, workspace_membership } from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"

import { getAllowlistWorkspaceIds } from "@/app/(gated)/check-allowlist"
import { auditAdminAction } from "@/lib/admin-audit"
import {
  DataTablePage,
  Filters,
  type ColumnDef,
  type FilterSchema,
} from "../../_components"

export const metadata = { title: "Staff members" }

const PAGE_SIZE = 50

const FILTER_SCHEMA: FilterSchema = {
  fields: [
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      options: [],
    },
    {
      name: "role",
      label: "Role",
      type: "select",
      options: [
        { label: "Owner", value: "owner" },
        { label: "Admin", value: "admin" },
        { label: "Member", value: "member" },
      ],
    },
    {
      name: "active",
      label: "Active",
      type: "select",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
  ],
}

const COLUMNS: ColumnDef[] = [
  { key: "email", label: "Email" },
  { key: "name", label: "Name" },
  {
    key: "workspace_display_name",
    label: "Workspace",
    render: (v) =>
      v ? (
        <span className="text-sm">{String(v)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "role",
    label: "Role",
    render: (v) => <Badge variant="outline">{String(v ?? "")}</Badge>,
  },
  {
    key: "active",
    label: "Active",
    render: (v) =>
      v ? (
        <Badge variant="secondary">Active</Badge>
      ) : (
        <Badge variant="destructive">Inactive</Badge>
      ),
  },
  {
    key: "created_at",
    label: "Joined",
    render: (v) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""),
  },
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StaffMembersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filterWorkspace = typeof sp.workspace === "string" ? sp.workspace : ""
  const filterRole = typeof sp.role === "string" ? sp.role : ""
  const filterActive = typeof sp.active === "string" ? sp.active : ""
  const pageIndex = Math.max(0, Number(sp.page ?? 0))

  const allowlist = await getAllowlistWorkspaceIds()

  const current: Record<string, string> = {}
  if (filterWorkspace) current.workspace = filterWorkspace
  if (filterRole) current.role = filterRole
  if (filterActive) current.active = filterActive

  const { rows, total, workspaceOptions } = await withAdminBypass(
    async (db) => {
      const whereClauses = [
        allowlist.length > 0
          ? inArray(workspace_membership.workspace_id, allowlist)
          : eq(workspace_membership.workspace_id, "no-match"),
      ]

      if (filterWorkspace) {
        whereClauses.push(
          eq(workspace_membership.workspace_id, filterWorkspace),
        )
      }
      if (filterRole) {
        whereClauses.push(
          eq(
            workspace_membership.role,
            filterRole as "owner" | "admin" | "member",
          ),
        )
      }
      if (filterActive === "true") {
        whereClauses.push(eq(workspace_membership.active, true))
      } else if (filterActive === "false") {
        whereClauses.push(eq(workspace_membership.active, false))
      }

      const whereClause = and(...whereClauses)

      const [dataRows, countRows, wsRows] = await Promise.all([
        db
          .select({
            id: workspace_membership.id,
            email: app_user.email,
            name: app_user.name,
            workspace_display_name: workspace.display_name,
            role: workspace_membership.role,
            active: workspace_membership.active,
            created_at: workspace_membership.created_at,
          })
          .from(workspace_membership)
          .innerJoin(app_user, eq(app_user.id, workspace_membership.user_id))
          .leftJoin(
            workspace,
            eq(workspace.id, workspace_membership.workspace_id),
          )
          .where(whereClause)
          .orderBy(desc(workspace_membership.created_at))
          .limit(PAGE_SIZE)
          .offset(pageIndex * PAGE_SIZE),
        db
          .select({ id: workspace_membership.id })
          .from(workspace_membership)
          .innerJoin(app_user, eq(app_user.id, workspace_membership.user_id))
          .where(whereClause),
        allowlist.length > 0
          ? db
              .select({
                id: workspace.id,
                display_name: workspace.display_name,
              })
              .from(workspace)
              .where(inArray(workspace.id, allowlist))
              .orderBy(workspace.display_name)
          : Promise.resolve([] as { id: string; display_name: string }[]),
      ])

      return {
        rows: dataRows as Array<Record<string, unknown>>,
        total: countRows.length,
        workspaceOptions: wsRows,
      }
    },
  )

  void auditAdminAction({ action: "admin.staff.members_viewed" })

  const dynamicFilterSchema: FilterSchema = {
    fields: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        options: workspaceOptions.map((w) => ({
          label: w.display_name,
          value: w.id,
        })),
      },
      ...FILTER_SCHEMA.fields.slice(1),
    ],
  }

  function buildPageHref(idx: number): string {
    const params = new URLSearchParams()
    if (filterWorkspace) params.set("workspace", filterWorkspace)
    if (filterRole) params.set("role", filterRole)
    if (filterActive) params.set("active", filterActive)
    if (idx > 0) params.set("page", String(idx))
    const qs = params.toString()
    return qs ? `/staff/members?${qs}` : "/staff/members"
  }

  return (
    <DataTablePage
      title="Staff members"
      description="All staff users across allowlisted workspaces."
      columns={COLUMNS}
      rows={rows}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows: total }}
      pageHrefBuilder={buildPageHref}
      filters={<Filters schema={dynamicFilterSchema} current={current} />}
      auditPrefix="admin.staff.members"
      emptyTitle="No staff members found"
      emptyDescription="Check ADMIN_WORKSPACE_ALLOWLIST or adjust your filters."
    />
  )
}
