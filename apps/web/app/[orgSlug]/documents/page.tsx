import { DocumentsAllBody } from "../../_components/documents-all/documents-all-body"
import { DocumentsAllHeader } from "../../_components/documents-all/documents-all-header"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  fetchDocuments,
  getOrgAccountingContext,
} from "@/lib/org/accounting-data"

export const metadata = { title: "Records" }

/**
 * Records overview — ALL captured documents of the latest period, every type.
 * Table archetype; fills the wired `documents › Overview` nav slot.
 * Server-fetched via `fetchDocuments` (summary_record totals under FORCE RLS).
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const rows = ctx ? await fetchDocuments(ctx) : []

  return (
    <>
      <AppPageHeader>
        <DocumentsAllHeader />
      </AppPageHeader>
      <DocumentsAllBody rows={rows} />
    </>
  )
}
