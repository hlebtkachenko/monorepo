import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import type {
  InboxListRow,
  InboxStatus,
} from "../../../_components/documents-inbox/columns"
import { DocumentsInboxBody } from "../../../_components/documents-inbox/documents-inbox-body"
import { DocumentsInboxHeader } from "../../../_components/documents-inbox/documents-inbox-header"
import {
  fetchIngestionInbox,
  getOrgAccountingContext,
  summarizeGatedPayload,
  trimGatedTimestamp,
  type IngestionInboxRow,
} from "@/lib/org/accounting-data"

export const metadata = { title: "Inbox" }

/** Ingestion outcome from the audit-row flags: auto-applied, held, or resolved. */
function deriveStatus(row: IngestionInboxRow): InboxStatus {
  if (row.auto_applied) return "applied"
  if (row.approved_by_user_id !== null) {
    return row.resolution === "rejected" ? "rejected" : "approved"
  }
  return "held"
}

/**
 * Ingestion inbox — a READ-ONLY overview of the org's gated writes as they land
 * in `tool_call_log` (the same source the approvals queue reads), across every
 * outcome: auto-applied, held for review, approved, or rejected. This is the
 * ingestion feed, not the review queue: resolution lives on the approvals page.
 *
 * The upload -> OCR/extraction -> batch pipeline is deferred to a separate
 * issue; this slice surfaces the writes the brain already produces.
 */
export default async function InboxPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const inbox = ctx ? await fetchIngestionInbox(ctx) : []

  const rows: InboxListRow[] = inbox.map((row) => ({
    id: row.id,
    tool_name: row.tool_name,
    actor_kind: row.actor_kind,
    confidence: row.confidence,
    rationale: row.rationale,
    created_at: trimGatedTimestamp(row.created_at),
    summary: summarizeGatedPayload(row),
    status: deriveStatus(row),
  }))

  return (
    <>
      <AppPageHeader>
        <DocumentsInboxHeader />
      </AppPageHeader>
      <DocumentsInboxBody rows={rows} />
    </>
  )
}
