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
