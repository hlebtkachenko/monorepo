import { HeldWritesBody } from "../../../_components/held-writes/held-writes-body"
import { HeldWritesHeader } from "../../../_components/held-writes/held-writes-header"
import { AppPageHeader } from "../../../_components/app-page-header"
import type {
  AccountOption,
  HeldWriteListRow,
} from "../../../_components/held-writes/columns"
import { buildHeldWriteViewModel } from "../../../_components/held-writes/view-model"
import {
  fetchChartAccounts,
  fetchHeldWrites,
  getOrgAccountingContext,
  summarizeGatedPayload,
  trimGatedTimestamp,
} from "../../_lib/accounting-data"

export const metadata = { title: "Ke schválení" }

/**
 * Held-writes review queue ("Ke schválení") — gated accounting writes the
 * confidence gate held (202) awaiting human review. Fills the accounting
 * module's Posting-approvals nav slot. The inspector exposes the full
 * original payload and resolves the write via the `resolveHeldWrite` action.
 *
 * [M1.7] `accounts` feeds the edit-before-approve account picker (a
 * double-entry posting line's `accountId` is a raw uuid — the reviewer picks
 * by number/name, never types the uuid). Fetched from the SAME chart the
 * chart-of-accounts page uses, scoped to the active period.
 */
export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const held = ctx ? await fetchHeldWrites(ctx) : []
  const chartAccounts = ctx ? await fetchChartAccounts(ctx) : []

  const accounts: AccountOption[] = chartAccounts.map((a) => ({
    id: a.id,
    label: `${a.number} — ${a.name}`,
  }))

  const rows: HeldWriteListRow[] = held.map((row) => {
    const review = buildHeldWriteViewModel(row)
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
      template_id: row.template_id,
      template_confirmed: row.template_confirmed,
    }
  })

  return (
    <>
      <AppPageHeader>
        <HeldWritesHeader />
      </AppPageHeader>
      <HeldWritesBody rows={rows} orgSlug={orgSlug} accounts={accounts} />
    </>
  )
}
