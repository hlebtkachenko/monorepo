# Developer Portal — Page Map

> **Status note (2026-05-21):** the multi-page developer portal described
> below was descoped to a single surface — the Scalar API Reference at
> `api.afframe.com/`. The narrative pages, Pagefind search, Ask AI, and
> `llms.txt` items remain `[Concept]` and are not in scope for v0. See
> [ADR-0024 Amendment 2026-05-21](../adr/0024-developer-platform-codegen-pipeline.md#amendment-2026-05-21--appsdocs-reverted)
> and [AFF-88](https://linear.app/hapddev/issue/AFF-88) for the open
> question on if/when to revisit.

> Sitemap and rules for the public developer portal at `api.afframe.com/docs` (narrative) and `api.afframe.com/v1/docs` (Scalar reference). Backs [`ADR-0023`](../adr/0023-public-api-developer-platform.md).
>
> Markers: **[Live]** done, **[Wip]** in flight, **[Concept]** planned. Universal = appears in every B2B portal we surveyed (Stripe, Linear, Resend, Plaid, Mercury, Vercel, Twilio); finance-specific = mandatory for an accountancy API; nice-to-have = ship when content exists.

---

## 1. Top-nav

Two tabs + search. The IA pattern is universal across the surveyed portals.

| Tab               | Path                             | Purpose                                            |
| ----------------- | -------------------------------- | -------------------------------------------------- |
| **Docs**          | `api.afframe.com/docs/*`         | Narrative — Get Started, Auth, Errors, Webhooks, … |
| **API Reference** | `api.afframe.com/v1/docs`        | Scalar UI — auto-generated from OpenAPI 3.1        |
| **Changelog**     | `api.afframe.com/docs/changelog` | Per-entry stable URL + RSS/JSON                    |
| **Status**        | `status.afframe.com` (external)  | OpenStatus live status                             |

Header search: Cmd-K, full-text across Markdown source. **[Concept]** powered by Pagefind or Algolia DocSearch.

---

## 2. Sidebar — page taxonomy

Order matters; this is also the table of contents on the docs landing page.

### Get Started — **[Concept]** universal

- **`/docs`** — landing. Promise, three-line architecture, "get a key", links to Quickstart.
- **`/docs/quickstart`** — copy-pasteable `curl` to fetch the first organization, then the same call via Node, Python, Go (code samples flip by language tab).
- **`/docs/installation`** — `@afframe/sdk` install snippets. CLI install. MCP install. One unified page per [`SDK.md`](./SDK.md), [`CLI.md`](./CLI.md), [`MCP.md`](./MCP.md).

### Concepts — universal

- **`/docs/authentication`** — API-key bearer scheme, `affk_live_` vs `affk_test_` prefix, where to get a key, what to never do (commit, log, share).
- **`/docs/errors`** — full envelope, code registry. Source: [`ERRORS.md`](./ERRORS.md).
- **`/docs/rate-limits`** — per-key 100/60 s, `RateLimit-*` headers, 429 + `Retry-After`. Source: [`RATE-LIMITS.md`](./RATE-LIMITS.md).
- **`/docs/idempotency`** — `Idempotency-Key` header, money-mutating-required vs optional rules, replay-cache semantics. Source: [`IDEMPOTENCY.md`](./IDEMPOTENCY.md).
- **`/docs/pagination`** — cursor-based, no offsets (decision per `ADR-0023`). **[Concept]** standalone page when the first list-endpoint ships.
- **`/docs/versioning`** — URL path versioning, RFC 8594 Sunset, deprecation policy. Source: [`VERSIONING.md`](./VERSIONING.md).
- **`/docs/request-ids`** — `X-Request-Id` round-trip + how to quote it in support.

### Finance-specific — universal for accountancy

- **`/docs/money`** — `Money<Currency>` representation in JSON (minor units as string), how the SDK reconstructs it, no native `number`. Backs [`ADR-0013`](../adr/0013-money-and-fx.md).
- **`/docs/fx`** — FX rate model, no auto-inversion / auto-substitution, error semantics when a rate is missing.
- **`/docs/sandbox`** — Plaid-style force-trigger endpoints, seeded fixtures, test bank codes. Source: [`SANDBOX.md`](./SANDBOX.md).
- **`/docs/data-retention`** — what we keep, how long (DPA-aligned, 7-year audit retention).
- **`/docs/compliance`** — GDPR + DORA posture, sub-processor list, "storing API data" guidance (Plaid pattern).

### Webhooks — finance-specific universal

- **`/docs/webhooks`** — overview, signature verification, retry policy. Source: [`WEBHOOKS.md`](./WEBHOOKS.md).
- **`/docs/webhooks/events`** — event-type catalog (`invoice.created`, `invoice.paid`, …). One page; one section per event type with a payload sample + schema link.
- **`/docs/webhooks/testing`** — `afframe listen` (CLI), `/v1/sandbox/fire_webhook` (force-trigger).

### Tooling — universal

- **`/docs/sdk`** — TypeScript SDK install, configure, typed errors. Source: [`SDK.md`](./SDK.md).
- **`/docs/cli`** — `afframe` CLI commands, install, completion, auth. Source: [`CLI.md`](./CLI.md).
- **`/docs/mcp`** — MCP server install (`npx @afframe/mcp` or `mcp.afframe.com`), tool list, scope split. Source: [`MCP.md`](./MCP.md).

### Recipes — nice-to-have

- **`/docs/recipes/sync-bank-feed`** — pull bank movements, reconcile against journal.
- **`/docs/recipes/issue-invoice`** — create draft → finalize → send → handle webhook.
- **`/docs/recipes/close-period`** — month-end close walkthrough.
- **[Concept]** Ships post-launch as content accrues. Every recipe is also a fixture replay in the sandbox.

### Migrations — nice-to-have

- **`/docs/migrations`** — index of `/vN`-to-`/vN+1` guides.
- **[Concept]** Only created when `/v2` lands. Until then, the page doesn't exist (404 — no stub).

### Reference — universal

- **`api.afframe.com/v1/docs`** — Scalar. Rules in [`API-REFERENCE.md`](./API-REFERENCE.md).

### Changelog — universal

- **`/docs/changelog`** — chronological list, stable per-entry URLs.
- **`/changelog/rss.xml`** + **`/changelog/feed.json`** — feeds.
- Format: [`CHANGELOG.md`](./CHANGELOG.md).

### Legal — universal

- **`/legal/terms`**, **`/legal/privacy`**, **`/legal/dpa`**, **`/legal/fair-use`** — owned by `apps/web`, not this surface, but linked from the docs footer.

### LLM-native — differentiator

- **`/llms.txt`** — root manifest per [llmstxt.org convention](https://llmstxt.org/) — lists every doc page + the OpenAPI spec.
- **`<every-page>.md`** — every HTML doc page also served as raw Markdown at the same path + `.md`. Resend, Plaid, Mercury all do this.

---

## 3. Page-level rules

Apply to every Markdown page under `/docs`.

### R1 — Front-matter

```yaml
---
title: Webhooks
description: Subscribe to events, verify signatures, handle retries.
order: 60
tags: [concept, finance-specific]
last_modified: 2026-05-20
---
```

`order` drives the sidebar. `tags` drive content gating (e.g., hiding `[Concept]` pages behind a feature flag pre-launch).

### R2 — One H1 per page, matches `title`

The H1 is what Scalar / search indexes. Always one. No emoji.

### R3 — Copy samples in 6+ languages on every endpoint

Curl, Node (fetch), JavaScript (fetch), Python (requests), Go (net/http), Ruby (faraday). Generated by Scalar from the OpenAPI spec — no hand-maintenance.

### R4 — Test-key example values

Use `affk_test_e7f1...` (the well-known fixture key) in every example. Never paste a real `affk_live_…` even in screenshots.

### R5 — `[Concept]` items carry a callout

```markdown
> **[Concept]** This endpoint is planned but not implemented. Tracked in [AFF-71](https://linear.app/...).
```

Required at the top of any section describing unbuilt functionality. Consumers should never write integration code against a `[Concept]` shape; the shape is a sketch, not a contract.

### R6 — Cross-link to the reference

Every concept page that has corresponding OpenAPI operations carries a "Reference" callout linking to the relevant Scalar deep-link (`/v1/docs#tag/Invoices/operation/createInvoice`).

### R7 — No screenshots of secrets, no real org IDs, no real DIČ

Use the fixture organization (`org_01HXY...`, DIČ `CZ12345678`).

### R8 — Last-modified date in front-matter; rendered in the footer

Lets partners gauge content freshness without reading every line.

### R9 — Inline cross-references use anchor text, not raw URLs

`See [Authentication](./authentication.md)`. Never `See https://...`.

### R10 — `/llms.txt` mirror is non-optional

Every page added is also a Markdown URL. The portal generator must enforce this (CI gate).

---

## 4. Build / serve strategy — **[Concept]**

Three options surveyed. Decision deferred to the developer-platform initiative but the constraints are:

- Markdown source, ideally MDX so we can interleave React widgets (e.g., a live key-validator).
- Same origin as the API (`api.afframe.com/docs` not a separate `docs.afframe.com`) — keeps the auth lock-icon trick (Scalar auto-fills `affk_test_` keys for logged-in users).
- Static export (the docs surface should not block the NestJS container).

Note: `apps/docs` was archived per ADR-0024 Amendment 2026-05-21; the Next.js docs app is no longer an active approach. Future shape is undecided — decision deferred to a follow-up phase before launch.

---

## 5. Navigation rules

### Header

- Logo → `api.afframe.com/docs`
- Search (Cmd-K) — centred
- Tab strip: Docs · API Reference · Changelog · Status
- Right side: dashboard login link

### Sidebar

- Three depth levels max. Going deeper signals the page should be split.
- `[Concept]` pages are dimmed (CSS) so partners can tell at a glance what's live.
- Pinned at top: "Get Started · Quickstart · Authentication". The user lands here after sign-up.

### Footer

- Status, Changelog, GitHub, SECURITY.md, Legal links.
- `Last updated: 2026-05-20` (page-level).

---

## 6. SEO + indexing

- Every page has `description` front-matter mapped to `<meta name="description">`.
- OpenGraph cards via the `@afframe/og` image generator (concept).
- `sitemap.xml` autobuilt from front-matter.
- Robots: allow indexing; only `/v1/openapi.json` carries `X-Robots-Tag: noindex` (machine-readable spec, not for SERPs).

---

## 7. References

- [`ADR-0023`](../adr/0023-public-api-developer-platform.md)
- Stripe Docs IA, Plaid Errors page, Resend `llms.txt`, Mercury Sandbox docs (citations in the platform research notes).
