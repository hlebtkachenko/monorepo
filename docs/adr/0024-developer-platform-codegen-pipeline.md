# 24. Developer platform codegen pipeline

- Status: Accepted
- Date: 2026-05-20
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
- ADR-0023 planned the docs portal as Fumadocs-style Markdown served
  under `api.afframe.com/docs`. In practice the public surface that
  developers reach for is a separate host (`docs.afframe.com`), the
  content authoring model is MDX + React (so Scalar widgets, Ask AI,
  and live components compose), and the team can ship Pagefind +
  llms.txt + per-page `.md` mirrors for free with that stack.

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
   4. `pnpm --filter docs gen:reference` → `apps/docs/content/reference/*.md`

   Stages without a `gen` script skip cleanly. CI's `sdk-drift`,
   `mcp-coverage`, `docs-coverage`, and `openapi-lint` workflows re-run
   the same pipeline and fail on any uncommitted diff.

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

5. **Developer hub: `apps/docs` at `docs.afframe.com`** (revises
   ADR-0023 §1 / supersedes the Fumadocs decision tracked in AFF-88).
   Next.js 16 + Tailwind + shadcn + MDX. Embeds `@scalar/api-reference`
   at `/reference` and `@scalar/api-client` at `/client`. Includes
   Ask AI (`/api/ask`) with Anthropic Haiku 4.5 grounded against a
   build-time corpus (OpenAPI spec + narrative summaries). Eval set of
   ~50 questions drives the `ask-ai-eval.yml` advisory gate.

6. **Scalar widget at host root.** `api.afframe.com/` (not `/v1/docs`)
   serves the Scalar API Reference with the full configuration surface
   (modern layout, bearer-preferred auth, persisted auth, curl as
   default client, hiddenClients prune, shadcn-aligned theme, OG
   metadata, env-gated remote MCP advertisement). `/v1/docs` 301-
   redirects to `/`. The mount is path-exact (`adapter.get("/", ...)`)
   — `app.use("/", ...)` was a critical bug that intercepted every
   API route by returning HTML.

7. **Editor + Void.** Spec editor at `/editor` redirects to the hosted
   `editor.scalar.com` (no embeddable Scalar Editor npm package
   exists today) gated by an `EDITOR_ENABLED` env var until the admin
   session-gate lands. Void mock-server at `/void/*` echoes request
   shape via an inline Express handler (`@scalar/void-server` ships as
   a Hono app; bridging would be more glue than this 30-line echo).

8. **Governance.** Pre-push `endpoint-checklist` lefthook hook +
   advisory CI workflows (`sdk-drift`, `mcp-coverage`, `docs-coverage`,
   `pr-checklist`) catch the most common "I edited the registry and
   forgot to regen" mistakes. Scope-aware sticky PR comment summarises
   per-PR follow-ups. `.claude/skills/add-endpoint/` skill walks
   contributors through the seven-step endpoint runbook.

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
- The Scalar widget at root + the Ask AI grounded reference give
  developers two complementary surfaces: machine-readable + narrative
  - conversational. Stripe-grade DX without a dedicated docs team.
- The SDK's edge-native footprint (6 KB) unlocks Cloudflare Workers /
  Vercel Edge as supported targets without a separate isomorphic
  build.

Negative / tradeoffs:

- The shared registry is a single point of failure for the entire
  developer platform. A broken `registry.ts` breaks api emit, SDK
  gen, MCP gen, docs reference, and the Ask AI corpus simultaneously.
  Compensated by the CI drift gates and the pre-push hook.
- `@asteasolutions/zod-to-openapi` is a smaller ecosystem than
  `@hono/zod-openapi` or the OpenAPI 3.1 generators built into
  `tRPC` / `Hono`. Acceptable: the registry surface used here is
  small and stable; if the package stagnates we swap it without
  touching consumers (the registry export is local).
- The legacy `Afframe` class in the SDK runs in parallel with the new
  `createAfframeClient` for one release; bridging callers cost time
  the first time they upgrade.
- The docs site adds a sixth Fargate container to the App task. ~$3-5/mo
  marginal cost (no DB, no Redis, no SES, no Anthropic without a key).

## Alternatives considered

- **Stay with `nestjs-swagger` reflector + hand-written downstream
  files.** Cheapest in the short term; doesn't survive AFF-71 (multi-
  domain endpoints) or any external SDK contributor.
- **`@hey-api/openapi-ts` as the SDK generator.** Heavier runtime
  (~30 KB), no first-class edge story, and the generated client is
  opinionated about Axios. Kept as a fallback.
- **Fern OSS self-hosted** for Python / Go SDKs. Punt until paying
  partners ask for non-TS SDKs.
- **Fumadocs-based docs portal** (ADR-0023 plan). Markdown-first +
  Scalar widget worked for static reference, but Ask AI + interactive
  TryIt + cross-linked narrative wanted a React MDX runtime; Next.js
  paid for itself once we wired Ask AI + Pagefind + per-page `.md`
  mirrors all on the same toolchain.
- **`cnoe-io/openapi-mcp-codegen` for MCP tools.** Python-only;
  bridging to a TS MCP server is more friction than re-implementing
  the 100-line codegen in TS.

## Migration

- Phase A: configure existing surfaces (Scalar root mount + spec
  enrichment).
- Phase B: registry cutover + SDK / MCP / CI codegen wired.
- Phase C: `apps/docs` scaffold + content + Ask AI + Dockerfile + CDK
  Fargate.
- Phase D: editor / void + governance docs + secrets hygiene + Linear
  pivot on AFF-88.

ADR-0023 stays accepted for the items not revised here (CLI design,
sandbox model, Plaid envelope, idempotency contract, key prefix
split, versioning policy, changelog feeds). The supersession is
strictly: SDK generator (§4), MCP tool source (§3), docs portal
hosting (§1).
