import "server-only"

import Link from "next/link"
import { and, count, desc, eq, ilike, isNotNull, isNull, lt } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { api_key } from "@workspace/db/schema"

import {
  DataTablePage,
  type ColumnDef,
  Filters,
  type FilterSchema,
} from "@/app/(gated)/_components"
import { auditOnce } from "@/lib/admin-audit"

import { IssueBrainAgentKeyButton } from "./_components/issue-brain-agent-key-button"
import { RevokeApiKeyButton } from "./_components/revoke-api-key-button"

export const metadata = { title: "API keys" }

const PAGE_SIZE = 50

const FILTER_SCHEMA: FilterSchema = {
  fields: [
    {
      name: "q",
      label: "Search",
      type: "search",
      placeholder: "name / prefix contains…",
    },
    {
      name: "org",
      label: "Organization",
      type: "search",
      placeholder: "organization_id",
    },
    {
      name: "status",
      label: "Status",
      type: "search",
      placeholder: "active | revoked | expired",
    },
  ],
}

function fmt(d: Date | null | undefined): string {
  if (!d) return "—"
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z"
}

function first8(value: string | null | undefined): string {
  if (!value) return "—"
  return value.slice(0, 8)
}

interface SearchParams {
  q?: string
  org?: string
  status?: string
  page?: string
}

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  organization_id: string
  scopes: string[]
  last_used_at: Date | null
  expires_at: Date | null
  revoked_at: Date | null
  created_at: Date
}

const COLUMNS: ColumnDef[] = [
  {
    key: "name",
    label: "Name",
    render: (_v, row) => (
      <span className="font-medium">{String(row.name)}</span>
    ),
  },
  {
    key: "prefix",
    label: "Prefix",
    render: (v) => (
      <code className="font-mono text-xs">{String(v ?? "—")}</code>
    ),
  },
  {
    key: "organization_id",
    label: "Organization",
    render: (v) => {
      const id = String(v ?? "")
      if (!id) return <span className="text-muted-foreground">—</span>
      return (
        <Link
          href={`/orgs/${id}`}
          className="font-mono text-xs text-primary underline-offset-4 hover:underline"
        >
          {first8(id)}
        </Link>
      )
    },
  },
  {
    key: "scopes",
    label: "Scopes",
    render: (v) => {
      const scopes = v as string[]
      if (!scopes || scopes.length === 0)
        return <span className="text-xs text-muted-foreground">none</span>
      return <span className="font-mono text-xs">{scopes.join(", ")}</span>
    },
  },
  {
    key: "last_used_at",
    label: "Last used",
    render: (v) => (
      <span className="text-xs text-muted-foreground">
        {fmt(v as Date | null)}
      </span>
    ),
  },
  {
    key: "expires_at",
    label: "Expires",
    render: (v) => (
      <span className="text-xs text-muted-foreground">
        {fmt(v as Date | null)}
      </span>
    ),
  },
  {
    key: "revoked_at",
    label: "Status",
    render: (v) => {
      if (v) {
        return (
          <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            Revoked
          </span>
        )
      }
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Active
        </span>
      )
    },
  },
  {
    key: "created_at",
    label: "Created",
    render: (v) => (
      <span className="text-xs text-muted-foreground">
        {fmt(v as Date | null)}
      </span>
    ),
  },
  {
    key: "actions",
    label: "",
    align: "right",
    render: (_v, row) => {
      if (row.revoked_at) {
        return (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Revoked
          </span>
        )
      }
      return (
        <RevokeApiKeyButton
          apiKeyId={String(row.id)}
          name={String(row.name)}
          prefix={String(row.prefix)}
        />
      )
    },
  },
]

async function loadApiKeys(params: SearchParams) {
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))
  const now = new Date()

  return withAdminBypass(async (db) => {
    const filters = []

    if (params.q) {
      filters.push(ilike(api_key.name, `%${params.q}%`))
    }
    if (params.org) {
      filters.push(eq(api_key.organization_id, params.org))
    }
    if (params.status === "revoked") {
      filters.push(isNotNull(api_key.revoked_at))
    } else if (params.status === "expired") {
      filters.push(isNull(api_key.revoked_at))
      filters.push(isNotNull(api_key.expires_at))
      filters.push(lt(api_key.expires_at, now))
    } else if (params.status === "active") {
      filters.push(isNull(api_key.revoked_at))
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
          id: api_key.id,
          name: api_key.name,
          prefix: api_key.prefix,
          organization_id: api_key.organization_id,
          scopes: api_key.scopes,
          last_used_at: api_key.last_used_at,
          expires_at: api_key.expires_at,
          revoked_at: api_key.revoked_at,
          created_at: api_key.created_at,
        })
        .from(api_key)
        .where(where)
        .orderBy(desc(api_key.created_at))
        .limit(PAGE_SIZE)
        .offset(pageIndex * PAGE_SIZE),
      db.select({ total: count() }).from(api_key).where(where),
    ])

    return {
      rows: dataRows as ApiKeyRow[],
      total: Number(countRows[0]?.total ?? 0),
    }
  })
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const pageIndex = Math.max(0, parseInt(params.page ?? "0", 10))

  let data: Awaited<ReturnType<typeof loadApiKeys>>
  try {
    data = await loadApiKeys(params)
  } catch {
    data = { rows: [], total: 0 }
  }

  const current: Record<string, string> = {}
  if (params.q) current.q = params.q
  if (params.org) current.org = params.org
  if (params.status) current.status = params.status

  function buildPageHref(idx: number): string {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(current)) sp.set(k, v)
    if (idx > 0) sp.set("page", String(idx))
    const qs = sp.toString()
    return qs ? `/platform/api-keys?${qs}` : "/platform/api-keys"
  }

  await auditOnce("admin.dev.api_keys_viewed")

  return (
    <DataTablePage
      title="API keys"
      description="Organization-scoped machine-auth credentials. key_hash and secret are never displayed."
      columns={COLUMNS}
      rows={data.rows.map((r) => ({ ...r }) as Record<string, unknown>)}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows: data.total }}
      pageHrefBuilder={buildPageHref}
      filters={<Filters schema={FILTER_SCHEMA} current={current} />}
      toolbar={<IssueBrainAgentKeyButton />}
      auditPrefix="admin.dev.api_keys"
      emptyTitle="No API keys"
      emptyDescription="Try adjusting filters or wait for keys to be created."
    />
  )
}
