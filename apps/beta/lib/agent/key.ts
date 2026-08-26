/**
 * The office agent key: how one is minted, how it is stored, how it is read off
 * a request (spec §3.2 — "authenticated by an office agent key, hashed at
 * rest").
 *
 * Deliberately pure — `node:crypto` and strings, no database, no `server-only`
 * — so the shape of a credential is testable without a Postgres boot and so
 * `lib/data/scope.ts` can hash a presented value without importing the auth
 * layer.
 *
 * THE SECRET EXISTS ONCE. `generateAgentKey()` returns it to the /admin issue
 * action, which returns it to one render; `hashAgentKey()` is what the database
 * stores. Nothing reverses that, and nothing in this application ever writes a
 * raw key to a log, a redirect or a row. Same contract as
 * `lib/auth/setup-token.ts`, on purpose: a second, weaker one would be the
 * interesting thing to attack.
 */
import { createHash, randomBytes } from "node:crypto"

/**
 * A visible prefix on every key.
 *
 * It is not a namespace and buys no security. It buys TRIAGE: a secret scanner,
 * a grep of a CI log, or an operator looking at a pasted string can tell what
 * they are holding, and "this is a live beta agent credential" is a much faster
 * incident than "this 43-character token is something".
 */
export const AGENT_KEY_PREFIX = "afb_agent_"

/** 256 bits of CSPRNG, url-safe — the same budget as a setup link. */
export function generateAgentKey(): string {
  return `${AGENT_KEY_PREFIX}${randomBytes(32).toString("base64url")}`
}

/** What the database stores. The raw value exists only in the caller's hands. */
export function hashAgentKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex")
}

/**
 * The credential on a request, or `null`.
 *
 * `Authorization: Bearer <key>` and nothing else. No `?key=` query parameter and
 * no custom header: a secret in a URL lands in access logs, in `Referer`, and in
 * browser history, and offering two ways to authenticate means the weaker one is
 * the one that gets used.
 *
 * The scheme match is case-insensitive because RFC 7235 says it is; the value is
 * not trimmed beyond the single separating space, because a key with whitespace
 * around it is a caller bug worth surfacing as a 401 rather than papering over.
 *
 * IT DOES NOT VALIDATE THE PREFIX. A wrong-looking value takes the same path as
 * a right-looking one — one hash, one indexed lookup, one 401 — so the response
 * cannot be used to learn what a real key looks like.
 */
export function bearerKey(headers: Headers): string | null {
  const header = headers.get("authorization")
  if (!header) return null

  const separator = header.indexOf(" ")
  if (separator < 0) return null
  if (header.slice(0, separator).toLowerCase() !== "bearer") return null

  const value = header.slice(separator + 1)
  // A 4 KiB header full of hex is not a credential; it is a hashing budget
  // somebody is spending on our CPU.
  if (value.length === 0 || value.length > 200) return null
  return value
}
