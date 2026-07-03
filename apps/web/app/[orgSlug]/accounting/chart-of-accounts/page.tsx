import { ChartBody } from "../../../_components/chart-of-accounts/chart-body"
import { ChartHeader } from "../../../_components/chart-of-accounts/chart-header"
import { ChartProvider } from "../../../_components/chart-of-accounts/context"
import type { AccountRow } from "../../../_components/chart-of-accounts/data"
import { OrgPageHeader } from "../../../_components/org-page-header"
import {
  fetchChartAccounts,
  getOrgAccountingContext,
} from "../../_lib/accounting-data"

export const metadata = { title: "Chart of accounts" }

/**
 * Účtový rozvrh (chart of accounts) — the account list. Table archetype; fills
 * the wired `accounting › Structure › Chart of accounts` nav slot.
 * Server-fetched: the latest period's `account` table, camelCased for the UI.
 */
export default async function ChartOfAccountsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const accounts = ctx ? await fetchChartAccounts(ctx) : []

  const rows: AccountRow[] = accounts.map((r) => ({
    accountId: r.id,
    accountNumber: r.number,
    accountName: r.name,
    nature: r.nature,
    normalBalance: r.normal_balance as AccountRow["normalBalance"],
    tracksOpenItems: r.tracks_open_items,
  }))

  return (
    <ChartProvider>
      <OrgPageHeader>
        <ChartHeader />
      </OrgPageHeader>
      <ChartBody rows={rows} />
    </ChartProvider>
  )
}
