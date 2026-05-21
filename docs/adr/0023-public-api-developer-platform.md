# 23. Public API developer platform — pages, CLI, MCP, SDK, webhooks

- Status: Accepted
- Date: 2026-05-20
- Deciders: Hleb Tkachenko

> **Amendment 2026-05-21 — see [ADR-0024](0024-developer-platform-codegen-pipeline.md).** Decision 1's URL layout (`api.afframe.com/docs` + `api.afframe.com/v1/docs`) no longer applies: `apps/docs` has been archived and the Scalar reference is now served at the API root (`api.afframe.com/`). Decision 4's SDK generator (`hey-api/openapi-ts`) has been replaced by `openapi-typescript` + `openapi-fetch`. Decision 3's MCP codegen pass (`cnoe-io/openapi-mcp-codegen`) has been replaced by in-house TypeScript codegen at `apps/mcp/scripts/gen-tools.ts`.

## Context and Problem Statement

[ADR-0020](0020-public-api-foundation.md) shipped the contract layer (`/v1/*`, NestJS + `nestjs-zod` + OpenAPI 3.1). AFF-220 replaced the Swagger UI with Scalar at `/v1/docs`. Two operations are live (`/v1/ping`, `/v1/organization`); domain endpoints (AFF-71), authz (AFF-46), and key management (AFF-73) are in flight.

The auto-generated reference is necessary but not sufficient. A real public launch needs: narrative docs (auth, errors, rate limits, idempotency, webhooks, versioning), a sandbox, a CLI, an MCP server, an SDK, a changelog with feeds, and a clear deprecation policy. The decision is what to build, in what order, and where to draw the build-vs-buy line.

## Decision

1. **Developer portal — Markdown-first, OpenAPI-driven, Scalar for the reference**, all served under `api.afframe.com/docs` (narrative) + `api.afframe.com/v1/docs` (Scalar reference). Page map in [`docs/api/DEV-PORTAL.md`](../api/DEV-PORTAL.md). Universal pages (Get Started, Authentication, Errors, Rate limits, Pagination, Idempotency, Versioning, Webhooks, Sandbox, Changelog, SDKs, CLI, MCP) ship before the public launch; nice-to-have pages (Recipes, Migrations) are deferred until they have content.

2. **CLI — TypeScript + oclif, distributed via Homebrew tap and GitHub Releases (signed binaries).** Lives at `apps/cli`, shares `@workspace/shared` types. v0 commands: `login / logout / whoami / config / api / open`. Webhook tooling (`listen / trigger`) ships with webhooks. No global `npm i -g`. Design: [`docs/api/CLI.md`](../api/CLI.md).

3. **MCP server — dual distribution: hosted Streamable-HTTP at `mcp.afframe.com` (OAuth) + npx package `@afframe/mcp` (bearer-token via env).** Tools are curated (verb_resource snake_case), generated from OpenAPI with hand-curated edits, committed as source — not regenerated at runtime. Read / write / destructive scope split. Lives at `apps/mcp`. Design: [`docs/api/MCP.md`](../api/MCP.md).

4. **SDK — TypeScript first, generated with `hey-api/openapi-ts`, published as `@afframe/sdk`** (semver independent of API path version). Python via Speakeasy on first paying-partner ask. No Go until requested. Design: [`docs/api/SDK.md`](../api/SDK.md).

5. **Webhooks — adopt the Standard Webhooks spec** (HMAC-SHA256, `webhook-signature` / `webhook-id` / `webhook-timestamp` headers, 5-min replay window). Delivery via Svix Cloud free tier behind our own `/v1/webhook_endpoints` API surface; migrate to self-hosted Hook0 on the OVH/AWS infra at the ~€500/mo crossover. Standard-Webhooks signature contract keeps consumers portable across backends. Design: [`docs/api/WEBHOOKS.md`](../api/WEBHOOKS.md).

6. **Versioning — URL-path (`/v1` → `/v2`)** with [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594.html) `Sunset` + IETF `Deprecation` headers on retiring endpoints. No date-pinned versioning à la Stripe — too expensive to maintain at single-engineer scale. 6-month deprecation minimum, 12-month parallel `/vN` operation. Policy: [`docs/api/VERSIONING.md`](../api/VERSIONING.md).

7. **Sandbox — first-class.** Every signup gets an `affk_test_…` key against a logically-isolated `is_test` organization, seeded with VAT-registered fixtures + sample invoices. Force-trigger endpoints (`/v1/sandbox/*`) simulate error states and webhook events. Plaid-style. Design: [`docs/api/SANDBOX.md`](../api/SANDBOX.md).

8. **Error envelope — Plaid-shape extension of the current contract.** Adds `error_type`, `display_message`, `documentation_url`. Backwards-compatible with the existing `{ code, message, requestId }` shape from `DomainExceptionFilter`. Registry: [`docs/api/ERRORS.md`](../api/ERRORS.md).

9. **Idempotency — `Idempotency-Key` header required on all `POST /v1/*` that mutate money or journal state.** Best-effort on other POSTs. 24-hour cache. Contract: [`docs/api/IDEMPOTENCY.md`](../api/IDEMPOTENCY.md).

10. **Key prefix split — `affk_live_…` (prod) and `affk_test_…` (sandbox).** Migration from the current `afk_` prefix (the foundation chose `afk_` before this ADR) happens in AFF-73 alongside the admin dashboard. GitHub secret-scanning + custom gitleaks rules use the prefix.

11. **Changelog — Markdown source, RSS + JSON feeds, single page.** No mailing list at launch (monthly digest later). Per-entry stable URLs.

12. **`llms.txt` mirror.** Ship `/llms.txt` + per-page `.md` mirrors of the dev portal. Trivial from existing Markdown + the OpenAPI spec; aligns with Afframe's agent-native positioning.

Concept items (planned, not implemented) carry an explicit `[Concept]` label in every doc they appear in.

## Consequences

Positive:

- One coherent answer to "how do partners integrate" — they get the Scalar reference, narrative docs, a sandbox, an SDK, a CLI, an MCP server, and webhooks, all with one prefix change to flip prod/test.
- Standard Webhooks contract decouples the webhook backend (Svix → Hook0 later) from the consumer integration. No partner has to rewire signature verification.
- Path-based versioning + RFC 8594 headers is a one-engineer-maintainable policy. No combinatorial explosion of pinned versions.
- MCP + CLI are co-designed: `afframe listen` and the MCP server share the same auth wiring, the same Zod types, the same workspace package.
- Czech-specific gitleaks rules (IBAN, DIČ, rodné číslo, bank-code accounts) catch domain leaks the default rules miss.

Negative / trade-offs:

- Five new surfaces (CLI, MCP, SDK, webhooks, sandbox) shipping in parallel is a lot. The roadmap in [`docs/api/PUBLIC-LAUNCH.md`](../api/PUBLIC-LAUNCH.md) sequences them; not all land before GA.
- Svix Cloud is a runtime dependency for webhooks. Acceptable on the free tier (50k msgs/mo); migration plan to Hook0 documented in [`WEBHOOKS.md`](../api/WEBHOOKS.md).
- Key prefix migration (`afk_` → `affk_`) requires AFF-73 work. Until then, the foundation's keys keep the `afk_` prefix.
- The sandbox doubles the data-seeding surface (test org seeded on signup, force-trigger endpoints to maintain). Up-front cost; pays for itself the first time a partner asks "how do I test webhook delivery without a real bank feed".

Follow-up work required:

- AFF-73 — admin dashboard for key management + key prefix migration.
- A new Linear initiative for the developer platform (CLI, MCP, SDK, webhooks, sandbox). Each ships as a separate phase with `/gsd:plan-phase`.
- Update `.gitleaks.toml` (new file) with Czech finance rules + `affk_live_` rule. Done in this same change (see [`docs/runbooks/SECRETS.md`](../runbooks/SECRETS.md) for context).
- Wire `/.well-known/security.txt` (web app responsibility, not the API). RFC 9116.
- Update `SECURITY.md` with the `security@afframe.com` alias once the mailbox exists.

## Alternatives considered

- **Date-pinned versioning (Stripe-style).** Rejected: one-engineer team, accountancy domain changes with legislation, the compatibility tax is years of work for a marginal partner-experience gain over `/v2` path versioning + Sunset headers.
- **Build webhook delivery in-house.** Rejected: durable retry, secret rotation, partner-facing event log are 2-3 engineer-months. Svix Cloud free tier + migration path to self-hosted Hook0 buys the time.
- **Generic `openapi-call` MCP tool.** Rejected: empirical research (Cursor 40-tool cap, GitHub MCP burning 42k tokens on definitions) shows LLMs select named intents better than a single generic call. Curated tool surface is the dominant pattern (Stripe, Linear, Sentry).
- **`@afframe/sdk` hand-rolled.** Rejected at the >10-endpoint scale. Generated SDK from OpenAPI keeps the SDK honest by construction.
- **OAuth-only API auth.** Rejected for launch: bearer keys are the universal common denominator for accountant developers' scripts. OAuth (per-org-installed app pattern) is a separate ADR when an integrations marketplace lands.
- **Python or Go SDK at launch.** Deferred. Add when a paying partner asks.

## See also

- [ADR-0020](0020-public-api-foundation.md) — public API foundation (contract layer, build, container)
- [ADR-0008](0008-cloudflare-tunnel-and-email.md) — `api.afframe.com` routing
- [ADR-0013](0013-money-and-fx.md) — `Money<Currency>` and FX (SDK typing)
- [ADR-0018](0018-three-layer-authz.md) — Cerbos + OpenFGA (MCP scope split rides on this)
- [ADR-0022](0022-unified-opaque-tokens.md) — `affk_` prefix policy
- [`docs/api/API-REFERENCE.md`](../api/API-REFERENCE.md), [`docs/api/PUBLIC-LAUNCH.md`](../api/PUBLIC-LAUNCH.md), [`docs/api/DEV-PORTAL.md`](../api/DEV-PORTAL.md)
- [`docs/runbooks/PUBLIC-REPO-CHECKLIST.md`](../runbooks/PUBLIC-REPO-CHECKLIST.md) — repo-side hardening (separate concern)
- [Standard Webhooks](https://www.standardwebhooks.com/), [RFC 8594 — Sunset](https://www.rfc-editor.org/rfc/rfc8594.html), [RFC 9116 — security.txt](https://www.rfc-editor.org/rfc/rfc9116), [IETF Idempotency-Key](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)
