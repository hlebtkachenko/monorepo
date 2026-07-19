import { notFound } from "next/navigation"

import {
  fetchLedgerRows,
  getOrgAccountingContext,
} from "@/lib/org/accounting-data"
import { LedgerBody } from "../../../_components/ledger/ledger-body"
import { LedgerHeader } from "../../../_components/ledger/ledger-header"
import { LedgerProvider } from "../../../_components/ledger/context"
import type { LedgerRow } from "../../../_components/ledger/data"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

export const metadata = { title: "General ledger" }

/**
 * Hlavní kniha (general ledger) — per-account opening | turnover MD/Dal |
 * closing from the read-model. Table archetype; fills the wired
 * `accounting › Books › General ledger` nav slot. Server-fetched: resolves the
 * org's latest period and runs the same domain read as
 * `GET /v1/accounting/periods/{id}/ledger`.
 */
export default async function LedgerPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) notFound()

  const domainRows = await fetchLedgerRows(ctx)
  const rows: LedgerRow[] = domainRows.map((r) => ({
    accountId: r.account_id,
    accountNumber: r.account_number,
    accountName: r.account_name,
    nature: r.nature,
    normalBalance: r.normal_balance,
    openingBalance: r.opening_balance,
    turnoverDebit: r.turnover_debit,
    turnoverCredit: r.turnover_credit,
    closingBalance: r.closing_balance,
  }))

  return (
    <LedgerProvider>
      <AppPageHeader>
        <LedgerHeader />
      </AppPageHeader>
      <LedgerBody rows={rows} />
    </LedgerProvider>
  )
}
