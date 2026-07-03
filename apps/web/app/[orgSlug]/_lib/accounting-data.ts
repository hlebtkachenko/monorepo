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
