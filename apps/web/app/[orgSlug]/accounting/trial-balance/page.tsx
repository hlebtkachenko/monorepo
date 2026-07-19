import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import {
  fetchLedgerRows,
  getOrgAccountingContext,
} from "@/lib/org/accounting-data"
import { LedgerBody } from "../../../_components/ledger/ledger-body"
import { LedgerProvider } from "../../../_components/ledger/context"
import type { LedgerRow } from "../../../_components/ledger/data"

export const metadata = { title: "Obratová předvaha" }

/**
 * Obratová předvaha (trial balance) — per-account počáteční stav | obraty MD/Dal
 * | konečný stav, straight from the `account_period_balance` read-model. Same
 * domain read as the general ledger (`GET /v1/accounting/periods/{id}/ledger`);
 * fills the wired `accounting › Books › Trial balance` nav slot.
 */
export default async function TrialBalancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const domainRows = ctx ? await fetchLedgerRows(ctx) : []
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
        <ContentHeader title="Obratová předvaha" />
      </AppPageHeader>
      <LedgerBody rows={rows} />
    </LedgerProvider>
  )
}
