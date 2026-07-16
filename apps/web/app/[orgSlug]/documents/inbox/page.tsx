import type {
  InboxListRow,
  InboxStatus,
} from "../../../_components/documents-inbox/columns"
import { InboxView } from "../../../_components/documents-inbox/inbox-view"
import type {
  AccountOption,
  HeldWriteListRow,
} from "../../../_components/inbox-resolve/columns"
import {
  buildHeldWriteViewModel,
  type ChartAccountLookup,
} from "../../../_components/inbox-resolve/view-model"
import {
  fetchChartAccounts,
  fetchHeldWrites,
  fetchIngestionInbox,
  getOrgAccountingContext,
  summarizeGatedPayload,
  trimGatedTimestamp,
  type IngestionInboxRow,
} from "../../_lib/accounting-data"

export const metadata = { title: "Inbox" }

/** Ingestion outcome from the audit-row flags: auto-applied, held, or resolved. */
function deriveStatus(row: IngestionInboxRow): InboxStatus {
  if (row.auto_applied) return "applied"
  if (row.approved_by_user_id !== null) {
    return row.resolution === "rejected" ? "rejected" : "approved"
  }
  return "held"
}

/**
 * Records Inbox — the org's single review surface over the gated writes the
 * brain produces in `tool_call_log`. Renders BOTH reads: `fetchHeldWrites` (the
 * HELD subset, with the joins + `output_json` the resolve inspector needs) and
 * `fetchIngestionInbox` (the flat status feed, every outcome). `InboxView` shows
 * the HELD RESOLVE queue by default and the read-only feed as a second view.
 * Resolution (approve / reject / edit) runs through `resolveHeldWrite` — the
 * constitution-I7 human gate; an agent key is 403 on this route.
 *
 * `accounts` feeds the edit-before-approve picker (a posting line's `accountId`
 * is a raw uuid — the reviewer picks by number/name). Fetched from the SAME
 * chart the chart-of-accounts page uses, scoped to the active period.
 */
export default async function InboxPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)

  const held = ctx ? await fetchHeldWrites(ctx) : []
  const feed = ctx ? await fetchIngestionInbox(ctx) : []
  // Fetched ONCE for the whole page — the MD/D preview uses it only to label an
  // account number/id for display, never to compute the preview itself.
  const chartAccountRows = ctx ? await fetchChartAccounts(ctx) : []
  const chartAccounts: ChartAccountLookup[] = chartAccountRows.map((a) => ({
    id: a.id,
    number: a.number,
    name: a.name,
  }))

  // Edit-before-approve account picker options — a double-entry posting line's
  // accountId is a raw uuid, so the reviewer picks by number/name.
  const accounts: AccountOption[] = chartAccountRows.map((a) => ({
    id: a.id,
    label: `${a.number} — ${a.name}`,
  }))

  const heldRows: HeldWriteListRow[] = held.map((row) => {
    const review = buildHeldWriteViewModel(row, chartAccounts)
    return {
      id: row.id,
      tool_name: row.tool_name,
      idempotency_key: row.idempotency_key,
      actor_kind: row.actor_kind,
      confidence: row.confidence,
      rationale: row.rationale,
      created_at: trimGatedTimestamp(row.created_at),
      summary: summarizeGatedPayload(row),
      conversation_id: row.conversation_id,
      header: review.header,
      vat_summary: review.vatSummary,
      hold_reasons: review.holdReasons,
      posting_lines: review.postingLines,
      posting_kind: review.postingKind,
      mdd_preview: review.mddPreview,
      template_id: row.template_id,
      template_confirmed: row.template_confirmed,
    }
  })

  const feedRows: InboxListRow[] = feed.map((row) => ({
    id: row.id,
    tool_name: row.tool_name,
    actor_kind: row.actor_kind,
    confidence: row.confidence,
    rationale: row.rationale,
    created_at: trimGatedTimestamp(row.created_at),
    summary: summarizeGatedPayload(row),
    status: deriveStatus(row),
  }))

  return (
    <InboxView
      orgSlug={orgSlug}
      heldRows={heldRows}
      feedRows={feedRows}
      accounts={accounts}
    />
  )
}
