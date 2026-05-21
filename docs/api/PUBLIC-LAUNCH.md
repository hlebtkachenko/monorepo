# Public API Launch Checklist

> Master tracker for moving `api.afframe.com/v1` from "the foundation works" to "publicly documented + ready for paying partners". Pair with [`ADR-0023`](../adr/0023-public-api-developer-platform.md) (the platform decision) and [`docs/runbooks/PUBLIC-REPO-CHECKLIST.md`](../runbooks/PUBLIC-REPO-CHECKLIST.md) (repo-side hardening — different concern).
>
> **2026-05-21 amendment:** Phase 1 narrative-docs surface (`apps/docs`)
> was built and archived to `.context/archive/apps-docs-2026-05-21/` —
> see [ADR-0024 Amendment 2026-05-21](../adr/0024-developer-platform-codegen-pipeline.md#amendment-2026-05-21--appsdocs-reverted).
> Phase 10 (`llms.txt` + per-page `.md` mirrors) is descoped to v1.
> Public launch now rides on the Scalar API Reference at
> `api.afframe.com/` plus the per-package npm READMEs (CLI, SDK, MCP).
>
> Items are tagged: **[Live]** done today, **[Wip]** in flight, **[Concept]** planned but not built. Every concept item links to a Linear issue or a design doc.

---

## Phase map

| Phase | Theme                                                                                       | Status                               |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| 0     | Foundation — `/v1/ping`, `/v1/organization`, Scalar at `/v1/docs`, OpenAPI 3.1              | **[Live]** AFF-220 closed 2026-05-20 |
| 1     | Narrative docs — Errors, Rate limits, Idempotency, Versioning, Webhooks, Sandbox, Changelog | **[Wip]** scaffolded in this change  |
| 2     | Domain endpoints — invoices, accounts, journals                                             | **[Concept]** AFF-71                 |
| 3     | Authorization — Cerbos L3 + OpenFGA L2                                                      | **[Concept]** AFF-46                 |
| 4     | Admin dashboard — key issuance + `affk_live_` / `affk_test_` prefix migration               | **[Concept]** AFF-73                 |
| 5     | Sandbox — `affk_test_` keys, seeded fixtures, force-trigger endpoints                       | **[Concept]**                        |
| 6     | Webhooks — Standard Webhooks, Svix Cloud backend                                            | **[Concept]**                        |
| 7     | SDK `@afframe/sdk` — TypeScript, generated from OpenAPI                                     | **[Concept]**                        |
| 8     | CLI `afframe` — oclif, Homebrew tap                                                         | **[Concept]**                        |
| 9     | MCP server `@afframe/mcp` — npx + hosted `mcp.afframe.com`                                  | **[Concept]**                        |
| 10    | `llms.txt` mirror — every page also as `.md`                                                | **[Concept]**                        |
| 11    | Public launch — change `is_public` flag, comms                                              | **[Concept]**                        |

GA gate = phases 1, 4, 5, 6, 7, 8 done. CLI/MCP/SDK can lag by a release if they're not blocking the first integration partner.

---

## 1. Security + abuse

### 1.1 Rate limits — **[Live]**

- 100 req / 60 s per API key. `ApiKeyThrottlerGuard` keys on the API key ID, not IP (the Cloudflare Tunnel collapses all client IPs to the sidecar loopback).
- **[Concept]** Surface `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` response headers + `Retry-After` on 429. Today the throttler returns a bare 429.
- **[Concept]** Per-route tier overrides (lower limit on `/v1/journals/import` than `/v1/ping`). One-line `@Throttle()` decorator override per controller.

Detail: [`RATE-LIMITS.md`](./RATE-LIMITS.md).

### 1.2 Idempotency — **[Concept]**

- `Idempotency-Key` header **required** on every `POST` that mutates money or journal state (`/v1/invoices`, `/v1/journals`, future `/v1/payments`).
- `Idempotency-Key` **accepted but optional** on other mutating routes.
- 24-hour replay cache: `(key, route)` → `(status, body)`. Same key + different payload → 409. Per [IETF draft `draft-ietf-httpapi-idempotency-key-header`](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header).
- **No idempotency on `GET` / `DELETE`** — semantics already idempotent.

Contract: [`IDEMPOTENCY.md`](./IDEMPOTENCY.md).

### 1.3 Request limits — **[Concept]**

- Body cap 5 MB (configurable per route — lower for read-only endpoints).
- Headers cap 16 KB.
- HTTP method allow-list per route — 405 on others.

Wired via NestJS `bodyParser` options + helmet defaults.

### 1.4 CORS — **[Live]** (closed by default)

- API does not set `Access-Control-Allow-Origin`. Public API is server-to-server.
- **[Concept]** Open per-customer with an explicit `cors_origins` field on the API key once a browser SDK ships.

### 1.5 `X-Request-Id` — **[Live]**

- `RequestIdMiddleware` accepts inbound `X-Request-Id`, generates a UUID v4 if absent, echoes it on every response.
- Surfaces in the error envelope as `error.requestId`.
- **[Concept]** Switch to ULID for monotonic-sortable IDs (one-line change in `RequestIdMiddleware`).

### 1.6 Audit log — **[Concept]**

- Append-only `api_audit` table: `request_id, api_key_id, organization_id, route, method, status, ms, ip, ua, error_code`.
- GDPR Article 30 record-of-processing. DORA-aware (we're financial-adjacent).
- Retention 7 years (matches CloudTrail bucket policy).
- Never log request/response bodies.

### 1.7 Key rotation — **[Concept]**

- Rolling 90-day expiry, two active keys per partner during the rotation window.
- `last_used_at` in the admin dashboard. Auto-disable on 30-day no-use (warn at 14 days).
- Soft revoke (mark `is_active = false`, keep row for audit) — never delete.

### 1.8 Scopes — **[Concept]**

- Restricted keys per Stripe's pattern: `invoices:read`, `invoices:write`, `journals:write`, `webhooks:manage`, …
- Default new keys to least privilege (read-only) at issuance.
- Carry into MCP server (read / write / destructive bundles — see [`MCP.md`](./MCP.md)).

### 1.9 IP allow-list per key — **[Concept]**

- Optional per key, off by default. CIDR list.
- CZ accounting offices ask for it; cheap to add once `api_key` table evolves.

### 1.10 Key prefix split — **[Concept]** (AFF-73)

- `affk_live_<random>` (production keys).
- `affk_test_<random>` (sandbox keys against an `is_test = true` organization).
- The current foundation uses `afk_` (no prod/test split). Migration script in AFF-73 rewrites existing keys.
- GitHub secret-scanning auto-revocation matches the prefixes.

---

## 2. Legal + process

### 2.1 ToS, Privacy, DPA, Fair Use — **[Concept]**

- `/legal/terms`, `/legal/privacy`, `/legal/dpa`, `/legal/fair-use`. Last-modified dates on every page.
- DPA must be GDPR + DORA-aware (financial-adjacent infrastructure). Sub-processor list updated quarterly.
- Owned by `apps/web` (`app.afframe.com/legal/*`), not the API container.

### 2.2 Deprecation policy — **[Concept]**

- 6-month minimum window between `Deprecation` header and `Sunset`.
- 12-month parallel run of `/vN` and `/vN+1`.
- Field-level deprecation via OpenAPI `deprecated: true` + `x-deprecated-since` + `x-sunset` extensions.
- Endpoint removal requires changelog entry + at least one email blast.

Policy: [`VERSIONING.md`](./VERSIONING.md).

### 2.3 Support SLO — **[Concept]**

- P1 (outage, data loss risk): acknowledge 4h, fix ASAP.
- P2 (degraded, workarounds exist): acknowledge 1 business day.
- P3 (questions, feature requests): acknowledge 5 business days.
- Published on the docs landing page.

### 2.4 Security disclosure — **[Live]** + **[Concept]**

- [Live] `SECURITY.md` at repo root: report to `support+github@afframe.com`, 72h acknowledgement target.
- **[Concept]** Serve `/.well-known/security.txt` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)) on `afframe.com` with `Contact: mailto:security@afframe.com`, `Expires:`, `Preferred-Languages: en, cs`, no-litigation safe harbor clause.
- **[Concept]** Bug bounty optional. List as "no bounty, but credited" until a budget exists.

---

## 3. Observability

### 3.1 Structured logs — **[Wip]**

- One JSON line per request: `ts, request_id, key_id, org_id, route, method, status, ms, ip, ua, error_code`.
- Never log bodies (PII, money).
- Already partially wired via NestJS logger; finalise schema before launch.

### 3.2 Public status page — **[Live]**

- [`status.afframe.com`](https://status.afframe.com) (OpenStatus on the OVH VPS — see [`ADR-0019`](../adr/0019-status-page-and-uptime-monitoring.md) + [`docs/runbooks/STATUS-PAGE.md`](../runbooks/STATUS-PAGE.md)).
- **[Concept]** Add named components: `Public API`, `Webhooks`, `Auth`, `Docs`. RSS + email subscriptions.
- **[Concept]** Link from the docs landing page header.

### 3.3 Alerts — **[Concept]**

- Synthetic `/v1/ping` from OpenStatus every 60 s.
- CloudWatch alarms: 5xx rate > 1% over 5 min, p99 latency > 1 s over 5 min.
- Page via SNS → email + future PagerDuty.

### 3.4 Published SLOs — **[Concept]**

- 99.9% monthly availability.
- p95 < 300 ms read, < 800 ms write.
- Publish on the docs landing page. Refunded against tier credits if breached.

---

## 4. Versioning + change management

See [`VERSIONING.md`](./VERSIONING.md). Summary:

- **[Live]** URL-path versioning (`/v1`).
- **[Concept]** `Deprecation` + `Sunset` headers on retiring endpoints per RFC 8594 + IETF draft.
- **[Concept]** Field-level `deprecated: true` in OpenAPI; Scalar renders strikethrough automatically.
- **No** date-pinned versioning. Path versioning + Sunset headers is right-sized for the team.

---

## 5. Comms

### 5.1 Changelog — **[Concept]**

- Markdown-driven at `/docs/changelog`. Source: `docs/api/CHANGELOG.md` (concept location).
- RSS (`/changelog/rss.xml`) + JSON (`/changelog/feed.json`).
- Per-entry stable URL.
- Tag `feat:` / `fix:` / `breaking:` / `deprecated:`.

Format: [`CHANGELOG.md`](./CHANGELOG.md).

### 5.2 Email cadence — **[Concept]**

- Monthly digest only.
- One-off email for breaking-change announcements (≥6 months before `Sunset`).
- No marketing/onboarding sprays.

### 5.3 Status sub-page — **[Concept]**

- Link `status.afframe.com` from the docs landing header.
- Embed the live "all systems operational" badge.

---

## 6. Secret hygiene

### 6.1 gitleaks — **[Wip]** (this change)

- [Live] `gitleaks detect` runs on every push in `.github/workflows/ci.yml`.
- **[Wip]** Add `.gitleaks.toml` with custom rules — `affk_live_`, `affk_test_`, Czech IBAN, Czech DIČ, Czech rodné číslo, Czech bank-code account numbers. **Done in this change.**
- **[Concept]** Lefthook pre-commit hook running `gitleaks protect --staged` (currently we lint + prettier + commitlint; gitleaks runs only in CI).

### 6.2 Key prefixes — **[Concept]** (AFF-73)

- `affk_live_…` (prod) and `affk_test_…` (sandbox) — distinct so GitHub secret-scanning + gitleaks can match each separately.
- Migration from the foundation's `afk_` prefix tracked in AFF-73.

### 6.3 Sandbox sample data — **[Concept]**

- Every new signup gets an `affk_test_…` key + a seeded `is_test = true` organization.
- Sample VAT-registered org (DIČ `CZ12345678`, IČO `12345678`), 100 invoices, two bank accounts, one journal cycle.
- No credit card required to test.

Detail: [`SANDBOX.md`](./SANDBOX.md).

---

## 7. Surfaces (CLI, MCP, SDK, Webhooks)

| Surface                                                        | Doc                            | Status        |
| -------------------------------------------------------------- | ------------------------------ | ------------- |
| `@afframe/sdk` (TypeScript, generated from OpenAPI)            | [`SDK.md`](./SDK.md)           | **[Concept]** |
| `afframe` CLI (oclif, Homebrew + GitHub Releases)              | [`CLI.md`](./CLI.md)           | **[Concept]** |
| `@afframe/mcp` (npx + hosted `mcp.afframe.com`)                | [`MCP.md`](./MCP.md)           | **[Concept]** |
| Webhooks (Standard Webhooks, Svix Cloud backend → Hook0 later) | [`WEBHOOKS.md`](./WEBHOOKS.md) | **[Concept]** |

---

## 8. Public-launch gate — the actual "is this ready" checklist

Concrete pass/fail items, derived from the rest of this doc. The gate fires when phase 11 (public launch) is being considered.

### Must-have

- [ ] Domain endpoints (`/v1/invoices`, `/v1/accounts`, `/v1/journals`) live (AFF-71).
- [ ] Authz layered in (Cerbos + OpenFGA, AFF-46).
- [ ] Admin dashboard key issuance (`affk_live_` / `affk_test_`, AFF-73).
- [ ] Sandbox seeding + force-trigger endpoints (`/v1/sandbox/*`).
- [ ] Webhooks signed per Standard Webhooks, with at-least-once delivery + per-endpoint DLQ.
- [ ] `RateLimit-*` headers + `Retry-After` on 429.
- [ ] Idempotency required on money-mutating POSTs.
- [ ] `X-Request-Id` round-trips and appears in every error.
- [ ] Plaid-shape error envelope live (`error_type`, `display_message`). `documentation_url` stays optional — pending docs surface.
- [ ] Audit log table + retention.
- [ ] `.gitleaks.toml` custom rules merged + advisory CI green (done in this change).
- [ ] `/.well-known/security.txt` live on `afframe.com`.
- [ ] ToS / Privacy / DPA / Fair Use published.
- [ ] Deprecation policy ([`VERSIONING.md`](./VERSIONING.md)) published.
- [ ] Status page lists `Public API`, `Webhooks`, `Auth`, `Docs` components.
- [ ] Changelog page + RSS + JSON feeds live.
- [ ] Public launch rides on Scalar reference at `api.afframe.com/` + per-package npm READMEs (CLI, SDK, MCP). Narrative docs at a dedicated path are contingent on a future docs surface (per ADR-0024 amendment 2026-05-21).
- [ ] `llms.txt` + per-page `.md` mirrors.

### Should-have

- [ ] `@afframe/sdk` (TypeScript) v1.0 on npm.
- [ ] `afframe` CLI v1.0 on Homebrew tap + GitHub Releases.
- [ ] `afframe listen` for webhook local testing.
- [ ] `@afframe/mcp` on npm + `mcp.afframe.com` hosted.

### Could-have

- [ ] Python SDK via Speakeasy.
- [ ] Scoped keys (`invoices:read`, etc.).
- [ ] Bug bounty.
- [ ] Per-customer CORS.
- [ ] Per-route rate-limit tier overrides.

---

## 9. References

- [`ADR-0023`](../adr/0023-public-api-developer-platform.md) — the platform decision
- [`DEV-PORTAL.md`](./DEV-PORTAL.md), [`CLI.md`](./CLI.md), [`MCP.md`](./MCP.md), [`SDK.md`](./SDK.md), [`WEBHOOKS.md`](./WEBHOOKS.md)
- [`ERRORS.md`](./ERRORS.md), [`RATE-LIMITS.md`](./RATE-LIMITS.md), [`IDEMPOTENCY.md`](./IDEMPOTENCY.md), [`VERSIONING.md`](./VERSIONING.md), [`SANDBOX.md`](./SANDBOX.md), [`CHANGELOG.md`](./CHANGELOG.md)
- [`API-REFERENCE.md`](./API-REFERENCE.md) — the Scalar/`/v1/docs` rules
- [`docs/runbooks/PUBLIC-REPO-CHECKLIST.md`](../runbooks/PUBLIC-REPO-CHECKLIST.md) — repo-side hardening (separate, already done)
- [`SECURITY.md`](../../SECURITY.md) — vulnerability reporting
- [Standard Webhooks](https://www.standardwebhooks.com/), [RFC 8594 — Sunset](https://www.rfc-editor.org/rfc/rfc8594.html), [RFC 9116 — security.txt](https://www.rfc-editor.org/rfc/rfc9116), [IETF Idempotency-Key](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)
