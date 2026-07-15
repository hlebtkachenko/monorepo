import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { DocumentsTable } from "../../../_components/documents-received/documents-table"
import {
  fetchDocuments,
  getOrgAccountingContext,
} from "../../_lib/accounting-data"

export const metadata = { title: "Interní doklady" }

/**
 * Interní doklady (internal documents) — the captured INTERNAL-type documents
 * of the latest period. Table archetype; fills the wired
 * `documents › Internal documents` nav slot. Server-fetched via `fetchDocuments`
 * (summary_record totals under FORCE RLS), then filtered to `type === "INTERNAL"`.
 */
export default async function InternalDocumentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const documents = ctx ? await fetchDocuments(ctx) : []
  const rows = documents.filter((row) => row.type === "INTERNAL")

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Interní doklady" />
      </AppPageHeader>
      <DocumentsTable
        rows={rows}
        counterpartyHeader="Protistrana"
        searchPlaceholder="Search interní doklady…"
      />
    </>
  )
}
