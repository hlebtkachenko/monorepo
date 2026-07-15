import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { SaldokontoBody } from "../../../_components/saldokonto/saldokonto-body"
import { SaldokontoProvider } from "../../../_components/saldokonto/context"
import type {
  OpenItemRow,
  SaldoPartnerRow,
} from "../../../_components/saldokonto/data"
import {
  fetchOpenItems,
  fetchSaldoPerPartner,
  getOrgAccountingContext,
} from "../../_lib/accounting-data"

export const metadata = { title: "Závazky a pohledávky" }

/**
 * Doklady závazků a pohledávek (obligation vouchers) — open items in both
 * directions. Table archetype; fills the wired `documents › Obligation vouchers`
 * nav slot. Server-fetched: the same `open_item` reads the saldokonto page uses
 * (`GET /v1/accounting/open-items` + `/saldokonto`), mapped to the camelCase UI
 * rows (money stays a decimal string).
 */
export default async function ObligationVouchersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const [openItems, saldo] = ctx
    ? await Promise.all([fetchOpenItems(ctx), fetchSaldoPerPartner(ctx)])
    : [[], []]

  const rows: OpenItemRow[] = openItems.map((r) => ({
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

  const partners: SaldoPartnerRow[] = saldo.map((r) => ({
    counterpartyId: r.counterparty_id,
    accountNumber: r.account_number,
    direction: r.direction,
    openTotal: r.open_total,
  }))

  return (
    <SaldokontoProvider>
      <AppPageHeader>
        <ContentHeader title="Závazky a pohledávky" />
      </AppPageHeader>
      <SaldokontoBody rows={rows} partners={partners} />
    </SaldokontoProvider>
  )
}
