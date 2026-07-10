// A "decision" is the librarian's opaque, comparable representation of a booking treatment (what
// the Brain proposed, or what the human corrected it to). The librarian does not interpret
// accounting semantics — it treats a decision as structured JSON and compares decisions for exact
// equality. This mirrors how the data is actually stored (`tool_call_log.input_json`/`output_json`
// are `jsonb`, and `BrainRunItem.stagedPayload` is already typed `JsonValue` in `types.ts`) — the
// librarian adds no new semantic model on top, on purpose (semantic soundness of a candidate is
// judged by the eval gate + human review of the emitted artifact, never by this module).

/** Deterministic recursive key-sort so two structurally-equal decisions always serialize
 * identically regardless of property insertion order. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/** Collision-safe exact-match key for a decision (same JSON-tuple approach as `signatureKey` /
 * `eval/metric.ts`'s `bookingKey`). Two decisions are "the same" iff this key is equal. */
export function decisionKey(decision: Record<string, unknown>): string {
  return JSON.stringify(sortKeysDeep(decision))
}

/**
 * Per-document fields stripped before a decision is voted on. A booking RULE is a treatment shape
 * (account / side / scenario / vatMode / vatJurisdiction / vatRate), NOT a payload clone: two
 * invoices from the same supplier for the same kind of supply are the SAME rule even though their
 * amounts, dates, and document identifiers differ per document. Voting on the FULL payload would
 * mean clusters almost never converge (every invoice amount differs) and any candidate that did
 * emerge would embed one invoice's fixed amount — domain-wrong. So these keys are removed, wherever
 * they appear in the structure (top-level AND inside `postingLines` / `vatAmounts` entries), before
 * the vote. NOTE the deliberate exclusions: `accountId` / `account` / `side` / `scenario` /
 * `vatMode` / `vatJurisdiction` / `vatRate` / `rateLabel` are the TREATMENT and are NEVER stripped
 * (a rate LABEL like "21%" is the rate treatment; the `base` / `vat` money on it is per-document).
 */
export const PER_DOCUMENT_FIELDS: ReadonlySet<string> = new Set([
  // monetary amounts — differ per invoice, never part of a generalizable treatment
  "amount",
  "base",
  "vat",
  "total",
  "totalAmount",
  "netAmount",
  "grossAmount",
  // dates / periods — per-document
  "date",
  "dueDate",
  "issueDate",
  "taxPointDate",
  "deliveryDate",
  "periodEnd",
  "periodStart",
  // document-specific identifiers — per-document, never a generalizable rule fact
  "documentId",
  "documentNumber",
  "eventId",
  "invoiceNumber",
  "variableSymbol",
  "idempotencyKey",
  "conversationId",
])

function stripPerDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPerDocument)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (PER_DOCUMENT_FIELDS.has(key)) continue
      out[key] = stripPerDocument(child)
    }
    return out
  }
  return value
}

/**
 * Normalize a decision to its treatment-relevant fields — the generalizable booking rule — by
 * dropping every `PER_DOCUMENT_FIELDS` key recursively. Idempotent (normalizing an already-
 * normalized decision is a no-op). This is what the librarian votes and gates on; the emitted
 * candidate's `proposedDecision` is the NORMALIZED form, so a distilled rule never carries a fixed
 * invoice amount/date.
 */
export function normalizeDecisionForVote(
  decision: Record<string, unknown>,
): Record<string, unknown> {
  return stripPerDocument(decision) as Record<string, unknown>
}
