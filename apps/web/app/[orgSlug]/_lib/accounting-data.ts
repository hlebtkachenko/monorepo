import "server-only"

import { cookies } from "next/headers"
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
import {
  getHeaderPeriods,
  PERIOD_COOKIE,
  resolveActivePeriod,
} from "./header-periods"

/**
 * Server-side data access for the accounting pages.
 *
 * Each page resolves the org + active accounting period (resolved from the
 * shell `afframe_period` cookie) once, then runs the SAME domain reads the
 * public /v1 accounting API uses (journal, generalLedger, open items) inside
 * `withOrganization` (FORCE RLS). The org slug → id lookup mirrors the
 * layout's membership resolution; the layout has already gated access, this
 * re-resolve only recovers the ids the layout cannot pass down through the
 * RSC tree.
 */
export interface OrgAccountingContext {
  organizationId: string
  userId: string
  /** The caller's membership role for the org (drives owner/admin edit affordances). */
  role: "owner" | "admin" | "member" | "agent" | "guest"
  /** Active accounting period resolved from the `afframe_period` shell cookie, or null when the org has no books yet. */
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
      .select({
        id: organization.id,
        role: organization_membership.role,
      })
      .from(organization)
      .innerJoin(
        organization_membership,
        and(
          eq(organization_membership.organization_id, organization.id),
          eq(organization_membership.user_id, userId),
          eq(organization_membership.active, true),
        ),
      )
      .where(eq(organization.slug, orgSlug))
      .limit(1)
    return rows[0] ?? null
  })
  if (!org) return null

  const periods = await getHeaderPeriods({ organizationId: org.id })
  const cookieStore = await cookies()
  const period = resolveActivePeriod(
    periods,
    cookieStore.get(PERIOD_COOKIE)?.value,
  )

  return {
    organizationId: org.id,
    userId,
    role: org.role,
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

/** "YYYY-MM-DD HH:MM:SS+TZ" (Postgres text) -> "YYYY-MM-DD HH:MM". Shared across the inbox held + feed reads. */
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
  /** Audit correlation id (opaque UUID) — held writes for the SAME účetní případ share one. */
  conversation_id: string | null
  /** Original gated payload — the review view-model shapes header + VAT summary from this. */
  input_json: unknown
  /**
   * The gate's full audit record (`{payloadHash, serverGate, status, reviewId}` —
   * accounting-writes.gate.ts). The review view-model reads `serverGate.veto` +
   * `serverGate.score.reasons` to explain WHY the write is held.
   */
  output_json: unknown
  /**
   * [WS-2] OCR extraction template this write was derived from, read from the
   * gate's audit `output_json.serverGate.templateId` (NULL for structured-export
   * writes). The gate persists it there for every gated write; `input_json` also
   * carries it on captures, but `serverGate` is the canonical, tool-agnostic slot.
   */
  template_id: string | null
  /**
   * Whether that template has been human-confirmed (`human_confirmed_at` set).
   * Read from the workspace-scoped `ocr_extraction_template`, resolvable in this
   * `withOrganization` tx. `false` when there is no template on the row OR the
   * template row no longer exists — display gates on `template_id` being present.
   */
  template_confirmed: boolean
  /**
   * [M0.5] The counterparty (protistrana) name for this write's účetní případ,
   * resolved server-side so the reviewer sees a name instead of a raw uuid.
   * `createAccountingEvent` carries `counterpartyId` directly; a document
   * capture / posting instead references an existing `accounting_event` (via
   * the first line's `eventId`, or `entry.accountingEventId`) whose
   * `counterparty_id` is read here. Null when nothing resolves.
   */
  counterparty_name: string | null
  /** Označení of the účetní případ this write books (`ae.designation`, e.g. `UC2025000005`). Null when no event resolves. */
  case_designation: string | null
  /** The účetní případ description (`ae.description`) — carries the supplier/context when no counterparty row is linked. Null for none. */
  case_description: string | null
  /** Označení of the doklad the posting books from (`sr.designation`, e.g. `FP20250005`). Only a posting references one; null otherwise. */
  document_designation: string | null
}

/**
 * Gated writes the confidence gate HELD (202) — the human review queue.
 * A held row has auto_applied = false and no approver yet.
 *
 * The template LEFT JOIN keys on the audit `serverGate.templateId` and reads the
 * template's confirmation state so the reviewer sees which OCR template produced
 * the booking (workspace-scoped table, resolvable under this tx's `app.workspace_id`).
 *
 * [M0.5] The accounting_event + counterparty LEFT JOINs resolve the header's
 * counterparty name: `createAccountingEvent` carries `counterpartyId` directly
 * on the payload; `captureAccountingDocument` / `createAccountingPosting`
 * instead reference an ALREADY-CREATED `accounting_event` (a document/posting
 * cannot exist without one), so their counterparty is read through it. A
 * multi-event document capture (rare — e.g. a BATCH bank statement) is
 * represented by its FIRST line's event only; good enough for a header, not a
 * line-level breakdown.
 */
export async function fetchHeldWrites(
  ctx: OrgAccountingContext,
): Promise<HeldWriteRow[]> {
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    executeRows<HeldWriteRow>(
      db,
      sql`select l.id, l.tool_name, l.idempotency_key,
                 l.actor_kind::text as actor_kind,
                 l.confidence::text as confidence, l.rationale,
                 l.created_at::text as created_at,
                 l.conversation_id::text as conversation_id,
                 l.input_json, l.output_json,
                 (l.output_json->'serverGate'->>'templateId') as template_id,
                 (t.human_confirmed_at is not null) as template_confirmed,
                 coalesce(
                   cp.name,
                   case when l.tool_name = 'createAccountingEvent'
                     then l.input_json->'counterparty'->>'name'
                   end
                 ) as counterparty_name,
                 ae.designation as case_designation,
                 ae.description as case_description,
                 sr.designation as document_designation
          from tool_call_log l
          left join ocr_extraction_template t
            on t.id = (l.output_json->'serverGate'->>'templateId')::uuid
          left join accounting_event ae
            on ae.id = (case l.tool_name
                 when 'captureAccountingDocument'
                   then l.input_json->'lines'->0->>'eventId'
                 when 'createAccountingPosting'
                   then l.input_json->'entry'->>'accountingEventId'
               end)::uuid
          left join summary_record sr
            on sr.id = (case l.tool_name
                 when 'createAccountingPosting'
                   then l.input_json->'entry'->>'summaryRecordId'
               end)::uuid
          left join counterparty cp
            on cp.id = coalesce(
                 ae.counterparty_id,
                 case when l.tool_name = 'createAccountingEvent'
                   then (l.input_json->>'counterpartyId')::uuid
                 end
               )
          where l.auto_applied = false and l.approved_by_user_id is null
          order by l.created_at desc`,
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
  /** true once the document is booked (a posting references its summary_record). */
  is_posted: boolean
  /** A posting id to drill into (one per event; the earliest), or null if unposted. */
  posting_id: string | null
  /** [Tier 4] The inbox_item this doc landed from — non-null ⇒ "Created by Agent". */
  inbox_id: string | null
}

/** Captured documents (summary records) with per-document totals + posting status. */
export async function fetchDocuments(
  ctx: OrgAccountingContext,
): Promise<DocumentListRow[]> {
  if (!ctx.periodId) return []
  return withOrganization(ctx.organizationId, ctx.userId, (db) =>
    executeRows<DocumentListRow>(
      db,
      // `pg` (a posting-per-summary_record aggregate) is joined ONCE so its
      // count/id don't multiply the per-partial sums above. is_posted lets a list
      // show which captured documents are booked; posting_id is a drill target.
      sql`select sr.id,
                 sr.designation,
                 sr.type::text as type,
                 sr.issued_at::date::text as issued_at,
                 coalesce(sum(pr.base_in_accounting_currency), 0)::text as base_total,
                 coalesce(sum(pr.vat_in_accounting_currency), 0)::text as vat_total,
                 max(cp.name) as counterparty_name,
                 (pg.posting_id is not null) as is_posted,
                 pg.posting_id::text as posting_id,
                 sr.inbox_id::text as inbox_id
          from summary_record sr
          left join individual_record ir on ir.summary_record_id = sr.id
          left join partial_record pr on pr.individual_record_id = ir.id
          left join accounting_event ae on ae.id = ir.accounting_event_id
          left join counterparty cp on cp.id = ae.counterparty_id
          left join lateral (
            select p.id as posting_id
              from posting p
             where p.summary_record_id = sr.id
             order by p.posted_at, p.id
             limit 1
          ) pg on true
          where sr.period_id = ${ctx.periodId}
          group by sr.id, sr.designation, sr.type, sr.issued_at, pg.posting_id, sr.inbox_id
          order by sr.issued_at desc, sr.designation desc`,
    ),
  )
}
