import Link from "next/link"
import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  audit_event,
  organization,
  organization_membership,
  workspace,
} from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { DataTablePage, Filters } from "../_components"
import type { ColumnDef } from "../_components"
import { ExportCsvButton } from "./_components/export-csv-button"

export const metadata = { title: "Organizations" }

const PAGE_SIZE = 50

interface SearchParams {
  q?: string
  workspace?: string
  person_kind?: string
  page?: string
}

async function loadOrgs(params: SearchParams) {
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  return withAdminBypass(async (db) => {
    const where = and(
      params.q
        ? or(
            ilike(organization.slug, `%${params.q}%`),
            ilike(organization.legal_name, `%${params.q}%`),
          )
        : undefined,
      params.workspace
        ? eq(organization.workspace_id, params.workspace)
        : undefined,
      params.person_kind
        ? eq(organization.person_kind, params.person_kind)
        : undefined,
    )

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

    const total = countRow[0]?.total ?? 0

    const rows = await db
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
      .limit(PAGE_SIZE)
      .offset(pageIndex * PAGE_SIZE)

    const workspaceOptions = await db
      .select({ id: workspace.id, display_name: workspace.display_name })
      .from(workspace)
      .orderBy(workspace.display_name)

    return { rows, total, workspaceOptions }
  })
}

function buildPageHref(params: SearchParams, pageIndex: number): string {
  const sp = new URLSearchParams()
  if (params.q) sp.set("q", params.q)
  if (params.workspace) sp.set("workspace", params.workspace)
  if (params.person_kind) sp.set("person_kind", params.person_kind)
  if (pageIndex > 0) sp.set("page", String(pageIndex))
  const qs = sp.toString()
  return qs ? `/orgs?${qs}` : "/orgs"
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().slice(0, 10)
}

function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  const diff = Date.now() - t.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  if (s < 86400) return Math.floor(s / 3600) + "h ago"
  return Math.floor(s / 86400) + "d ago"
}

const COLUMNS: ColumnDef[] = [
  {
    key: "slug",
    label: "Slug",
    render: (_v, row) => (
      <Link
        href={`/orgs/${String(row.id)}`}
        className="font-mono text-xs hover:underline"
      >
        {String(row.slug)}
      </Link>
    ),
  },
  { key: "legal_name", label: "Legal name" },
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
  { key: "person_kind", label: "Kind" },
  {
    key: "fiscal_year_start_month",
    label: "FY start",
    align: "right" as const,
  },
  {
    key: "member_count",
    label: "Members",
    align: "right" as const,
    render: (v) => String(v ?? 0),
  },
  {
    key: "last_activity_at",
    label: "Last activity",
    render: (v) => timeAgo(v as Date | null | undefined),
  },
  {
    key: "created_at",
    label: "Created",
    render: (v) => fmt(v as Date | null | undefined),
  },
]

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  let data: Awaited<ReturnType<typeof loadOrgs>>
  try {
    data = await loadOrgs(params)
  } catch {
    data = { rows: [], total: 0, workspaceOptions: [] }
  }

  void auditAdminAction({
    action: "admin.orgs.list_viewed",
    payload: { filters: params },
  })

  const filterSchema = {
    fields: [
      {
        name: "q",
        label: "Search",
        type: "search" as const,
        placeholder: "slug or legal name",
      },
      {
        name: "workspace",
        label: "Workspace",
        type: "select" as const,
        options: data.workspaceOptions.map((w) => ({
          label: w.display_name,
          value: w.id,
        })),
      },
      {
        name: "person_kind",
        label: "Kind",
        type: "select" as const,
        options: [
          { label: "Legal", value: "legal" },
          { label: "Natural", value: "natural" },
        ],
      },
    ],
  }

  const currentFilters: Record<string, string> = {}
  if (params.q) currentFilters.q = params.q
  if (params.workspace) currentFilters.workspace = params.workspace
  if (params.person_kind) currentFilters.person_kind = params.person_kind

  return (
    <DataTablePage
      title="Organizations"
      description="All tenant organizations across workspaces."
      columns={COLUMNS}
      rows={data.rows.map((r) => ({ ...r }) as Record<string, unknown>)}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows: data.total }}
      pageHrefBuilder={(p) => buildPageHref(params, p)}
      filters={<Filters schema={filterSchema} current={currentFilters} />}
      toolbar={<ExportCsvButton />}
      auditPrefix="admin.orgs"
    />
  )
}
