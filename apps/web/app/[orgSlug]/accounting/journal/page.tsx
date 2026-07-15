import { notFound } from "next/navigation"

import {
  fetchJournalRows,
  getOrgAccountingContext,
} from "../../_lib/accounting-data"
import { DenikBody } from "../../../_components/denik/denik-body"
import { DenikHeader } from "../../../_components/denik/denik-header"
import { DenikProvider } from "../../../_components/denik/context"
import type { JournalRow } from "../../../_components/denik/data"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

export const metadata = { title: "Journal" }

/**
 * Deník (journal) — the double-entry postings of the period in chronological
 * book order (§13). Table archetype; fills the wired `accounting › Books ›
 * Journal` nav slot. Server-fetched: resolves the org's latest period and runs
 * the same domain read as `GET /v1/accounting/periods/{id}/journal`.
 */
export default async function JournalPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) notFound()

  const domainRows = await fetchJournalRows(ctx)
  const rows: JournalRow[] = domainRows.map((r) => ({
    postingId: r.posting_id,
    postingDate: r.posting_date,
    isOpening: r.is_opening,
    summaryDesignation: r.summary_designation,
    summaryType: r.summary_type,
    accountingEventId: r.accounting_event_id,
    lineId: r.line_id,
    accountId: r.account_id,
    accountNumber: r.account_number,
    accountName: r.account_name,
    side: r.side,
    amount: r.amount,
    eventDescription: r.event_description,
    counterpartyName: r.counterparty_name,
    createdByAgent: r.inbox_id != null,
  }))

  return (
    <DenikProvider>
      <AppPageHeader>
        <DenikHeader />
      </AppPageHeader>
      <DenikBody rows={rows} />
    </DenikProvider>
  )
}
