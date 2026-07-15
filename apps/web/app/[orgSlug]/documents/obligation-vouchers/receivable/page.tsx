import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { SaldokontoBody } from "../../../../_components/saldokonto/saldokonto-body"
import { SaldokontoProvider } from "../../../../_components/saldokonto/context"
import type {
  OpenItemRow,
  SaldoPartnerRow,
} from "../../../../_components/saldokonto/data"
import {
  fetchOpenItems,
  fetchSaldoPerPartner,
  getOrgAccountingContext,
} from "../../../_lib/accounting-data"

export const metadata = { title: "Pohledávky" }

/**
 * Pohledávky (receivables) — open items in the RECEIVABLE direction only. Table
 * archetype; the receivable leaf of `documents › Obligation vouchers`. Reuses
 * the saldokonto reads + table, filtered to `direction === "RECEIVABLE"`.
 */
export default async function ReceivableObligationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const [openItems, saldo] = ctx
    ? await Promise.all([fetchOpenItems(ctx), fetchSaldoPerPartner(ctx)])
    : [[], []]

  const rows: OpenItemRow[] = openItems
    .filter((r) => r.direction === "RECEIVABLE")
    .map((r) => ({
      id: r.id,
      counterpartyId: r.counterparty_id,
      accountNumber: r.account_number,
      direction: r.direction,
      variableSymbol: r.variable_symbol,
      originalAmount: r.original_amount,
      settledAmount: r.settled_amount,
      remainingAmount: r.remaining_amount,
      isSettled: r.is_settled,
      currencyCode: r.currency_code,
      issueDate: r.issue_date,
      dueDate: r.due_date,
    }))

  const partners: SaldoPartnerRow[] = saldo
    .filter((r) => r.direction === "RECEIVABLE")
    .map((r) => ({
      counterpartyId: r.counterparty_id,
      accountNumber: r.account_number,
      direction: r.direction,
      openTotal: r.open_total,
    }))

  return (
    <SaldokontoProvider>
      <AppPageHeader>
        <ContentHeader title="Pohledávky" />
      </AppPageHeader>
      <SaldokontoBody rows={rows} partners={partners} />
    </SaldokontoProvider>
  )
}
