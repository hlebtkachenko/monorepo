import { DenikBody } from "../../_components/denik/denik-body"
import { DenikHeader } from "../../_components/denik/denik-header"
import { DenikProvider } from "../../_components/denik/context"
import { OrgPageHeader } from "../../_components/org-page-header"

export const metadata = { title: "Deník" }

/**
 * Deník (journal) — the double-entry postings of the period in chronological
 * book order (§13). Table archetype: renders into the persistent org shell via
 * `OrgPageHeader` (content-header slot) + `DenikBody` (the ContentPanel body).
 * `DenikProvider` links the two slots (tabs + inspector state).
 *
 * Reads a fixture today; wired to `GET /v1/accounting/periods/{id}/journal`
 * (see denik/data.ts TODO) once the period is resolved server-side.
 */
export default function DenikPage() {
  return (
    <DenikProvider>
      <OrgPageHeader>
        <DenikHeader />
      </OrgPageHeader>
      <DenikBody />
    </DenikProvider>
  )
}
