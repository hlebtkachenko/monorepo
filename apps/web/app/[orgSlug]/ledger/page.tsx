import { LedgerBody } from "../../_components/ledger/ledger-body"
import { LedgerHeader } from "../../_components/ledger/ledger-header"
import { LedgerProvider } from "../../_components/ledger/context"
import { OrgPageHeader } from "../../_components/org-page-header"

export const metadata = { title: "Hlavní kniha" }

/**
 * Hlavní kniha / obratová předvaha — per-account opening | turnover MD/Dal |
 * closing from the read-model. Table archetype; renders into the persistent org
 * shell via `OrgPageHeader` + `LedgerBody`. `LedgerProvider` links the slots.
 *
 * Reads a fixture today; wired to `GET /v1/accounting/periods/{id}/ledger`
 * (see ledger/data.ts TODO) once the period is resolved server-side.
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
