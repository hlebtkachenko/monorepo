/**
 * Opaque-token format primitives (ADR-0022).
 *
 * Pure functions over the wire format. No DB, no env, no I/O. The DB
 * mint/consume path lives in `./auth-token.ts`; cookie helpers live in
 * `./cookies.ts`.
 *
 * Wire format:
 *
 *   afkey-<B>-<C>
 *     B = 32 random bytes → base62 (43 chars), rejection-sampled to avoid
 *         alphabet bias on the 256/62 modulo.
 *     C = sha256("afkey" + B + kind + env).hex.slice(0, 8)
 *
 * Total length: 58 chars. Public secret-scanner regex matches AFKEY_REGEX.
 *
 * Why P1 (unkeyed checksum): see ADR-0022 §"Why the checksum is unkeyed".
 * No APP_TOKEN_SECRET, no rotation infrastructure. The actual auth is the
 * DB row lookup.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import type { AuthTokenEnv, AuthTokenKind } from "@workspace/db/schema"

/** ASCII-ordered base62 alphabet: digits, then lowercase, then uppercase. */
const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * Rejection-sampling threshold. floor(256 / 62) * 62 = 248. Bytes in
 * [248, 256) would skew the alphabet distribution (bytes 248..255 map to
 * indices 0..7 under `byte % 62`, giving those 8 characters a ~3.2% higher
 * weight). Reject them and re-roll.
 */
const REJECT_THRESHOLD = 248

/** B length in characters. 43 base62 chars carries ~256 bits of entropy. */
export const TOKEN_BODY_LENGTH = 43

/** C length in hex characters. 8 hex = 32 bits. */
export const TOKEN_CHECKSUM_LENGTH = 8

/** Prefix that marks our brand for secret-scanner integrations. */
export const TOKEN_PREFIX = "afkey"

/**
 * Public regex. Used by the no-leaked-afkey ESLint rule, the gitleaks
 * config, and the GitHub Push Protection custom pattern. Anchored — callers
 * scanning free-form text should strip the anchors with `.source` if needed.
 */
export const AFKEY_REGEX: RegExp = /^afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}$/

/**
 * Generate the random body component (B). Rejection-samples random bytes
 * to avoid the modulo bias against 0..7 that `byte % 62` would otherwise
 * introduce. The over-sampling factor (× 2) caps the expected loop count
 * at ~1 iteration for n=43.
 */
export function generateTokenBody(): string {
  let out = ""
  while (out.length < TOKEN_BODY_LENGTH) {
    const need = TOKEN_BODY_LENGTH - out.length
    const buf = randomBytes(need * 2)
    for (let i = 0; i < buf.length && out.length < TOKEN_BODY_LENGTH; i++) {
      const b = buf[i] ?? 0
      if (b < REJECT_THRESHOLD) {
        out += BASE62_ALPHABET[b % 62]
      }
    }
  }
  return out
}

/**
 * Compute the 8-hex-char checksum bound to (B, kind, env). Unkeyed —
 * derives from public inputs only. See ADR-0022 for why this is acceptable.
 */
export function computeChecksum(
  body: string,
  kind: AuthTokenKind,
  env: AuthTokenEnv,
): string {
  return createHash("sha256")
    .update(TOKEN_PREFIX)
    .update(body)
    .update(kind)
    .update(env)
    .digest("hex")
    .slice(0, TOKEN_CHECKSUM_LENGTH)
}

/** Assemble the full wire token from its three parts. */
export function formatToken(
  body: string,
  checksum: string,
): `afkey-${string}-${string}` {
  return `${TOKEN_PREFIX}-${body}-${checksum}`
}

/**
 * Parse the wire format. Returns `null` on any regex failure. Does NOT
 * validate the checksum — that step is `verifyChecksum`.
 */
export function parseToken(
  raw: string,
): { body: string; checksum: string } | null {
  if (typeof raw !== "string") return null
  if (!AFKEY_REGEX.test(raw)) return null
  const parts = raw.split("-")
  if (parts.length !== 3) return null
  const body = parts[1]
  const checksum = parts[2]
  if (!body || !checksum) return null
  if (body.length !== TOKEN_BODY_LENGTH) return null
  if (checksum.length !== TOKEN_CHECKSUM_LENGTH) return null
  return { body, checksum }
}

/**
 * Verify the format AND the checksum bound to (expected_kind, expected_env).
 *
 * Returns the body on success; `null` on any failure (regex, length,
 * checksum mismatch). The compare uses `crypto.timingSafeEqual` so a
 * partial-match attacker cannot iterate the 32-bit checksum space by
 * latency.
 *
 * The verifier's caller MUST treat `null` as the single generic INVALID
 * (ADR-0022 §"Mandatory companions" #5). No distinguishing the failure
 * mode externally.
 */
export function verifyChecksum(
  raw: string,
  expectedKind: AuthTokenKind,
  expectedEnv: AuthTokenEnv,
): { body: string } | null {
  const parsed = parseToken(raw)
  if (!parsed) return null
  const expected = computeChecksum(parsed.body, expectedKind, expectedEnv)
  const a = Buffer.from(parsed.checksum, "hex")
  const b = Buffer.from(expected, "hex")
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  return { body: parsed.body }
}

/** sha256 hex of the full raw token. This is what lands in auth_token.token_hash. */
export function hashRawToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
