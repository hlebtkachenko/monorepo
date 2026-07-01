import "server-only"

import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  gt,
  isNull,
  sql,
} from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user, impersonation } from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"

import {
  DataTablePage,
  type ColumnDef,
  Filters,
  type FilterSchema,
} from "@/app/(gated)/_components"
import { auditOnce } from "@/lib/admin-audit"

import { ForceEndButton } from "./_components/force-end-button"

export const metadata = { title: "Impersonation log" }

const PAGE_SIZE = 50

const FILTER_SCHEMA: FilterSchema = {
  fields: [
    {
      name: "active",
      label: "Active only",
      type: "select",
      options: [{ label: "Active", value: "true" }],
    },
  ],
}

interface ImpersonationRow {
  id: string
  started_at: Date
  ended_at: Date | null
  expected_end_at: Date
  reason: string
  workspace_id: string
  actor_email: string | null
  target_email: string | null
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().replace("T", " ").slice(0, 19) + "Z"
}

function first8(value: string | null | undefined): string {
  if (!value) return "—"
  return value.slice(0, 8)
}

const COLUMNS: ColumnDef[] = [
  {
    key: "started_at",
    label: "Started",
    render: (v) => fmt(v as Date | null | undefined),
  },
  {
    key: "ended_at",
    label: "Ended",
    render: (v, row) => {
      if (v) return fmt(v as Date)
      const expected = row.expected_end_at as Date | null
      const stillActive = !expected || new Date(expected).getTime() > Date.now()
      return stillActive ? (
        <Badge variant="destructive">Active</Badge>
      ) : (
        <Badge variant="outline">Expired</Badge>
      )
    },
  },
  {
    key: "actor_email",
    label: "Actor",
    render: (v) => (
      <span className="font-mono text-xs">{String(v ?? "—")}</span>
    ),
  },
  {
    key: "target_email",
    label: "Target",
    render: (v) => (
      <span className="font-mono text-xs">{String(v ?? "—")}</span>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    render: (v) => {
      const s = String(v ?? "")
      return s.length > 60 ? s.slice(0, 60) + "…" : s
    },
  },
  {
    key: "expected_end_at",
    label: "Expected end",
    render: (v) => fmt(v as Date | null | undefined),
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
    key: "_actions",
    label: "",
    align: "right",
    render: (_v, row) => {
      const expected = row.expected_end_at as Date | null
      const stillActive =
        !row.ended_at &&
        (!expected || new Date(expected).getTime() > Date.now())
      if (!stillActive) return "—"
      return <ForceEndButton id={row.id as string} />
    },
  },
]

interface SearchParams {
  active?: string
  page?: string
}

async function loadImpersonations(params: SearchParams) {
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  return withAdminBypass(async (db) => {
    const actor = aliasedTable(app_user, "actor")
    const target = aliasedTable(app_user, "target")

    const filters = []
    if (params.active === "true") {
      filters.push(isNull(impersonation.ended_at))
      filters.push(gt(impersonation.expected_end_at, sql`now()`))
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
          id: impersonation.id,
          started_at: impersonation.started_at,
          ended_at: impersonation.ended_at,
          expected_end_at: impersonation.expected_end_at,
          reason: impersonation.reason,
          workspace_id: impersonation.workspace_id,
          actor_email: actor.email,
          target_email: target.email,
        })
        .from(impersonation)
        .leftJoin(actor, eq(actor.id, impersonation.actor_user_id))
        .leftJoin(target, eq(target.id, impersonation.target_user_id))
        .where(where)
        .orderBy(desc(impersonation.started_at))
        .limit(PAGE_SIZE)
        .offset(pageIndex * PAGE_SIZE),
      db.select({ total: count() }).from(impersonation).where(where),
    ])

    return {
      rows: dataRows as ImpersonationRow[],
      total: Number(countRows[0]?.total ?? 0),
    }
  })
}

export default async function ImpersonationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  let data: Awaited<ReturnType<typeof loadImpersonations>>
  try {
    data = await loadImpersonations(params)
  } catch {
    data = { rows: [], total: 0 }
  }

  const current: Record<string, string> = {}
  if (params.active) current.active = params.active

  function buildPageHref(idx: number): string {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(current)) sp.set(k, v)
    if (idx > 0) sp.set("page", String(idx))
    const qs = sp.toString()
    return qs ? `/compliance/impersonation?${qs}` : "/compliance/impersonation"
  }

  await auditOnce("admin.compliance.impersonation_viewed")

  return (
    <DataTablePage
      title="Impersonation log"
      description="Every staff impersonation session, newest first."
      columns={COLUMNS}
      rows={data.rows.map((r) => ({ ...r }) as Record<string, unknown>)}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows: data.total }}
      pageHrefBuilder={buildPageHref}
      filters={<Filters schema={FILTER_SCHEMA} current={current} />}
      auditPrefix="admin.compliance.impersonation"
      emptyTitle="No impersonation sessions"
      emptyDescription="Nothing matches the current filter."
    />
  )
}
