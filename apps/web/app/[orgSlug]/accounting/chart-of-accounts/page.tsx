import { ChartBody } from "../../../_components/chart-of-accounts/chart-body"
import { ChartHeader } from "../../../_components/chart-of-accounts/chart-header"
import { ChartProvider } from "../../../_components/chart-of-accounts/context"
import { OrgPageHeader } from "../../../_components/org-page-header"

export const metadata = { title: "Chart of accounts" }

/**
 * Účtový rozvrh (chart of accounts) — the account list. Table archetype; fills
 * the wired `accounting › Structure › Chart of accounts` nav slot. Fixture-backed
 * (chart-of-accounts/data.ts TODO) until a chart-of-accounts read endpoint ships.
 */
export default function ChartOfAccountsPage() {
  return (
    <ChartProvider>
      <OrgPageHeader>
        <ChartHeader />
      </OrgPageHeader>
      <ChartBody />
    </ChartProvider>
  )
}
