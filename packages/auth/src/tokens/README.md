# `@workspace/auth/tokens` — unified opaque token system

> Developer reference. For the **decision and threat model**, see [ADR-0022](../../../../docs/adr/0022-unified-opaque-tokens.md). For the migration tracker, use the Roadmap project.

## Purpose

One mechanism for every in-flight token the platform issues — signup, invite, login-email, onboarding-state, active-workspace, and any future kinds (API keys, email verification, one-time download URLs, impersonation, …).

The mechanism is **opaque-token + DB-row + published checksum**. No JWTs. No app-level signing secret. The credential is the raw token string the recipient sees; the DB stores only its SHA-256 hash. The full design rationale lives in [ADR-0022](../../../../docs/adr/0022-unified-opaque-tokens.md).

## Token format

```
afkey-<B>-<C>
        ↑    ↑
        |    └── 8 hex chars — sha256("afkey" + B + kind + env)[:8]
        └─────── 43 chars base62 — 32 random bytes, rejection-sampled
```

Total length: 58 chars. Example shape (placeholder, not a real token):

```
afkey-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX-XXXXXXXX
```

The prefix `afkey` is the brand anchor — secret scanners (`gitleaks`, GitHub Push Protection, this repo's ESLint rule) match the full pattern `afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}`. Anything in the codebase matching that regex is a leaked token and blocks the commit.

## Kinds

| Code  | Use                                                                | Cookie             | Path          | TTL |
| ----- | ------------------------------------------------------------------ | ------------------ | ------------- | --- |
| `sig` | Owner signup, Better Auth account doesn't exist yet                | `__Host-afkey-sig` | `/`           | 48h |
| `inv` | Organization invite redemption                                     | `__Host-afkey-inv` | `/`           | 72h |
| `lem` | Login email carrier between step 1 and step 2                      | `afkey-lem`        | `/auth/login` | 10m |
| `ons` | Onboarding step state before BA user exists, sliding (hard cap 7d) | `__Host-afkey-ons` | `/`           | 24h |
| `wks` | Active workspace carrier across tabs                               | `__Host-afkey-wks` | `/`           | TBD |

Adding a new kind: extend `KIND_DESCRIPTORS` in `auth-token.ts`. One constant + one cookie name. No new tables.

## Writer — `mintToken`

```ts
import { mintToken } from "@workspace/auth/tokens"

const result = await mintToken(
  "sig",
  {
    email: "user@example.com",
    workspaceName: "Acme",
  } /* ttlSecondsOverride? */,
)

result.raw // the token string — return in email URL, set as cookie
result.expiresAt // Date
```

Behavior:

- Generates 32 random bytes with `crypto.randomBytes`, base62-encodes them with a rejection-sampling encoder.
- Computes the checksum.
- Inserts a row into `auth_token` with `status='pending'`, the supplied `payload`, kind-specific TTL, current env.
- Returns the raw token. **Caller must never log this value.** A pino redaction path is registered for `raw` keys.

Runs inside `withAdminBypass` because the issuing context typically has no bound tenancy GUC (signup precedes workspace creation, login-email precedes session).

## Reader — `consumeToken`

```ts
import { consumeToken } from "@workspace/auth/tokens"

const result = await consumeToken(rawToken, "sig", {
  ip: request.ip,
  userAgent: request.headers.get("user-agent"),
})

if (!result.ok) {
  // External response is ALWAYS generic INVALID. No distinguishing on
  // result.reason at the HTTP layer.
  return { ok: false }
}

result.payload // the original payload
result.issuedToUserId // nullable
```

Behavior:

1. **Format check.** Regex `^afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}$`. Mismatch → `INVALID`.
2. **Checksum check.** Recompute from `(B, expectedKind, currentEnv)`, compare via `crypto.timingSafeEqual`. Mismatch → `INVALID`.
3. **Atomic redemption.** `UPDATE auth_token SET status='consumed', consumed_at=now(), consumed_from_ip=?, consumed_user_agent_hash=? WHERE token_hash=? AND status='pending' AND expires_at > now() RETURNING payload, kind, env, issued_to_user_id`. Zero rows returned → `INVALID`.
4. **Kind cross-check.** `row.kind === expectedKind` else `INVALID` (DB tamper signal).
5. Returns `{ ok: true, payload, issuedToUserId }`.

The single atomic UPDATE serializes concurrent redemption attempts under READ COMMITTED isolation. PostgreSQL's row-level write lock plus the `WHERE status='pending'` predicate means only one concurrent transaction observes the pending row; the other gets zero `RETURNING` rows and treats it as `INVALID`. **Callers MUST check the result `ok` flag — never speculate on `payload` if `ok` is false.**

## Cookie helpers — `setAuthCookie`, `readAuthCookie`, `clearAuthCookie`

```ts
import {
  setAuthCookie,
  readAuthCookie,
  clearAuthCookie,
} from "@workspace/auth/tokens"

// In a route handler or server action:
await setAuthCookie("sig", result.raw)

// Later, on a downstream page:
const raw = await readAuthCookie("sig")
if (!raw) redirect("/auth/login?error=session-expired")

// After consumption:
await clearAuthCookie("sig")
```

Cookie names, paths, TTLs, `__Host-` prefix, `SameSite`, `Secure`, and `HttpOnly` are all derived from the kind descriptor. Callers cannot override them. This is intentional — the cookie posture is part of the security contract, not a per-call option.

## Validation-only helper — `validateTokenFormat`

For routes that need to reject malformed tokens before any I/O:

```ts
import { validateTokenFormat } from "@workspace/auth/tokens"

if (!validateTokenFormat(rawToken, expectedKind, currentEnv)) {
  // Pre-DB rejection — saves a round-trip on probes / typos / replay attempts.
  return new Response("invalid", { status: 400 })
}
```

Pure function. No DB. No cookies. Same regex + checksum logic as step 1-2 of `consumeToken`. Use only when you need pre-DB rejection for performance; do NOT use as a substitute for `consumeToken` — format validity is not authentication.

## Mandatory companions on the route side

These are part of the design contract; the token mechanism alone is not the full security story. See ADR-0022 §"Mandatory companions".

1. **Intermediate "Click to continue" landing page** on signup + invite. Email-prefetch scanners (Outlook SafeLinks, Mimecast, Proofpoint, Gmail) GET the link before the user clicks; consuming on GET burns the token. Landing page renders, user clicks → POST `/auth/<kind>/consume`.
2. **Rate limit middleware** on `/auth/signup/start`, `/auth/invite/start`, `/auth/forgot-password`. Per-IP and per-email windows.
3. **Log scrub** strips `?token=` from URLs at the route-handler and Cloudflare-worker layers before any logger sees them.
4. **`Referrer-Policy: no-referrer`** on every `/auth/*` and `/onboarding/*` route.
5. **Generic INVALID responses.** Never distinguish expired / revoked / wrong-kind / not-found via HTTP status, body, redirect target, or timing.
6. **Atomic redemption.** Already enforced by `consumeToken`. Don't bypass it with a custom SELECT-then-UPDATE.

## Revocation

```ts
import { revokeToken, revokePendingByPayload } from "@workspace/auth/tokens"

await revokeToken(tokenHash)
await revokePendingByPayload("inv", { email: "user@example.com" })
```

`revokeToken` flips `status='revoked'` on a specific row. `revokePendingByPayload` revokes all pending rows matching a kind + payload selector — used when re-issuing a token to the same recipient to ensure earlier tokens cannot be redeemed.

Both run via `withAdminBypass`. Both write to `audit_event` with the actor and reason.

## Retention

A nightly worker (`packages/workers/src/jobs/prune-auth-tokens.ts`) deletes rows where:

- `status IN ('consumed', 'revoked', 'expired')` AND `consumed_at < now() - interval '90 days'`, OR
- `status = 'pending'` AND `expires_at < now() - interval '90 days'`.

90 days is the forensic grace window. Audit metadata about token issuance survives in `audit_event` for the full 10-year retention regardless.

## Don't

- **Don't put PII in `payload` that's not strictly needed.** The payload should be the minimum required to resume the flow. Email is fine for signup; full address is not.
- **Don't read `payload` without `consumeToken`.** No direct SELECTs on `auth_token` outside this package.
- **Don't use the token format for CSRF or webhook signing.** Those need HMAC-based stateless tokens, different shape.
- **Don't log the raw token.** Ever. `pino` has a redaction path for `raw`, `token`, `rawToken`. Use them.
- **Don't store the raw token anywhere on the server.** The DB stores `sha256(raw)` only. The raw token's lifetime is: in transit → in cookie → consumed.
- **Don't reuse a consumed token.** `consumeToken` marks the row consumed atomically; a second call returns `INVALID`. If you need a long-lived session credential, that's Better Auth's `auth_session`, not this.

## See also

- [ADR-0022](../../../../docs/adr/0022-unified-opaque-tokens.md) — design rationale, threat model, alternatives considered
- [ADR-0011](../../../../docs/adr/0011-audit-log.md) — audit log (sibling pattern, redaction registry shared)
- [ADR-0010](../../../../docs/adr/0010-multi-tenant-rls.md) — multi-tenant RLS (why mint/consume run under `withAdminBypass`)
- Legacy AFF-198 — migration tracking
- [`docs/plans/AFF-150-AUDIT-CONTEXT.md`](../../../../docs/plans/AFF-150-AUDIT-CONTEXT.md) — broader auth dependency graph
