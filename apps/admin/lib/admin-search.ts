"use server"

import "server-only"

import { desc, eq, ilike, or, type SQL } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  audit_event,
  organization,
  tool_call_log,
  workspace,
} from "@workspace/db/schema"

import { auditOnce } from "./admin-audit"
import { requireAdminCapability } from "./admin-capability"
import type { SearchResult } from "./admin-search-types"

const PER_KIND_LIMIT = 5
const MIN_QUERY_LENGTH = 2
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Search across organizations, users, workspaces, audit-event actions, and
 * tool-call-log tool names. Returns up to `PER_KIND_LIMIT * 5` results.
 * Empty / short queries short-circuit to `[]` so the palette can render
 * without firing a query for every keystroke.
 *
 * Capability: `admin:read`. Audit: `admin.search.queried` (debounced to one
 * row per 5s per actor via `auditOnce`).
 */
export async function searchAllAction(query: string): Promise<SearchResult[]> {
  await requireAdminCapability("admin:read")

  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return []
  }

  const like = `%${trimmed}%`
  const prefix = `${trimmed}%`
  const isUuid = UUID_RE.test(trimmed)

  const results = await withAdminBypass(async (db) => {
    const orgFilters: SQL[] = [
      ilike(organization.slug, like),
      ilike(organization.legal_name, like),
    ]
    if (isUuid) orgFilters.push(eq(organization.id, trimmed))
    const orgRows = await db
      .select({
        id: organization.id,
        slug: organization.slug,
        legal_name: organization.legal_name,
      })
      .from(organization)
      .where(or(...orgFilters))
      .limit(PER_KIND_LIMIT)

    const userFilters: SQL[] = [
      ilike(app_user.email, like),
      ilike(app_user.name, like),
    ]
    if (isUuid) userFilters.push(eq(app_user.id, trimmed))
    const userRows = await db
      .select({
        id: app_user.id,
        email: app_user.email,
        name: app_user.name,
      })
      .from(app_user)
      .where(or(...userFilters))
      .limit(PER_KIND_LIMIT)

    const workspaceFilters: SQL[] = [ilike(workspace.display_name, like)]
    if (isUuid) workspaceFilters.push(eq(workspace.id, trimmed))
    const workspaceRows = await db
      .select({
        id: workspace.id,
        display_name: workspace.display_name,
      })
      .from(workspace)
      .where(or(...workspaceFilters))
      .limit(PER_KIND_LIMIT)

    const auditRows = await db
      .select({
        id: audit_event.id,
        action: audit_event.action,
      })
      .from(audit_event)
      .where(ilike(audit_event.action, prefix))
      .orderBy(desc(audit_event.created_at))
      .limit(PER_KIND_LIMIT)

    const toolRows = await db
      .select({
        id: tool_call_log.id,
        tool_name: tool_call_log.tool_name,
      })
      .from(tool_call_log)
      .where(ilike(tool_call_log.tool_name, prefix))
      .orderBy(desc(tool_call_log.created_at))
      .limit(PER_KIND_LIMIT)

    return { orgRows, userRows, workspaceRows, auditRows, toolRows }
  })

  const out: SearchResult[] = []

  for (const row of results.orgRows) {
    out.push({
      kind: "org",
      id: row.id,
      label: row.slug,
      sublabel: row.legal_name,
      href: `/orgs/${row.id}`,
    })
  }
  for (const row of results.userRows) {
    out.push({
      kind: "user",
      id: row.id,
      label: row.email,
      sublabel: row.name || undefined,
      href: `/users/${row.id}`,
    })
  }
  for (const row of results.workspaceRows) {
    out.push({
      kind: "workspace",
      id: row.id,
      label: row.display_name,
      href: `/staff/members?workspace=${row.id}`,
    })
  }
  for (const row of results.auditRows) {
    out.push({
      kind: "audit",
      id: row.id,
      label: row.action,
      href: `/compliance/audit?action=${encodeURIComponent(row.action)}`,
    })
  }
  for (const row of results.toolRows) {
    out.push({
      kind: "tool",
      id: row.id,
      label: row.tool_name,
      href: `/agents/tools?name=${encodeURIComponent(row.tool_name)}`,
    })
  }

  await auditOnce(
    "admin.search.queried",
    5_000,
    { query: trimmed, count: out.length },
    null,
  )

  return out
}
