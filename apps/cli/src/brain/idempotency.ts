// Content-addressed, clock-free idempotency-key core — shared by every deterministic Brain-CLI write key
// (the batch booker's `deriveIdempotencyKey`, the `brain event` command's `eventIdempotencyKey`). One
// canonicalization so the two derivations can never drift, and every key derivation is bigint-safe.

import { createHash } from "node:crypto"

/**
 * Stable JSON: object keys sorted recursively so the serialization is order-independent. The bigint replacer
 * renders any `bigint` (Money minor units are `bigint` in TypeScript) as a decimal string — so the key
 * derivation never THROWS ("Do not know how to serialize a BigInt") the moment a future field threads a
 * bigint into a request body. PURE.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  )
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * Deterministic content hash: the sha256 hex of the canonical JSON. Stable across retries and a
 * killed-then-resumed run, so the server dedups a re-POST of the SAME payload into a replay — never a
 * duplicate write. A hex digest (64 chars) is well within the `Idempotency-Key` 1–255 char limit. PURE.
 */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}
