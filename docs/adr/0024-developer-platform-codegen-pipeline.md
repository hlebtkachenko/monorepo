# 24. Developer platform codegen pipeline

- Status: Accepted (Amendment 2026-05-21 — see below)
- Date: 2026-05-20 / Amendment 2026-05-21
- Deciders: Hleb Tkachenko
- Supersedes parts of: [ADR-0023](0023-public-api-developer-platform.md) (SDK generator, MCP tool source, docs hosting)

## Context and Problem Statement

[ADR-0023](0023-public-api-developer-platform.md) locked the public-API
developer-platform direction (CLI, MCP, SDK, webhooks, versioning,
sandbox). AFF-220 shipped Scalar at `/v1/docs`.

Two months in, observing how new endpoints actually land:

- Each addition touched ~7 surfaces by hand: the controller, the
  schema, the SDK class, the MCP tool, three doc pages, the CLI
  subcommand. Drift was inevitable; reviewers caught half of it.
- The Scalar widget at `/v1/docs` shipped with ~5 % of the
  configuration surface used. The page was a tiny terminal of the
  product, not a credible developer entrypoint.
- ADR-0023 chose `hey-api/openapi-ts` for the SDK generator. After
  benchmarking against `openapi-typescript` + `openapi-fetch`, the
  latter pair is 6 KB / zero-deps / edge-native, retains full path
  typing, and ships a clean middleware surface. The size + edge story
  is decisive for partners running on Cloudflare Workers and Vercel
  Edge.

## Decision

1. **Single source of truth: a shared registry**, not the nestjs-swagger
   reflector. Every operation, schema, response, server, tag, and
   security scheme is declared once in
   `packages/shared/src/api/registry.ts` via
   `@asteasolutions/zod-to-openapi`. The committed
   `apps/api/openapi/v1.json` is regenerated from this registry; the
   NestJS controllers' `@ApiTags` / `@ApiOperation` decorators are
   inert at spec-emit time (kept for IDE + review only).

2. **Codegen pipeline = one command.** `pnpm gen:all` runs:
   1. `pnpm --filter api emit:openapi` → `apps/api/openapi/v1.json`
   2. `pnpm --filter @afframe/sdk gen` → `packages/sdk/src/generated/openapi.ts`
   3. `pnpm --filter @afframe/mcp gen` → `apps/mcp/src/tools/generated/*.ts`

   Stages without a `gen` script skip cleanly. CI's `sdk-drift`,
   `mcp-coverage`, and `openapi-lint` workflows re-run the same
   pipeline and fail on any uncommitted diff.

3. **SDK generator: `openapi-typescript` + `openapi-fetch`** (revises
   ADR-0023 §4). Generated `paths` interface; tiny runtime client with
   default headers, retry, deprecation-warn, error mapping. Compile-time
   brands (`Money<C>`, `FxRate<F,T>`, branded resource IDs) live in
   `packages/sdk/src/brands.ts` as overlay on the generated types.

4. **MCP tool source: in-house TypeScript codegen** at
   `apps/mcp/scripts/gen-tools.ts` (`cnoe-io/openapi-mcp-codegen` is
   Python-only). Emits one file per `operationId`. Per-op annotation
   overrides live in `apps/mcp/src/tools/_curate.ts` for cases the HTTP
   verb alone can't capture (destructive POSTs, idempotent POSTs with
   `Idempotency-Key`).

5. **Developer surface = the Scalar API Reference at api root** (revised
   2026-05-21 — see Amendment below). `api.afframe.com/` IS the
   documentation. There is no separate `docs.afframe.com` host. Partner
   developers reach for the Reference + the npm package READMEs (CLI,
   SDK, MCP). Narrative guides (quickstart, errors deep-dive, webhooks
   signing) live in `info.description` markdown rendered by Scalar's
   modern layout, not on a separate site.

6. **Scalar widget at host root.** `api.afframe.com/` (not `/v1/docs`)
   serves the Scalar API Reference with the full configuration surface
   (modern layout, bearer-preferred auth, persisted auth, curl as
   default client, hiddenClients prune, shadcn-aligned theme, OG
   metadata, env-gated remote MCP advertisement). `/v1/docs` 301-
   redirects to `/`. The mount is path-exact (`adapter.get("/", ...)`)
   — `app.use("/", ...)` was a critical bug that intercepted every
   API route by returning HTML.

7. **Editor + Void.** Spec editor at `/editor` redirects to the hosted
   `editor.scalar.com` (no embeddable Scalar Editor npm package exists
   today). The redirect target is public; no auth gate, because the
   spec it points at is also public via `/v1/openapi.json`. Void
   mock-server at `/void/*` echoes request shape via an inline Express
   handler (`@scalar/void-server` ships as a Hono app; bridging would
   be more glue than this 30-line echo).

8. **Governance.** Pre-push `endpoint-checklist` lefthook hook +
   advisory CI workflows (`sdk-drift`, `mcp-coverage`, `pr-checklist`)
   catch the most common "I edited the registry and forgot to regen"
   mistakes. Scope-aware sticky PR comment summarises per-PR
   follow-ups. `.claude/skills/add-endpoint/` skill walks contributors
   through the seven-step endpoint runbook.

9. **Webhooks signature verifier ships with the SDK** as
   `verifyWebhook` (Standard Webhooks v1, HMAC-SHA-256 via Web Crypto),
   not deferred to the Svix client. Survives every supported runtime
   (Node, Bun, Deno, edge); test suite covers happy path, stale
   timestamp, invalid signature, missing header, multi-signature
   rotation.

## Consequences

Positive:

- Adding an endpoint = one PR, one set of registry edits, one
  `pnpm gen:all` run. Every downstream surface stays in lock-step.
- The Scalar Reference is the single canonical developer entrypoint.
  No second surface to keep in sync, no MDX/Next.js maintenance, no
  Anthropic key cost, no per-month SaaS bill.
- The SDK's edge-native footprint (6 KB) unlocks Cloudflare Workers /
  Vercel Edge as supported targets without a separate isomorphic
  build.

Negative / tradeoffs:

- The shared registry is a single point of failure for the entire
  developer platform. A broken `registry.ts` breaks api emit, SDK
  gen, and MCP gen simultaneously. Compensated by the CI drift gates
  and the pre-push hook.
- `@asteasolutions/zod-to-openapi` is a smaller ecosystem than
  `@hono/zod-openapi` or the OpenAPI 3.1 generators built into
  `tRPC` / `Hono`. Acceptable: the registry surface used here is
  small and stable; if the package stagnates we swap it without
  touching consumers (the registry export is local).
- The legacy `Afframe` class in the SDK runs in parallel with the new
  `createAfframeClient` for one release; bridging callers cost time
  the first time they upgrade.
- Narrative guides (CLI install walkthrough, SDK quickstart, webhooks
  signing) can only ride in `info.description` markdown. That panel
  is functional but not the polished docs portal a Stripe-grade
  competitor ships. Revisit if partner feedback flags this gap.

## Alternatives considered

- **Stay with `nestjs-swagger` reflector + hand-written downstream
  files.** Cheapest in the short term; doesn't survive AFF-71 (multi-
  domain endpoints) or any external SDK contributor.
- **`@hey-api/openapi-ts` as the SDK generator.** Heavier runtime
  (~30 KB), no first-class edge story, and the generated client is
  opinionated about Axios. Kept as a fallback.
- **Fern OSS self-hosted** for Python / Go SDKs. Punt until paying
  partners ask for non-TS SDKs.
- **`cnoe-io/openapi-mcp-codegen` for MCP tools.** Python-only;
  bridging to a TS MCP server is more friction than re-implementing
  the 100-line codegen in TS.
- **Scalar Cloud Docs Pro at $72/mo + $24/seat** for the docs site.
  Drops Decision 10 in the v3 plan (no Scalar Cloud); locks content
  authoring into a separate GitHub repo synced to Scalar SaaS, with
  no control over the rendering pipeline. Out of scope for v0; revisit
  when partner traffic justifies the cost.
- **Custom Next.js + MDX docs site at `docs.afframe.com`** (the
  original Phase C scope, see Amendment below). Built and reverted.

## Migration

- Phase A: configure existing surfaces (Scalar root mount + spec
  enrichment). **Shipped.**
- Phase B: registry cutover + SDK / MCP / CI codegen wired. **Shipped.**
- Phase C: `apps/docs` self-hosted Next.js + MDX hub. **Built then
  archived 2026-05-21** — see Amendment.
- Phase D: editor / void + governance docs + secrets hygiene + Linear
  pivot on AFF-88. **Shipped except cross-subdomain cookie span for
  the docs host, which is moot now.**

ADR-0023 stays accepted for the items not revised here (CLI design,
sandbox model, Plaid envelope, idempotency contract, key prefix
split, versioning policy, changelog feeds). The supersession is
strictly: SDK generator (§4), MCP tool source (§3), docs portal
hosting (§1).

## Amendment 2026-05-21 — `apps/docs` reverted

The Phase C `apps/docs` self-hosted Next.js + MDX hub at
`docs.afframe.com` was built, reviewed, and shipped to branch on
2026-05-20. On 2026-05-21 we walked it back to a Reference-only end
state. Captured here so the rationale persists alongside the rest of
the ADR.

Why the revert:

- The v3 plan locked Decision 8 ("self-hosted apps/docs Next.js + MDX
  - shadcn + Pagefind + Ask AI"). Decision 10 ("No Cloud Scalar
    anywhere. OSS pieces only") foreclosed the only Scalar-native
    docs path. The plan therefore described "Scalar everywhere" in
    spirit but specified a custom MDX site in fact — the same
    authoring model AFF-88's Fumadocs decision had picked, just on a
    different framework.
- The implementation was correct against the plan but missed the
  user's actual intent, which was to _use Scalar_ for the docs
  surface end-to-end. Scalar OSS does not ship a guides product
  (only the API Reference / Client / Editor / Void / Mock widgets);
  the guides product is Cloud-only ($72/mo Pro + $24/mo per editor
  seat) and was foreclosed by Decision 10.
- Faced with the three choices — drop Decision 10 and pay Scalar
  Cloud, keep the custom Next.js + MDX site, or accept that the API
  Reference IS the docs — we picked door three. Lower cost, no
  parallel-surface drift, and the Reference's `info.description`
  panel covers the narrative we need today.

What was kept from Phase C/D:

- Phase A + B unchanged: Scalar at api root, registry + codegen
  pipeline, SDK + MCP regeneration.
- D1 Editor (`/editor` redirect, gate dropped) + Void (`/void/*`
  echo) kept on `apps/api`.
- D3 governance kept: ADRs, runbooks, START-HERE.md, the
  `/add-endpoint` skill, the `endpoint-checklist` lefthook hook, the
  scope-aware PR checklist.
- D5 gitleaks rules for Anthropic key + Standard Webhooks secret
  kept (defensive, no live consumer for Anthropic today).

What was archived:

- `apps/docs/` moved to `.context/archive/apps-docs-2026-05-21/`.
  Source preserved with git history; the directory is no longer a
  workspace package, no longer built, no longer deployed.
- `.github/workflows/docs-coverage.yml` and `ask-ai-eval.yml` deleted.
- `scripts/governance/check-docs-coverage.mjs` and
  `run-ask-ai-eval.mjs` deleted.
- `infra/cdk` `DocsRepo` + docs Fargate container + `anthropicApiKeySecretArn`
  context input + `DOCS_DOMAIN` + `API_DOMAIN` env vars + `docsLogGroup`
  removed.
- `documentation_url` field stopped being emitted by
  `DomainExceptionFilter` (kept optional in the Plaid envelope
  schema for future use; SDK still parses on inbound responses).
- `info.contact.url`, `info.license.url`, `termsOfService`, and
  `externalDocs` stripped from the OpenAPI document — they pointed
  at `docs.afframe.com` paths that no longer exist.

Future option (deferred, not in scope here):

- Re-evaluate Scalar Cloud Docs Pro vs. status quo when partner
  traffic appears, when narrative authoring outgrows
  `info.description` markdown, or when a hosted docs partner asks
  for one. Linear AFF-88 stays open as the tracking ticket.
- Linear AFF-226 (accounting body content) and AFF-227 (help-center
  copy) closed as not-doing under the current end state. Their
  source MDX lives in the archived `apps/docs/content/` and can be
  re-imported if a future docs surface lands.
