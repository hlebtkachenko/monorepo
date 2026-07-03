import { HeldWritesBody } from "../../../_components/held-writes/held-writes-body"
import { HeldWritesHeader } from "../../../_components/held-writes/held-writes-header"
import { AppPageHeader } from "../../../_components/app-page-header"
import type { HeldWriteListRow } from "../../../_components/held-writes/columns"
import {
  fetchHeldWrites,
  getOrgAccountingContext,
  type HeldWriteRow,
} from "../../_lib/accounting-data"

export const metadata = { title: "Ke schválení" }

/** "YYYY-MM-DD HH:MM:SS+TZ" (Postgres text) → "YYYY-MM-DD HH:MM". */
function trimTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value)
  return match ? `${match[1]} ${match[2]}` : value
}

/** Human one-liner from the gated payload — description when present. */
function summarize(row: HeldWriteRow): string {
  const input = row.input_json as Record<string, unknown> | null
  if (input && typeof input["description"] === "string") {
    return input["description"]
  }
  if (input && typeof input["type"] === "string") {
    return String(input["type"])
  }
  if (input && typeof input["kind"] === "string") {
    return `posting (${String(input["kind"])})`
  }
  return row.tool_name
}

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
    created_at: trimTimestamp(row.created_at),
    summary: summarize(row),
    payload_json: JSON.stringify(row.input_json, null, 2),
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
