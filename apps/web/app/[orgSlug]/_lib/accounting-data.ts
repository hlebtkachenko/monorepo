import "server-only"

import { and, eq } from "drizzle-orm"
import {
  sql,
  executeRows,
  withAdminBypass,
  withOrganization,
} from "@workspace/db"
import { organization, organization_membership } from "@workspace/db/schema"
import {
  journal,
  generalLedger,
  unsettledOpenItems,
  saldoPerPartner,
  type JournalRow as DomainJournalRow,
  type LedgerAccountRow,
} from "@workspace/accounting"

import { getRequestSession } from "./request-session"

/**
 * Server-side data access for the accounting pages.
 *
 * Each page resolves the org + latest accounting period once, then runs the
 * SAME domain reads the public /v1 accounting API uses (journal,
 * generalLedger, open items) inside `withOrganization` (FORCE RLS). The org
 * slug → id lookup mirrors the layout's membership resolution; the layout has
 * already gated access, this re-resolve only recovers the ids the layout
 * cannot pass down through the RSC tree.
 */
export interface OrgAccountingContext {
  organizationId: string
  userId: string
  /** Latest accounting period, or null when the org has no books yet. */
  periodId: string | null
  periodStart: string | null
  periodEnd: string | null
}

export async function getOrgAccountingContext(
  orgSlug: string,
): Promise<OrgAccountingContext | null> {
  const session = await getRequestSession()
  if (!session) return null
  const userId = session.user.id

  const org = await withAdminBypass(async (db) => {
    const rows = await db
      .select({ id: organization.id })
      .from(organization)
      .innerJoin(
        organization_membership,
        and(
          eq(organization_membership.organization_id, organization.id),
          eq(organization_membership.user_id, userId),
        ),
      )
      .where(eq(organization.slug, orgSlug))
      .limit(1)
    return rows[0] ?? null
  })
  if (!org) return null

  const period = await withOrganization(org.id, userId, async (db) => {
    const rows = await executeRows<{
      id: string
      period_start: string
      period_end: string
    }>(
      db,
      sql`select id, period_start::text, period_end::text
          from accounting_period
          order by period_start desc
          limit 1`,
    )
    return rows[0] ?? null
  })

  return {
    organizationId: org.id,
    userId,
    periodId: period?.id ?? null,
    periodStart: period?.period_start ?? null,
    periodEnd: period?.period_end ?? null,
  }
}

export async function fetchJournalRows(
  ctx: OrgAccountingContext,
): Promise<DomainJournalRow[]> {
  if (!ctx.periodId) return []
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    journal(db, ctx.periodId!),
  )
}

export async function fetchLedgerRows(
  ctx: OrgAccountingContext,
): Promise<LedgerAccountRow[]> {
  if (!ctx.periodId) return []
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    generalLedger(db, ctx.periodId!),
  )
}

export async function fetchOpenItems(ctx: OrgAccountingContext) {
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    unsettledOpenItems(db, {}),
  )
}

export async function fetchSaldoPerPartner(ctx: OrgAccountingContext) {
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    saldoPerPartner(db),
  )
}

export interface ChartAccountRow {
  id: string
  number: string
  name: string
  nature: string
  /** NULL for sign-flip accounts (e.g. 431 — no fixed normal side). */
  normal_balance: string | null
  tracks_open_items: boolean
}

export async function fetchChartAccounts(
  ctx: OrgAccountingContext,
): Promise<ChartAccountRow[]> {
  if (!ctx.periodId) return []
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    executeRows<ChartAccountRow>(
      db,
      sql`select id, number, name, nature, normal_balance, tracks_open_items
          from account
          where period_id = ${ctx.periodId}
          order by number`,
    ),
  )
}

/** "YYYY-MM-DD HH:MM:SS+TZ" (Postgres text) -> "YYYY-MM-DD HH:MM". Shared by the held-writes + inbox pages. */
export function trimGatedTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value)
  return match ? `${match[1]} ${match[2]}` : value
}

/** Human one-liner from a gated tool_call_log payload: description > type > posting-kind > tool name. */
export function summarizeGatedPayload(row: {
  tool_name: string
  input_json: unknown
}): string {
  const input = row.input_json as Record<string, unknown> | null
  if (input && typeof input["description"] === "string")
    return input["description"]
  if (input && typeof input["type"] === "string") return String(input["type"])
  if (input && typeof input["kind"] === "string")
    return `posting (${String(input["kind"])})`
  return row.tool_name
}

export interface HeldWriteRow {
  id: string
  tool_name: string
  idempotency_key: string
  actor_kind: string
  confidence: string
  rationale: string | null
  created_at: string
  /** Original gated payload — shown to the reviewer verbatim. */
  input_json: unknown
}

/**
 * Gated writes the confidence gate HELD (202) — the human review queue.
 * A held row has auto_applied = false and no approver yet.
 */
export async function fetchHeldWrites(
  ctx: OrgAccountingContext,
): Promise<HeldWriteRow[]> {
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    executeRows<HeldWriteRow>(
      db,
      sql`select id, tool_name, idempotency_key, actor_kind::text as actor_kind,
                 confidence::text as confidence, rationale,
                 created_at::text as created_at, input_json
          from tool_call_log
          where auto_applied = false and approved_by_user_id is null
          order by created_at desc`,
    ),
  )
}

export interface IngestionInboxRow {
  id: string
  tool_name: string
  actor_kind: string
  confidence: string | null
  rationale: string | null
  created_at: string
  auto_applied: boolean
  approved_by_user_id: string | null
  /** `output_json.resolution` when resolved by a human ("approved"/"rejected"). */
  resolution: string | null
  /** Original gated payload — the page derives a one-line summary from it. */
  input_json: unknown
}

/**
 * Read-only ingestion overview — every gated write the org's brain runs land in
 * `tool_call_log` (same source the approvals queue reads), here surfaced as a
 * flat status feed regardless of outcome: auto-applied, held for review,
 * approved, or rejected. No resolution actions live here; the inbox is a view,
 * the approvals page owns the approve/reject flow.
 */
export async function fetchIngestionInbox(
  ctx: OrgAccountingContext,
): Promise<IngestionInboxRow[]> {
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    executeRows<IngestionInboxRow>(
      db,
      sql`select id, tool_name, actor_kind::text as actor_kind,
                 confidence::text as confidence, rationale,
                 created_at::text as created_at, auto_applied,
                 approved_by_user_id::text as approved_by_user_id,
                 output_json->>'resolution' as resolution,
                 input_json
          from tool_call_log
          order by created_at desc
          limit 200`,
    ),
  )
}

export interface DocumentListRow {
  id: string
  designation: string
  type: string
  issued_at: string
  base_total: string
  vat_total: string
  counterparty_name: string | null
}

/** Captured documents (summary records) with per-document totals. */
export async function fetchDocuments(
  ctx: OrgAccountingContext,
): Promise<DocumentListRow[]> {
  if (!ctx.periodId) return []
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    executeRows<DocumentListRow>(
      db,
      sql`select sr.id,
                 sr.designation,
                 sr.type::text as type,
                 sr.issued_at::date::text as issued_at,
                 coalesce(sum(pr.base_in_accounting_currency), 0)::text as base_total,
                 coalesce(sum(pr.vat_in_accounting_currency), 0)::text as vat_total,
                 max(cp.name) as counterparty_name
          from summary_record sr
          left join individual_record ir on ir.summary_record_id = sr.id
          left join partial_record pr on pr.individual_record_id = ir.id
          left join accounting_event ae on ae.id = ir.accounting_event_id
          left join counterparty cp on cp.id = ae.counterparty_id
          where sr.period_id = ${ctx.periodId}
          group by sr.id, sr.designation, sr.type, sr.issued_at
          order by sr.issued_at desc, sr.designation desc`,
    ),
  )
}
