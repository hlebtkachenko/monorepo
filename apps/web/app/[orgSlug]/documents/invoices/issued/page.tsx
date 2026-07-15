import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { DocumentsTable } from "../../../../_components/documents-received/documents-table"
import {
  fetchDocuments,
  getOrgAccountingContext,
} from "../../../_lib/accounting-data"

export const metadata = { title: "Faktury vydané" }

/**
 * Faktury vydané (issued invoices) — the captured issued-invoice documents of
 * the latest period. Table archetype; fills the wired
 * `documents › Invoices › Issued` nav slot. Server-fetched via `fetchDocuments`
 * (summary_record totals under FORCE RLS), then filtered to
 * `type === "ISSUED_INVOICE"`. Mirrors the received sibling; reuses the shared
 * `DocumentsTable` (same column set incl. the Zdroj provenance column), only
 * the counterparty header (Odběratel) and labels differ.
 */
export default async function IssuedInvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const documents = ctx ? await fetchDocuments(ctx) : []
  const rows = documents.filter((row) => row.type === "ISSUED_INVOICE")

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Faktury vydané" />
      </AppPageHeader>
      <DocumentsTable
        rows={rows}
        counterpartyHeader="Odběratel"
        searchPlaceholder="Search faktury vydané…"
      />
    </>
  )
}
