/**
 * The `Idempotency-Key` this agent sends, and why it is derived per CALL.
 *
 * THE SERVER'S RULE FIRST, because the design follows from it. Beta's unique
 * index is on `(agent_key_id, request_id)` and spans EVERY endpoint and EVERY
 * book. A key spent on `filings` and then re-sent to `assets` is refused with
 * `idempotency_key_reused` — deliberately, because replaying the filings summary
 * for an assets call would report a 200 for a write that never happened. So the
 * one shape that must never be built is a single id per RUN, which is exactly
 * the shape a month-end script reaches for first.
 *
 * WHAT IS HASHED: the endpoint path, the organization slug, the period, and the
 * CANONICAL FORM OF THE BODY. Consequences, all of them wanted:
 *
 *   - a retry of the same call after a timeout or a 5xx sends the same key, so
 *     the server replays its first answer instead of publishing a second,
 *     superseding batch;
 *   - two datasets in one run get different keys, so neither is refused;
 *   - the same dataset for two organizations gets different keys;
 *   - a CORRECTED file gets a different key, because the content changed — which
 *     is the case where a new act genuinely is intended.
 *
 * The one case this makes awkward is a deliberate re-publish of a byte-identical
 * file (to move a batch to the head of the history). That is answered by
 * `--idempotency-key`, which the operator sets by hand; it is not the default,
 * because a default that re-applies is not idempotency.
 *
 * A UUID PER CALL WOULD ALSO SATISFY THE SERVER, and is rejected here: it makes
 * a retry a second real act, which for a batch publish means one more superseded
 * batch per network hiccup. Determinism is the whole value.
 */
import { createHash } from "node:crypto"

/** Matches the server's `REQUEST_ID` character class (`lib/agent/auth.ts`). */
const SAFE = /^[A-Za-z0-9._:-]{1,200}$/

export function isValidIdempotencyKey(value: string): boolean {
  return SAFE.test(value)
}

/**
 * A stable key for one call.
 *
 * `JSON.stringify` with SORTED keys, not the raw body string: the payload is
 * built by this program, so its key order is already deterministic, but sorting
 * makes that a property of the function rather than of the builder — a future
 * transformer that emits fields in a different order must not change the key of
 * an unchanged file.
 */
export function idempotencyKey(input: {
  path: string
  orgSlug: string
  period: string | null
  payload: unknown
}): string {
  const canonical = JSON.stringify({
    path: input.path,
    org: input.orgSlug,
    period: input.period,
    body: sortDeep(input.payload),
  })
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex")
  // The prefix is triage, not namespacing: an operator reading an activity_log
  // row can tell a key this agent minted from one somebody typed. `v1` moves if
  // the derivation ever changes, so old and new keys cannot collide.
  return `beta-agent.v1.${digest.slice(0, 40)}`
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value === null || typeof value !== "object") return value
  const entries = Object.entries(value as Record<string, unknown>)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(entries.map(([key, nested]) => [key, sortDeep(nested)]))
}
