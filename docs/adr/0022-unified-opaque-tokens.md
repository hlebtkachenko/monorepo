# 22. Unified opaque-token design (`auth_token`)

- Status: **Proposed**
- Date: 2026-05-19
- Deciders: Hleb Tkachenko
- Tracked in Linear: [AFF-198](https://linear.app/hapddev/issue/AFF-198)
- Supersedes: the per-kind JWT modules in `packages/auth/src/tokens/{signup,login-email,onboarding-state,active-workspace}.ts` and the `auth_invite` table from migration `0002_auth.sql`.

## Context and Problem Statement

Today the platform issues five distinct in-flight tokens, designed inconsistently:

| Kind             | Today's shape                            | Storage           | Revocable | Audit at issue | Mutable claims |
| ---------------- | ---------------------------------------- | ----------------- | --------- | -------------- | -------------- |
| signup           | HS256 JWT signed with `APP_TOKEN_SECRET` | none              | no        | no             | no             |
| login-email      | HS256 JWT                                | none              | no        | no             | no             |
| onboarding-state | HS256 JWT                                | none              | no        | no             | no             |
| active-workspace | HS256 JWT                                | none              | no        | no             | no             |
| invite           | opaque 32-byte random + SHA-256 hash     | `auth_invite` row | yes       | yes            | yes            |

Two designs, one codebase. The JWT-based tokens lose revocation, lose audit trail at issue, require key-rotation infrastructure (`APP_TOKEN_SECRET`), and put PII (email, workspace name) directly into the URL/cookie payload. The opaque-DB invite design is strictly stronger on every dimension except per-verify CPU cost.

The audit context dossier ([`docs/plans/AFF-150-AUDIT-CONTEXT.md`](../plans/AFF-150-AUDIT-CONTEXT.md)), the in-session token review, and a security-focused literature pass against NIST SP 800-107r1, RFC 4868, OWASP ASVS #2411, OWASP Session Management Cheat Sheet, and the [GitHub Engineering token-format publication](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/) converged on a single answer: opaque + DB, with a published checksum format, no app-level signing secret.

This ADR formalizes that design and the migration path for all five token kinds.

## Decision

**One opaque-token mechanism for every in-flight token the platform issues.** Backed by a single `auth_token` table. No app-level token-signing secret. No JWTs for our own flows (Better Auth's internal session JWTs and verification tokens are unaffected).

### Token format

```
afkey-<B>-<C>
  B = 32 random bytes from crypto.randomBytes → base62 (43 chars,
      rejection-sampled to avoid alphabet bias on the 256/62 modulo)
  C = sha256("afkey" + B + kind + env).hex.slice(0, 8)
  Separator: "-"
```

Total length: 58 chars. Public secret-scanner regex: `afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}`.

`afkey` is the brand prefix. `B` is the cryptographic secret (256 bits of entropy). `C` is an unkeyed checksum derived from the public format plus the kind and environment context that the verifier knows from the request.

### Why the checksum is unkeyed (P1, not HMAC)

An attacker who possesses a single token can recompute the 15 candidate `sha256(...)` values for `(kind, env)` and learn which flow the token belongs to. This is a real information disclosure under an unkeyed checksum and is **not** a real disclosure in practice because:

1. The kind is already exposed by the URL route the user clicked (`/auth/signup/start`, `/auth/invite/start`).
2. The kind is already exposed by the cookie name (`__Host-afkey-sig`, `__Host-afkey-inv`).
3. The env is already exposed by the hostname (`app.afframe.com` vs `app-staging.afframe.com`).
4. An attacker who has the token also has at least one of those exposing channels.

An HMAC alternative (P2) would hide `(kind, env)` from a token holder but costs a server-side `APP_TOKEN_SECRET`, multi-region key sync, two-secret rotation infrastructure, and a kid scheme. At an 8-hex (32-bit) truncation, HMAC is below NIST SP 800-107r1's 64-bit floor for a meaningful MAC security claim anyway. Growing to 16 hex bytes only addresses MAC strength — it does not change the disclosure picture, because the disclosed fields are already public.

The chosen P1 design aligns with GitHub's published practice: their token format includes a CRC32-style checksum suffix, explicitly framed as a "scanner false-positive reducer", not a security primitive. The actual authentication is the DB lookup.

### Storage

```sql
CREATE TABLE auth_token (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  token_hash               text NOT NULL UNIQUE,
  kind                     text NOT NULL,
  env                      text NOT NULL,
  payload                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at               timestamptz NOT NULL,
  status                   text NOT NULL DEFAULT 'pending',
  issued_at                timestamptz NOT NULL DEFAULT now(),
  issued_to_user_id        uuid REFERENCES app_user(id),
  issued_to_ip             text,
  issued_user_agent_hash   text,
  consumed_at              timestamptz,
  consumed_from_ip         text,
  consumed_user_agent_hash text
);

CREATE INDEX auth_token_status_expires_idx ON auth_token (status, expires_at)
  WHERE status = 'pending';
CREATE INDEX auth_token_kind_issued_idx ON auth_token (kind, issued_at DESC);
```

`token_hash` is `sha256(full_token_string)`. The raw token never lands on disk. RLS is enforced FORCE-style, with writes restricted to `withAdminBypass` callers (mint and consume) and reads denied to all tenant roles. Reasoning: a tenant-bound role has no legitimate read on another tenant's tokens, and the mint path itself runs without tenancy GUCs bound (signup precedes workspace creation).

`payload` stores user-visible metadata per kind — email, workspace name, profile-step state, etc. It is `jsonb`, plaintext, at the same level of protection as `app_user.email` and `workspace.contact_email` (RDS at-rest encryption via AWS Managed Key, plus RLS, plus TLS in transit). Column-level encryption with a Customer Managed KMS Key was considered and deferred — see "Alternatives considered".

`issued_to_ip` and `consumed_from_ip` store the truncated client IP (/24 for IPv4, /48 for IPv6). The 2025 CJEU ruling on IP-as-personal-data classifies truncated IPs as pseudonymized PII, not anonymized PII. Storage basis is legitimate interest (fraud detection on signup), documented in the Article 30 ROPA. Retention is bounded by the token TTL plus a 90-day forensic grace.

`issued_user_agent_hash` and `consumed_user_agent_hash` store `sha256(user_agent)`. Raw UA strings are never persisted on this table.

### Kind taxonomy

| Code  | Use case                                              | Cookie name        | Cookie path   | Default TTL | Sliding          | `__Host-` prefix                 |
| ----- | ----------------------------------------------------- | ------------------ | ------------- | ----------- | ---------------- | -------------------------------- |
| `sig` | Owner signup (Better Auth account does not yet exist) | `__Host-afkey-sig` | `/`           | 48h         | no               | yes                              |
| `inv` | Organization invite redemption                        | `__Host-afkey-inv` | `/`           | 72h         | no               | yes                              |
| `lem` | Login email carrier between step 1 and step 2         | `afkey-lem`        | `/auth/login` | 10 min      | no               | no — `__Host-` requires `Path=/` |
| `ons` | Onboarding step state before BA user exists           | `__Host-afkey-ons` | `/`           | 24h         | yes, hard cap 7d | yes                              |
| `wks` | Active workspace carrier across tabs                  | `__Host-afkey-wks` | `/`           | TBD         | TBD              | yes                              |

Env codes: `dev`, `stg`, `prd`. Encoded into the checksum derivation, never present in cleartext anywhere except the issuing/verifying server context.

Adding a new kind is one constant in the `KIND_DESCRIPTORS` map and one cookie name. The mint/consume API is unchanged.

### Generalization to future tokens

The shape is intentionally generic. The following future use cases fit without changing the mechanism, only adding kind codes:

| Future use                                             | Kind code | Notes                                                                            |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------- |
| API keys                                               | `api`     | Folds in the existing `tokens/api-key.ts` design                                 |
| Email verification                                     | `evf`     | Could replace Better Auth's internal verification if a unified surface is wanted |
| Password reset                                         | `prs`     | Same as above                                                                    |
| Impersonation (admin acting as user)                   | `imp`     | Natural fit; `status='consumed'` blocks replay                                   |
| One-time download URLs (invoice PDF, statement export) | `dlw`     | Bound to (user, document) via `payload`                                          |
| Workspace transfer confirmation                        | `wxf`     |                                                                                  |
| Account deletion confirmation                          | `del`     |                                                                                  |
| 2FA setup confirmation                                 | `tfs`     |                                                                                  |

CSRF tokens and webhook signing tokens are explicitly **not** in scope — those are HMAC-based stateless designs without DB rows and do not benefit from this mechanism.

### Verification flow

```
1. Regex match  ^afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}$              else INVALID
2. Split        [prefix, B, C]
3. expected_kind = inferred from route handler
   expected_env  = inferred from host (or build-time injection)
   recompute     C' = sha256("afkey" + B + expected_kind + expected_env)[0:8]
   compare       crypto.timingSafeEqual(C, C')                   else INVALID
4. token_hash = sha256(full_token_string)
   UPDATE auth_token
     SET status='consumed', consumed_at=now(),
         consumed_from_ip=?, consumed_user_agent_hash=?
     WHERE token_hash=?
       AND status='pending'
       AND expires_at > now()
     RETURNING payload, kind, env, issued_to_user_id
   if affected_rows = 0                                          else INVALID
5. row.kind === expected_kind                                    else INVALID (DB tamper signal)
6. return row.payload, row.issued_to_user_id
```

Steps 1-3 reject the vast majority of garbage tokens (probes, malformed input) before any I/O. Step 4 is atomic under READ COMMITTED on PostgreSQL — the row-level write lock plus the `WHERE status='pending'` predicate is sufficient to serialize concurrent redemption attempts; only one transaction observes `status='pending'` and applies the update. Step 5 is defense in depth: if a DB-write path mis-classified a row's `kind`, the consumer refuses.

The external response on every failure path is the same generic `INVALID` — same HTTP status code, same body shape, same redirect target, same approximate latency. No enumeration channel is left open.

### Mandatory companions (part of the design contract)

The token mechanism alone is not the full security story. These companions must ship together:

1. **Intermediate "Click to continue" landing page** for signup + invite. Email-prefetch scanners (Outlook SafeLinks, Mimecast, Proofpoint, Gmail) issue GETs on link delivery, before the user clicks. A token consumed on GET burns before the user sees the page. The landing page renders, the user clicks, the POST consumes. This defeats prefetch and is the documented industry workaround when token TTLs are not measured in single-digit minutes.
2. **Per-IP and per-email rate-limit middleware** on `/auth/signup/start`, `/auth/invite/start`, `/auth/forgot-password`. Better Auth's built-in rate limiter does not cover custom routes (known footgun, Better Auth issue #3264). Without this, the token-issue endpoint is an open enumeration / spray surface.
3. **Log scrubbing** that strips `?token=` from any URL before any logger sees it. Applied at the Next.js route-handler middleware level and at the Cloudflare worker level for access logs. CloudWatch is downstream and will not see the parameter if upstream scrubbing runs.
4. **`Referrer-Policy: no-referrer`** header on every `/auth/*` and `/onboarding/*` route. Defends against token leakage via Referer on third-party resources loaded by the landing page.
5. **Single generic `INVALID` response** for every redemption failure path. No distinguishing expired vs revoked vs wrong-kind vs not-found via status code, body, redirect, or timing.
6. **Atomic `UPDATE ... WHERE status='pending' RETURNING` for redemption.** The application MUST check the affected-row count from RETURNING. A row count of zero MUST be treated as `INVALID` and the caller MUST NOT proceed with stale or speculative payload data.
7. **`crypto.timingSafeEqual`** for the 8-hex checksum compare. Not optional.
8. **Base62 encoder with rejection sampling.** Modulo-byte-to-62 sampling is biased because 62 does not divide 256; the body distribution shifts. Use a rejection-sampling encoder that re-rolls bytes outside `[0, 248)`.

### What this is not

- Not a JWT design. No claims encoded in the token. No HS256 signature over the body.
- Not encrypted at rest beyond RDS's existing AWS-Managed-Key encryption. The `payload` column is plain JSONB. See "Alternatives considered".
- Not a Bearer authentication scheme. Tokens are single-use redemption credentials, not session tokens.
- Not a replacement for Better Auth's own session, verification, or magic-link tokens. Those stay internal to Better Auth.
- Not signed by a server-side secret. There is no `APP_TOKEN_SECRET` after the migration.

## Alternatives considered

### A. Keep the JWT design (status quo for four of five kinds)

Rejected. JWTs cannot be revoked before their `exp` claim without an external state lookup, which defeats their stateless premise. Revocation is required for any token that can be obsoleted by user action (e.g. user notices a leaked invite email, re-issues — the old token must die). Adding a JWT `jti` + revoked-token table reintroduces the DB lookup that JWTs were meant to avoid, while keeping the disadvantages: PII in the token body, signature-based design (key rotation pain), no audit trail at issue, clock-skew sensitivity.

### B. JWT everywhere with `jti` + revocation table

Rejected. This is the "hybrid" pattern (stateless verify, stateful revocation). It pays the JWT key-rotation cost AND the DB-lookup cost AND keeps PII in the token. The opaque-DB design pays only the DB-lookup cost and removes everything else. Strictly worse trade.

### C. HMAC-keyed checksum (P2)

Rejected. The information P2 hides — `(kind, env)` — is already public via URL, hostname, cookie name, and email body. At 8 hex chars, P2's MAC is also below NIST SP 800-107r1's 64-bit floor for meaningful MAC security; growing it to 16 hex addresses MAC strength but not the disclosure problem. P2's operational cost (`APP_TOKEN_SECRET` provisioning, multi-region key sync, two-secret rotation infrastructure, kill-switch runbook on leak) is non-trivial. Net: high cost, zero real-world security benefit. GitHub publishes their token-format checksum algorithm openly for the same reason.

### D. Column-level encryption of `auth_token.payload` via AWS KMS Customer Managed Key

Rejected for this ADR; deferred to a separate schema-wide decision. The `payload` data is the same shape as `app_user.email`, `workspace.contact_email`, `organization.legal_name`. Those columns sit plaintext under RDS at-rest encryption (AWS Managed Key, no extra cost). Encrypting only the token payload while every sibling PII column is plain is asymmetric and defends a narrower attack surface than the cost justifies (~$1.30/mo plus complexity for one column when the same data leaks from sibling columns anyway).

This decision is revisitable as a schema-wide policy: "all PII columns get a CMK". That is a meaningful, defensible architectural posture. It is not a token-system decision.

### E. Encrypted JWT (JWE) instead of JWS HS256

Rejected. Adds key rotation infrastructure and a second algorithm to maintain, while keeping all the JWT trade-offs already rejected above. The "encrypt PII into the token" win is moot because PII no longer lives in the token under the opaque-DB design.

### F. Separate tables per token kind (extension of today's `auth_invite`)

Rejected. Five tables means five RLS policies, five migration files, five sets of indexes, five mint/consume helpers. The schema is already polymorphic via `kind` and `payload jsonb` without sacrificing query clarity (each kind has a tight (`status`, `expires_at`) filter and the `payload` shape is enforced by Zod at the writer boundary).

### G. Event-sourced token ledger (append a row per state transition)

Rejected. Read-after-write semantics for redemption need a single authoritative row, not a fold over a history table. An event log is the right answer for the audit-event table (ADR-0011) but the wrong answer for a primary-key-lookup credential system.

## Consequences

### Positive

- One mechanism, five callers. New token kinds cost one constant.
- No `APP_TOKEN_SECRET`, no key rotation infrastructure, no kid scheme, no two-region sync.
- Every issued token has an audit row at issue time. Forensic queries are SQL, not log greps.
- Tokens are revocable (flip `status='revoked'`) without app rollout.
- PII never lives in the token URL/cookie/body. Browser history + log capture exposure is reduced to "token hash, kind, env" disclosure — none of which is a credential.
- The published checksum format gives secret scanners a precise regex with negligible false-positive surface.
- Same posture for in-flight token storage as for every other PII column in the schema — RDS at-rest + RLS + TLS. No asymmetric encryption decisions hidden in one column.

### Negative / trade-offs

- One DB write per token issue and one DB UPDATE per token consume. Cost at our volume: negligible (<1ms per call on the existing indexes). Rate-limited routes also gain a write-amplification surface, mitigated by mandatory companion #2.
- `auth_token` table grows linearly with issuance. A nightly worker prunes `status IN ('consumed', 'revoked', 'expired')` rows older than 90 days. The 90-day grace is set to support forensic investigation of compromised accounts.
- Base62 encoder must be rejection-sampling; naive `byte % 62` encoders introduce a 6/256 alphabet bias. Mitigated by mandatory companion #8 and a unit test in the writer module.
- `__Host-` cookie prefix cannot be used on the `lem` cookie (login-email) because that cookie's path-scope (`/auth/login`) conflicts with the `__Host-` `Path=/` requirement. We accept the slightly weaker `lem` cookie posture in exchange for path-scoping; the cookie's 10-minute TTL bounds the exposure.
- DB compromise reveals `(email, workspace_name)` mappings to an attacker via the `payload` column. Same exposure exists today in `app_user.email`, `workspace.contact_email`, `organization.legal_name`. Not a regression.

### Operational

- Migration is staged per kind (Phase 2 of the work plan). Each kind cuts over independently behind a feature flag; old JWT verifiers stay alive for 14 days per kind to redeem any in-flight token. After the grace window, the old verifier is deleted.
- `APP_TOKEN_SECRET` deletion is the last operational step. The Secrets Manager entry is removed only after the 14-day grace and the last JWT verifier is gone.

## Code anchors (forward-looking)

- `packages/db/migrations/00xx_auth_token.sql` — table DDL + indexes + RLS policy + append-only triggers (mirrored from `audit_event`'s pattern in `0004_audit.sql`).
- `packages/db/src/schema/auth_token.ts` — Drizzle schema.
- `packages/auth/src/tokens/auth-token.ts` — `mintToken`, `consumeToken`.
- `packages/auth/src/tokens/format.ts` — pure format validation + checksum compute, no DB.
- `packages/auth/src/tokens/cookies.ts` — `setAuthCookie`, `readAuthCookie`, `clearAuthCookie`, kind-aware.
- `packages/auth/src/tokens/README.md` — developer reference, points to this ADR.
- `packages/eslint-config/rules/no-leaked-afkey.js` — committed-content scan rule.
- `.gitleaks.toml` — secret-scanner pattern.

## See also

- ADR-0010 — Multi-tenant RLS design. `auth_token` writes go through `withAdminBypass` because issuance precedes any bound tenancy context.
- ADR-0011 — Audit log. Token-event audit metadata uses the same two-pass redaction registry; `auth_token` `payload` paths are registered there.
- ADR-0014 — Audit retention. The 90-day token retention is shorter than the 10-year audit retention.
- [GitHub Blog: Behind GitHub's new authentication token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/)
- [NIST SP 800-107r1](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-107r1.pdf)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP A07:2025 Authentication Failures](https://owasp.org/Top10/2025/A07_2025-Authentication_Failures/)
- [Better Auth — Magic link prefetch handling](https://better-auth.com/docs/plugins/magic-link)
- Better Auth issue #3264 — rate limiter does not cover custom routes
- 2025 CJEU ruling on IP-as-personal-data — pseudonymized, not anonymized
