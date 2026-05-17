import { createHash, randomBytes } from "node:crypto"

/**
 * API-key primitives — opaque random token + SHA-256 hex hash.
 *
 * Same opaque-token + DB-hash design as the invite token (see `./invite.ts`):
 *
 *   issue   → generateRawApiKey() → store sha256(raw) in api_key.key_hash +
 *             the raw key's non-secret prefix in api_key.prefix. The raw key
 *             is shown to the caller exactly once and never persisted.
 *   verify  → hash the presented key, look up api_key by key_hash, reject if
 *             revoked_at IS NOT NULL or expires_at < now(). See
 *             `verifyApiKey` in `@workspace/auth/api-key-verifier`.
 *
 * Format: `affk_live_<43 base64url chars>` — the `affk_live_` prefix makes
 * keys greppable in logs/secret-scanners and `live` leaves room for a future
 * `test` environment segment.
 */

/** Token entropy in bytes. 32 = 256 bits, base64url-encoded → 43 chars. */
export const API_KEY_TOKEN_BYTES = 32

/** Non-secret, human-recognisable prefix on every raw key. */
export const API_KEY_PREFIX = "affk_live_"

/** Characters of the raw key kept in `api_key.prefix` for display/audit. */
const API_KEY_DISPLAY_CHARS = 4

export interface GeneratedApiKey {
  /** The full secret. Returned once, never stored. */
  raw: string
  /** sha256 hex of `raw` — stored in api_key.key_hash. */
  keyHash: string
  /** Non-secret display fragment — stored in api_key.prefix. */
  prefix: string
}

export function generateRawApiKey(): GeneratedApiKey {
  const secret = randomBytes(API_KEY_TOKEN_BYTES).toString("base64url")
  const raw = `${API_KEY_PREFIX}${secret}`
  return {
    raw,
    keyHash: hashApiKey(raw),
    prefix: `${API_KEY_PREFIX}${secret.slice(0, API_KEY_DISPLAY_CHARS)}`,
  }
}

/**
 * SHA-256 is the correct hash here, NOT bcrypt/argon2: an API key is a
 * 256-bit random token (`randomBytes(32)`), not a low-entropy human
 * password — it is not brute-forceable, so a slow KDF buys nothing and a
 * deterministic hash is required for the by-`key_hash` lookup. Same scheme
 * GitHub/Stripe use for API tokens.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex")
}
