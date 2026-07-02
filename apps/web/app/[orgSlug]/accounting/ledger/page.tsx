import { LedgerBody } from "../../../_components/ledger/ledger-body"
import { LedgerHeader } from "../../../_components/ledger/ledger-header"
import { LedgerProvider } from "../../../_components/ledger/context"
import { OrgPageHeader } from "../../../_components/org-page-header"

export const metadata = { title: "General ledger" }

/**
 * Hlavní kniha (general ledger) — per-account opening | turnover MD/Dal |
 * closing from the read-model. Table archetype; fills the wired
 * `accounting › Books › General ledger` nav slot. Fixture-backed
 * (ledger/data.ts TODO) until wired to `GET /v1/accounting/periods/{id}/ledger`.
 */
export default function LedgerPage() {
  return (
    <LedgerProvider>
      <OrgPageHeader>
        <LedgerHeader />
      </OrgPageHeader>
      <LedgerBody />
    </LedgerProvider>
  )
}
