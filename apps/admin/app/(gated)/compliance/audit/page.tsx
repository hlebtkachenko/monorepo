import "server-only"

import Link from "next/link"
import { and, count, desc, eq, gte, ilike } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { audit_event } from "@workspace/db/schema"

import {
  DataTablePage,
  type ColumnDef,
  Filters,
  type FilterSchema,
} from "@/app/(gated)/_components"
import { auditOnce } from "@/lib/admin-audit"

export const metadata = { title: "Audit log" }

const PAGE_SIZE = 50

const FILTER_SCHEMA: FilterSchema = {
  fields: [
    {
      name: "q",
      label: "Search",
      type: "search",
      placeholder: "action contains…",
    },
    {
      name: "action",
      label: "Action",
      type: "search",
      placeholder: "exact action",
    },
    {
      name: "actor",
      label: "Actor",
      type: "search",
      placeholder: "actor_user_id",
    },
    {
      name: "org",
      label: "Organization",
      type: "search",
      placeholder: "organization_id",
    },
    {
      name: "since",
      label: "Since",
      type: "search",
      placeholder: "ISO date / time",
    },
  ],
}

function first8(value: string | null | undefined): string {
  if (!value) return "—"
  return value.slice(0, 8)
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().replace("T", " ").slice(0, 19) + "Z"
}

function truncatePayload(value: unknown): string {
  if (value === null || value === undefined) return ""
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value)
    return s.length > 80 ? s.slice(0, 80) + "…" : s
  } catch {
    return ""
  }
}

interface SearchParams {
  q?: string
  action?: string
  actor?: string
  org?: string
  since?: string
  page?: string
}

interface AuditRow {
  id: string
  created_at: Date
  action: string
  actor_user_id: string | null
  workspace_id: string | null
  organization_id: string | null
  payload: unknown
}

const COLUMNS: ColumnDef[] = [
  {
    key: "created_at",
    label: "Created",
    render: (v) => fmt(v as Date | null | undefined),
  },
  {
    key: "action",
    label: "Action",
    render: (_v, row) => (
      <Link
        href={`/compliance/audit/${String(row.id)}`}
        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
      >
        {String(row.action)}
      </Link>
    ),
  },
  {
    key: "actor_user_id",
    label: "Actor",
    render: (v) => (
      <span className="font-mono text-xs">
        {first8(v as string | null | undefined)}
      </span>
    ),
  },
  {
    key: "workspace_id",
    label: "Workspace",
    render: (v) => (
      <span className="font-mono text-xs">
        {first8(v as string | null | undefined)}
      </span>
    ),
  },
  {
    key: "organization_id",
    label: "Organization",
    render: (v) => (
      <span className="font-mono text-xs">
        {first8(v as string | null | undefined)}
      </span>
    ),
  },
  {
    key: "payload",
    label: "Payload",
    render: (v, row) => (
      <div className="flex items-center gap-2">
        <code className="truncate text-xs text-muted-foreground">
          {truncatePayload(v)}
        </code>
        <Link
          href={`/compliance/audit/${String(row.id)}`}
          className="text-xs text-primary hover:underline"
        >
          View
        </Link>
      </div>
    ),
  },
]

async function loadAudit(params: SearchParams) {
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  return withAdminBypass(async (db) => {
    const filters = []

    if (params.q) {
      filters.push(ilike(audit_event.action, `%${params.q}%`))
    }
    if (params.action) {
      filters.push(eq(audit_event.action, params.action))
    }
    if (params.actor) {
      filters.push(eq(audit_event.actor_user_id, params.actor))
    }
    if (params.org) {
      filters.push(eq(audit_event.organization_id, params.org))
    }
    if (params.since) {
      const d = new Date(params.since)
      if (!Number.isNaN(d.getTime())) {
        filters.push(gte(audit_event.created_at, d))
      }
    }

    const where =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters)

    const [dataRows, countRows] = await Promise.all([
      db
        .select({
          id: audit_event.id,
          created_at: audit_event.created_at,
          action: audit_event.action,
          actor_user_id: audit_event.actor_user_id,
          workspace_id: audit_event.workspace_id,
          organization_id: audit_event.organization_id,
          payload: audit_event.payload,
        })
        .from(audit_event)
        .where(where)
        .orderBy(desc(audit_event.created_at))
        .limit(PAGE_SIZE)
        .offset(pageIndex * PAGE_SIZE),
      db.select({ total: count() }).from(audit_event).where(where),
    ])

    return {
      rows: dataRows as AuditRow[],
      total: Number(countRows[0]?.total ?? 0),
    }
  })
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  let data: Awaited<ReturnType<typeof loadAudit>>
  try {
    data = await loadAudit(params)
  } catch {
    data = { rows: [], total: 0 }
  }

  const current: Record<string, string> = {}
  if (params.q) current.q = params.q
  if (params.action) current.action = params.action
  if (params.actor) current.actor = params.actor
  if (params.org) current.org = params.org
  if (params.since) current.since = params.since

  function buildPageHref(idx: number): string {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(current)) sp.set(k, v)
    if (idx > 0) sp.set("page", String(idx))
    const qs = sp.toString()
    return qs ? `/compliance/audit?${qs}` : "/compliance/audit"
  }

  await auditOnce("admin.compliance.audit_viewed")

  return (
    <DataTablePage
      title="Audit log"
      description="Every workspace + pre-account audit event, newest first."
      columns={COLUMNS}
      rows={data.rows.map((r) => ({ ...r }) as Record<string, unknown>)}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows: data.total }}
      pageHrefBuilder={buildPageHref}
      filters={<Filters schema={FILTER_SCHEMA} current={current} />}
      auditPrefix="admin.compliance.audit"
      emptyTitle="No audit events"
      emptyDescription="Try adjusting filters or the time window."
    />
  )
}
