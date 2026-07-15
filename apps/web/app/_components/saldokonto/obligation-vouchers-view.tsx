import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { SaldokontoBody } from "./saldokonto-body"
import { SaldokontoProvider } from "./context"
import type { OpenItemRow, SaldoPartnerRow } from "./data"
import {
  fetchOpenItems,
  fetchSaldoPerPartner,
  getOrgAccountingContext,
} from "../../[orgSlug]/_lib/accounting-data"

/**
 * Shared server view for the obligation-voucher routes (all / payable / receivable). The `open_item`
 * snake→camel remap lived once on the saldokonto page and would otherwise be copied per direction leaf;
 * this keeps it in ONE place, filtered by an optional `direction`. Money stays a decimal string.
 */
export async function ObligationVouchersView({
  orgSlug,
  title,
  direction,
}: {
  orgSlug: string
  title: string
  direction?: "PAYABLE" | "RECEIVABLE"
}) {
  const ctx = await getOrgAccountingContext(orgSlug)
  const [openItems, saldo] = ctx
    ? await Promise.all([fetchOpenItems(ctx), fetchSaldoPerPartner(ctx)])
    : [[], []]

  const rows: OpenItemRow[] = openItems
    .filter((r) => !direction || r.direction === direction)
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
    .filter((r) => !direction || r.direction === direction)
    .map((r) => ({
      counterpartyId: r.counterparty_id,
      accountNumber: r.account_number,
      direction: r.direction,
      openTotal: r.open_total,
    }))

  return (
    <SaldokontoProvider>
      <AppPageHeader>
        <ContentHeader title={title} />
      </AppPageHeader>
      <SaldokontoBody rows={rows} partners={partners} />
    </SaldokontoProvider>
  )
}
