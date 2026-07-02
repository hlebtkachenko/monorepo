import { DenikBody } from "../../../_components/denik/denik-body"
import { DenikHeader } from "../../../_components/denik/denik-header"
import { DenikProvider } from "../../../_components/denik/context"
import { OrgPageHeader } from "../../../_components/org-page-header"

export const metadata = { title: "Journal" }

/**
 * Deník (journal) — the double-entry postings of the period in chronological
 * book order (§13). Table archetype; fills the wired `accounting › Books ›
 * Journal` nav slot. Fixture-backed (denik/data.ts TODO) until wired to
 * `GET /v1/accounting/periods/{id}/journal`.
 */
export default function JournalPage() {
  return (
    <DenikProvider>
      <OrgPageHeader>
        <DenikHeader />
      </OrgPageHeader>
      <DenikBody />
    </DenikProvider>
  )
}
