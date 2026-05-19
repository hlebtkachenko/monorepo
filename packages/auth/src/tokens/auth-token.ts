/**
 * mintToken / consumeToken — unified opaque-token API (ADR-0022).
 *
 * The DB layer of the auth_token system. Pure format primitives live in
 * `./format.ts`; cookie helpers live in `./cookies.ts`.
 *
 * Concurrency: consume uses an atomic `UPDATE ... WHERE status='pending'
 * AND expires_at > now() RETURNING`. Under PostgreSQL READ COMMITTED, the
 * row-level write lock plus the `status='pending'` predicate serialize
 * concurrent redemption attempts — only one transaction observes the row
 * as pending and applies the update. Every other concurrent caller sees
 * affected_rows=0 and returns INVALID. This is the canonical implementation
 * of ADR-0022 §"Mandatory companions" #6.
 *
 * Failure mode: every redemption-failure branch returns the same generic
 * `INVALID` sentinel. No expired-vs-revoked-vs-wrong-kind enumeration is
 * exposed to the caller. ADR-0022 §"Mandatory companions" #5.
 */

import { createHash } from "node:crypto"

import { withAdminBypass, auth_token } from "@workspace/db"
import type { AuthTokenEnv, AuthTokenKind } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"

import {
  computeChecksum,
  formatToken,
  generateTokenBody,
  hashRawToken,
  verifyChecksum,
} from "./format"

/**
 * Per-kind default TTLs, in seconds. Caller may override per call.
 * Mirrors ADR-0022 §"Kind taxonomy".
 */
export const DEFAULT_TTL_SECONDS: Record<AuthTokenKind, number> = {
  sig: 60 * 60 * 48, // 48 h
  inv: 60 * 60 * 72, // 72 h
  lem: 60 * 10, // 10 min
  ons: 60 * 60 * 24, // 24 h (sliding renewal on every write; hard cap enforced at write site)
  wks: 60 * 60 * 24 * 90, // 90 d (parity with the JWT predecessor; revisit in D5)
}

/**
 * Resolve the deploy env code. Read once per call so tests can rotate
 * `AUTH_TOKEN_ENV` between cases without `vi.resetModules()`.
 *
 * Fallback chain:
 *   1. `AUTH_TOKEN_ENV`        — explicit, set by CDK per stack
 *   2. derived from `NODE_ENV` — production → prd, otherwise dev
 *
 * The string must be one of the three codes the CHECK constraint accepts.
 */
export function resolveAuthTokenEnv(): AuthTokenEnv {
  const explicit = process.env.AUTH_TOKEN_ENV?.trim()
  if (explicit === "dev" || explicit === "stg" || explicit === "prd") {
    return explicit
  }
  if (process.env.NODE_ENV === "production") return "prd"
  return "dev"
}

/** Forensic metadata attached to mint and consume rows. All fields optional. */
export interface ForensicContext {
  /** Raw client IP, IPv4 or IPv6. Truncated to /24 or /48 before storage. */
  ip?: string | null
  /** Raw User-Agent header. Hashed (sha256) before storage. */
  userAgent?: string | null
}

export interface MintOptions {
  kind: AuthTokenKind
  payload?: Record<string, unknown>
  /** Override `DEFAULT_TTL_SECONDS[kind]` for one-off cases. */
  ttlSeconds?: number
  /** Bind the token to a user at issue time (e.g. `aws` after BA login). */
  issuedToUserId?: string | null
  ctx?: ForensicContext
}

export interface MintedToken {
  /** The raw afkey-... string. Only place this exists outside the recipient's email/cookie. */
  rawToken: string
  /** The DB row id (uuidv7). */
  id: string
  expiresAt: Date
}

/**
 * Issue a new token. Generates the raw string, stores the hash, returns
 * the raw string and the row id. Caller is responsible for delivering the
 * raw string to the recipient (email body, cookie, response) and NEVER
 * persisting it.
 */
export async function mintToken(options: MintOptions): Promise<MintedToken> {
  const env = resolveAuthTokenEnv()
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS[options.kind]
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(
      `mintToken: ttlSeconds must be a positive number (kind=${options.kind})`,
    )
  }

  const body = generateTokenBody()
  const checksum = computeChecksum(body, options.kind, env)
  const rawToken = formatToken(body, checksum)
  const tokenHash = hashRawToken(rawToken)
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

  const issuedToIp = truncateIp(options.ctx?.ip ?? null)
  const issuedUserAgentHash = hashUserAgent(options.ctx?.userAgent ?? null)

  const inserted = await withAdminBypass(async (db) => {
    return await db
      .insert(auth_token)
      .values({
        token_hash: tokenHash,
        kind: options.kind,
        env,
        payload: options.payload ?? {},
        expires_at: expiresAt,
        issued_to_user_id: options.issuedToUserId ?? null,
        issued_to_ip: issuedToIp,
        issued_user_agent_hash: issuedUserAgentHash,
      })
      .returning({ id: auth_token.id, expires_at: auth_token.expires_at })
  })

  const row = inserted[0]
  if (!row) {
    throw new Error("mintToken: insert returned no row")
  }

  return {
    rawToken,
    id: row.id,
    expiresAt: row.expires_at,
  }
}

export interface ConsumeOptions {
  rawToken: string
  expectedKind: AuthTokenKind
  ctx?: ForensicContext
}

/**
 * Redeemed-token payload + audit metadata returned on a successful consume.
 *
 * The shape is intentionally generic — every kind stores its own keys in
 * `payload`. Callers Zod-parse `payload` against their kind's schema before
 * touching it.
 */
export interface ConsumedToken<TPayload = Record<string, unknown>> {
  id: string
  kind: AuthTokenKind
  env: AuthTokenEnv
  payload: TPayload
  issuedToUserId: string | null
  expiresAt: Date
  issuedAt: Date
}

/**
 * Redeem a token. Returns the row payload on success, `null` on any
 * failure mode (malformed, expired, revoked, wrong kind, not found, DB
 * tamper detected). The single generic INVALID is non-negotiable; do not
 * branch on the failure mode externally.
 *
 * The UPDATE is atomic: only the first concurrent caller flips
 * status='pending' → 'consumed' and observes affected_rows=1. Every other
 * caller sees affected_rows=0 and returns null.
 */
export async function consumeToken<TPayload = Record<string, unknown>>(
  options: ConsumeOptions,
): Promise<ConsumedToken<TPayload> | null> {
  const env = resolveAuthTokenEnv()

  // Step 1 — format + checksum. Reject malformed before any DB I/O.
  const verified = verifyChecksum(options.rawToken, options.expectedKind, env)
  if (!verified) return null

  const tokenHash = hashRawToken(options.rawToken)
  const consumedFromIp = truncateIp(options.ctx?.ip ?? null)
  const consumedUserAgentHash = hashUserAgent(options.ctx?.userAgent ?? null)

  // Step 2 — atomic UPDATE-WHERE-RETURNING. The WHERE predicates are the
  // sole concurrency control: only one caller observes status='pending'
  // AND expires_at > now() and applies the row write.
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_token)
      .set({
        status: "consumed",
        consumed_at: sql`now()`,
        consumed_from_ip: consumedFromIp,
        consumed_user_agent_hash: consumedUserAgentHash,
      })
      .where(
        sql`${auth_token.token_hash} = ${tokenHash}
            AND ${auth_token.status} = 'pending'
            AND ${auth_token.expires_at} > now()`,
      )
      .returning({
        id: auth_token.id,
        kind: auth_token.kind,
        env: auth_token.env,
        payload: auth_token.payload,
        issued_to_user_id: auth_token.issued_to_user_id,
        expires_at: auth_token.expires_at,
        issued_at: auth_token.issued_at,
      })
  })

  const row = rows[0]
  if (!row) return null

  // Step 3 — defense in depth. If a DB-write path mis-labelled a row's
  // `kind`, the redeemer refuses. This branch is unreachable under correct
  // mint behavior and exists only to fail-closed on a tampered row.
  if (row.kind !== options.expectedKind) return null

  return {
    id: row.id,
    kind: row.kind,
    env: row.env,
    payload: row.payload as TPayload,
    issuedToUserId: row.issued_to_user_id,
    expiresAt: row.expires_at,
    issuedAt: row.issued_at,
  }
}

/**
 * Revoke a token (no-op if already non-pending). Used by admin tools and
 * by the "re-issue invite" flow which must invalidate the previous token.
 * Returns true if a row was flipped, false otherwise.
 */
export async function revokeToken(rawToken: string): Promise<boolean> {
  const tokenHash = hashRawToken(rawToken)
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_token)
      .set({ status: "revoked" })
      .where(
        sql`${auth_token.token_hash} = ${tokenHash}
            AND ${auth_token.status} = 'pending'`,
      )
      .returning({ id: auth_token.id })
  })
  return rows.length > 0
}

/**
 * Revoke by id. Same semantics as `revokeToken` but addressed by the row
 * id, so callers that already have the row (e.g. admin "revoke invite" UI)
 * don't need the raw token.
 */
export async function revokeTokenById(id: string): Promise<boolean> {
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_token)
      .set({ status: "revoked" })
      .where(
        sql`${auth_token.id} = ${id}::uuid AND ${auth_token.status} = 'pending'`,
      )
      .returning({ id: auth_token.id })
  })
  return rows.length > 0
}

/**
 * Mark every pending row whose `expires_at` is in the past as 'expired'.
 * Idempotent; safe to schedule daily. Returns the count flipped.
 */
export async function expireDueAuthTokens(): Promise<number> {
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_token)
      .set({ status: "expired" })
      .where(
        sql`${auth_token.status} = 'pending' AND ${auth_token.expires_at} <= now()`,
      )
      .returning({ id: auth_token.id })
  })
  return rows.length
}

/**
 * Permanently delete rows whose status is terminal (consumed/revoked/expired)
 * and that are older than the given cutoff. Used by the daily prune worker.
 * The DELETE-trigger guard refuses to delete pending rows.
 */
export async function pruneTerminalAuthTokens(opts: {
  olderThan: Date
}): Promise<number> {
  const cutoff = opts.olderThan.toISOString()
  const rows = await withAdminBypass(async (db) => {
    return await db
      .delete(auth_token)
      .where(
        sql`${auth_token.status} IN ('consumed','revoked','expired')
            AND ${auth_token.issued_at} < ${cutoff}::timestamptz`,
      )
      .returning({ id: auth_token.id })
  })
  return rows.length
}

// ---------------------------------------------------------------------------
// Forensic helpers — exported for tests; not part of the public API surface.
// ---------------------------------------------------------------------------

/**
 * Truncate an IP for forensic storage. /24 for IPv4, /48 for IPv6. The
 * 2025 CJEU ruling on IP-as-personal-data classifies the truncated form as
 * pseudonymized PII, not anonymized — see ADR-0022 §Storage.
 */
export function truncateIp(ip: string | null): string | null {
  if (!ip) return null
  const trimmed = ip.trim()
  if (!trimmed) return null

  if (trimmed.includes(":")) {
    // IPv6 — /48 is the first three 16-bit groups. Collapse any zero-runs
    // first so we operate on a canonical form.
    const groups = expandIpv6(trimmed)
    if (!groups) return null
    return `${groups.slice(0, 3).join(":")}::/48`
  }

  // IPv4 — /24 is the first three octets.
  const octets = trimmed.split(".")
  if (octets.length !== 4) return null
  for (const o of octets) {
    if (!/^[0-9]{1,3}$/.test(o)) return null
    const n = Number(o)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
  }
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
}

function expandIpv6(addr: string): string[] | null {
  // Reject scope ids ("fe80::1%eth0") — strip them before grouping.
  const noScope = addr.split("%")[0] ?? addr
  const halves = noScope.split("::")
  if (halves.length > 2) return null

  const split = (s: string) => (s === "" ? [] : s.split(":"))
  const left = split(halves[0] ?? "")
  const right = halves.length === 2 ? split(halves[1] ?? "") : []
  const fill = 8 - (left.length + right.length)
  if (halves.length === 2) {
    if (fill < 0) return null
  } else if (left.length !== 8) {
    return null
  }
  const middle = halves.length === 2 ? Array<string>(fill).fill("0") : []
  const groups = [...left, ...middle, ...right]
  if (groups.length !== 8) return null
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
  }
  return groups
}

/** sha256 hex of the User-Agent string. Raw UA never lands on disk. */
export function hashUserAgent(ua: string | null): string | null {
  if (!ua) return null
  const trimmed = ua.trim()
  if (!trimmed) return null
  return createHash("sha256").update(trimmed).digest("hex")
}

/**
 * Atomic sliding renewal for kinds whose lifecycle calls for it (currently
 * only `ons` — onboarding-state). Extends a row's `expires_at` by
 * `extendBySeconds`, capped at `issued_at + maxLifetimeSeconds`. The
 * computation lives in SQL so there is no TOCTOU window between the cap
 * check and the write.
 *
 * Trigger interaction: migration 0019 relaxes the append-only trigger to
 * permit `expires_at` changes on pending rows when the new value is in
 * the future and not beyond `issued_at + 7 days`. This helper applies
 * its own `LEAST` cap (the `maxLifetimeSeconds` parameter), and the
 * trigger enforces the hard ceiling as defense-in-depth. The trigger
 * rejects any other column change.
 *
 * Returns the new `expires_at` if the row was found + still pending, null
 * otherwise (including when the cap already pinned it to its hard ceiling
 * — in that case the row's `expires_at` did not move and the function
 * returns the pinned value so the caller can re-set the cookie with the
 * correct maxAge).
 */
export async function extendAuthTokenExpiry(opts: {
  rawToken: string
  expectedKind: AuthTokenKind
  extendBySeconds: number
  maxLifetimeSeconds: number
}): Promise<Date | null> {
  const env = resolveAuthTokenEnv()

  // Reject malformed tokens before any DB I/O.
  if (!verifyChecksum(opts.rawToken, opts.expectedKind, env)) return null

  const tokenHash = hashRawToken(opts.rawToken)
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_token)
      .set({
        expires_at: sql`LEAST(
            now() + (${opts.extendBySeconds}::int * interval '1 second'),
            ${auth_token.issued_at} + (${opts.maxLifetimeSeconds}::int * interval '1 second')
          )`,
      })
      .where(
        sql`${auth_token.token_hash} = ${tokenHash}
              AND ${auth_token.status} = 'pending'
              AND ${auth_token.expires_at} > now()
              AND ${auth_token.kind} = ${opts.expectedKind}`,
      )
      .returning({ expires_at: auth_token.expires_at })
  })
  const row = rows[0]
  if (!row) return null
  return row.expires_at
}

/** Mark a row by id as consumed without going through the raw-token path.
 *  Used only by admin tooling and tests; the regular consume flow MUST go
 *  through `consumeToken` to enforce the format + checksum gate. */
export async function _consumeByIdForAdminToolingOnly(
  id: string,
): Promise<boolean> {
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_token)
      .set({ status: "consumed", consumed_at: sql`now()` })
      .where(eq(auth_token.id, id))
      .returning({ id: auth_token.id })
  })
  return rows.length > 0
}
