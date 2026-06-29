import "server-only"

import Link from "next/link"
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization_membership,
  workspace_membership,
} from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"

import {
  DataTablePage,
  type ColumnDef,
  Filters,
  type FilterSchema,
} from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"
import { ExportCsvButton } from "./_components/export-csv-button"

export const metadata = { title: "Users" }

const PAGE_SIZE = 50

const FILTER_SCHEMA: FilterSchema = {
  fields: [
    {
      name: "q",
      label: "Search",
      type: "search",
      placeholder: "email or name",
    },
    {
      name: "banned",
      label: "Status",
      type: "select",
      options: [
        { label: "Banned", value: "true" },
        { label: "Active", value: "false" },
      ],
    },
    {
      name: "email_verified",
      label: "Email verified",
      type: "select",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
  ],
}

const COLUMNS: ColumnDef[] = [
  {
    key: "email",
    label: "Email",
    render: (_value, row) => (
      <Link
        href={`/users/${String(row.id)}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        {String(row.email ?? "")}
      </Link>
    ),
  },
  { key: "name", label: "Name" },
  {
    key: "banned",
    label: "Banned",
    render: (value) =>
      value ? (
        <Badge variant="destructive">Banned</Badge>
      ) : (
        <Badge variant="secondary">Active</Badge>
      ),
  },
  {
    key: "email_verified",
    label: "Email verified",
    render: (value) =>
      value ? (
        <Badge variant="default">Verified</Badge>
      ) : (
        <Badge variant="outline">Unverified</Badge>
      ),
  },
  { key: "workspaces_count", label: "Workspaces", align: "right" },
  { key: "orgs_count", label: "Orgs", align: "right" },
  {
    key: "created_at",
    label: "Created",
    render: (value) =>
      value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value ?? ""),
  },
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim() : ""
  const banned = typeof sp.banned === "string" ? sp.banned : ""
  const emailVerified =
    typeof sp.email_verified === "string" ? sp.email_verified : ""
  const pageIndex = Math.max(0, Number(sp.page ?? 0))

  const current: Record<string, string> = {}
  if (q) current.q = q
  if (banned) current.banned = banned
  if (emailVerified) current.email_verified = emailVerified

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

    const [dataRows, countRows] = await Promise.all([
      db
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
        .limit(PAGE_SIZE)
        .offset(pageIndex * PAGE_SIZE),
      db.select({ count: count() }).from(app_user).where(whereClause),
    ])

    return {
      rows: dataRows as Array<Record<string, unknown>>,
      total: Number(countRows[0]?.count ?? 0),
    }
  })

  await auditAdminAction({
    action: "admin.users.list_viewed",
    payload: { filters: current },
  })

  function buildPageHref(idx: number): string {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (banned) params.set("banned", banned)
    if (emailVerified) params.set("email_verified", emailVerified)
    if (idx > 0) params.set("page", String(idx))
    const qs = params.toString()
    return qs ? `/users?${qs}` : "/users"
  }

  return (
    <DataTablePage
      title="Users"
      description="All registered app users."
      columns={COLUMNS}
      rows={rows}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows: total }}
      pageHrefBuilder={buildPageHref}
      filters={<Filters schema={FILTER_SCHEMA} current={current} />}
      toolbar={<ExportCsvButton />}
      auditPrefix="admin.users"
      emptyTitle="No users found"
      emptyDescription="Try adjusting your search or filters."
    />
  )
}
