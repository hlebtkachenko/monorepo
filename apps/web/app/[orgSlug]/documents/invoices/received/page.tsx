import { DocumentsReceivedBody } from "../../../../_components/documents-received/documents-received-body"
import { DocumentsReceivedHeader } from "../../../../_components/documents-received/documents-received-header"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  fetchDocuments,
  getOrgAccountingContext,
} from "../../../_lib/accounting-data"

export const metadata = { title: "Faktury přijaté" }

/**
 * Faktury přijaté (received invoices) — the captured received-invoice
 * documents of the latest period. Table archetype; fills the wired
 * `documents › Invoices › Received` nav slot. Server-fetched via
 * `fetchDocuments` (summary_record totals under FORCE RLS).
 */
export default async function ReceivedInvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const documents = ctx ? await fetchDocuments(ctx) : []
  const rows = documents.filter((row) => row.type === "RECEIVED_INVOICE")

  return (
    <>
      <AppPageHeader>
        <DocumentsReceivedHeader />
      </AppPageHeader>
      <DocumentsReceivedBody rows={rows} />
    </>
  )
}
