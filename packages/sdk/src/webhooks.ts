/**
 * Standard Webhooks signature verifier.
 *
 * Verifies a payload against the `webhook-id`, `webhook-timestamp`, and
 * `webhook-signature` headers emitted by the Afframe webhook delivery
 * pipeline. Mirrors the [Standard Webhooks](https://standardwebhooks.com)
 * v1 spec — partners get a stable, audit-able verification primitive
 * portable across SDKs.
 *
 * Algorithm:
 *
 *   1. Strip the `whsec_` prefix from the secret and base64-decode the
 *      remainder to recover the raw HMAC key bytes (Standard Webhooks
 *      stores secrets as `whsec_<base64-of-raw-key>`).
 *   2. Concatenate `webhook-id`, ".", `webhook-timestamp`, ".", body.
 *   3. HMAC-SHA-256 the concatenation with the raw key.
 *   4. Base64-encode the digest, prefix with `v1,`.
 *   5. Compare every `v1,...` entry in `webhook-signature` (space-
 *      separated) against the expected signature using constant-time
 *      comparison.
 *   6. Reject any payload whose timestamp drifts more than `toleranceSec`
 *      from now (default 5 minutes) — defends against replay.
 *
 * Implementation uses the Web Crypto API so it runs identically on Node,
 * Bun, Deno, and edge runtimes.
 */

export interface VerifyWebhookInput {
  /** Raw request body as text. Verify before JSON.parse — the signed
   *  representation is bytes, not the structured object. */
  payload: string
  headers: {
    "webhook-id": string
    "webhook-timestamp": string
    "webhook-signature": string
  }
  /** Webhook secret. The partner stored this when they created the
   *  endpoint; rotate via the Afframe dashboard. */
  secret: string
  /** Replay window in seconds. Default 300 (5 minutes). */
  toleranceSec?: number
  /** Override `Date.now()` for tests. */
  now?: () => number
}

export class WebhookVerificationError extends Error {
  readonly code:
    | "invalid_timestamp"
    | "stale_timestamp"
    | "invalid_signature"
    | "missing_header"
    | "invalid_secret"

  constructor(code: WebhookVerificationError["code"], message: string) {
    super(message)
    this.code = code
    this.name = "WebhookVerificationError"
  }
}

const DEFAULT_TOLERANCE_SEC = 300
const SIG_VERSION_PREFIX = "v1,"
const SECRET_PREFIX = "whsec_"

export async function verifyWebhook(input: VerifyWebhookInput): Promise<void> {
  const id = input.headers["webhook-id"]
  const timestamp = input.headers["webhook-timestamp"]
  const sigHeader = input.headers["webhook-signature"]
  if (!id || !timestamp || !sigHeader) {
    throw new WebhookVerificationError(
      "missing_header",
      "Missing webhook-id, webhook-timestamp, or webhook-signature header.",
    )
  }
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) {
    throw new WebhookVerificationError(
      "invalid_timestamp",
      `webhook-timestamp is not numeric: ${timestamp}`,
    )
  }
  const nowSec = Math.floor((input.now ? input.now() : Date.now()) / 1000)
  const tolerance = input.toleranceSec ?? DEFAULT_TOLERANCE_SEC
  if (Math.abs(nowSec - ts) > tolerance) {
    throw new WebhookVerificationError(
      "stale_timestamp",
      `webhook-timestamp drift > ${tolerance}s — possible replay.`,
    )
  }

  const expected = await sign(
    input.secret,
    `${id}.${timestamp}.${input.payload}`,
  )
  const candidates = sigHeader
    .split(" ")
    .filter((s) => s.startsWith(SIG_VERSION_PREFIX))
  for (const candidate of candidates) {
    const value = candidate.slice(SIG_VERSION_PREFIX.length)
    if (timingSafeEqual(value, expected)) return
  }
  throw new WebhookVerificationError(
    "invalid_signature",
    "No webhook-signature entry matched the expected HMAC.",
  )
}

async function sign(secret: string, message: string): Promise<string> {
  const keyBytes = decodeSecret(secret)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return base64(new Uint8Array(buf))
}

function decodeSecret(secret: string): Uint8Array<ArrayBuffer> {
  if (!secret.startsWith(SECRET_PREFIX)) {
    throw new WebhookVerificationError(
      "invalid_secret",
      `Webhook secret must start with "${SECRET_PREFIX}" (Standard Webhooks v1).`,
    )
  }
  const b64 = secret.slice(SECRET_PREFIX.length)
  try {
    const bin = atob(b64)
    // Backing buffer pinned to a fresh ArrayBuffer (not the default
    // ArrayBufferLike) so the typed array satisfies Web Crypto's
    // `BufferSource` constraint under TypeScript 6 strictness.
    const out = new Uint8Array(new ArrayBuffer(bin.length))
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    throw new WebhookVerificationError(
      "invalid_secret",
      "Webhook secret payload after the prefix is not valid base64.",
    )
  }
}

function base64(bytes: Uint8Array): string {
  // `btoa` is globally available on every runtime this SDK supports:
  // Node 16+, Bun, Deno, browsers, and every edge runtime. No fallback
  // needed — and a fallback would mask the real failure on the rare
  // runtime that genuinely lacks it.
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function timingSafeEqual(a: string, b: string): boolean {
  // HMAC-SHA-256 base64 is always 44 chars, so in practice `a` and `b`
  // are the same length. Pad to `max(a.length, b.length)` anyway so a
  // malformed header carrying a non-44-char `value` doesn't expose a
  // 1-bit length-match timing channel. `String.fromCharCode(0)` is a
  // safe filler — it never matches a real base64 digit's code unit.
  const len = Math.max(a.length, b.length)
  let result = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0
    const cb = i < b.length ? b.charCodeAt(i) : 0
    result |= ca ^ cb
  }
  return result === 0
}
