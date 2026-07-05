import { HeldWritesBody } from "../../../_components/held-writes/held-writes-body"
import { HeldWritesHeader } from "../../../_components/held-writes/held-writes-header"
import { AppPageHeader } from "../../../_components/app-page-header"
import type { HeldWriteListRow } from "../../../_components/held-writes/columns"
import {
  fetchHeldWrites,
  getOrgAccountingContext,
  summarizeGatedPayload,
  trimGatedTimestamp,
} from "../../_lib/accounting-data"

export const metadata = { title: "Ke schválení" }

/**
 * Held-writes review queue ("Ke schválení") — gated accounting writes the
 * confidence gate held (202) awaiting human review. Fills the accounting
 * module's Posting-approvals nav slot. The inspector exposes the full
 * original payload and resolves the write via the `resolveHeldWrite` action.
 */
export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  const held = ctx ? await fetchHeldWrites(ctx) : []

  const rows: HeldWriteListRow[] = held.map((row) => ({
    id: row.id,
    tool_name: row.tool_name,
    idempotency_key: row.idempotency_key,
    actor_kind: row.actor_kind,
    confidence: row.confidence,
    rationale: row.rationale,
    created_at: trimGatedTimestamp(row.created_at),
    summary: summarizeGatedPayload(row),
    payload_json: JSON.stringify(row.input_json, null, 2),
    template_id: row.template_id,
    template_confirmed: row.template_confirmed,
  }))

  return (
    <>
      <AppPageHeader>
        <HeldWritesHeader />
      </AppPageHeader>
      <HeldWritesBody rows={rows} orgSlug={orgSlug} />
    </>
  )
}
