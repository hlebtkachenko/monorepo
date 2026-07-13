# Agent Instructions

Instructions for AI agents (Claude Code, Codex, Cursor) working in this monorepo.

## Issue Tracking

Issues and planning live in **GitHub Issues** and the active GitHub Project
configured by Hleb for the current planning horizon. GitHub Issues are the
source of truth for work that spans sessions: read the issue before starting,
keep status/progress in the issue or linked PR, and close the issue through the
PR when the work lands.

Use the project fields, not separate tracker prefixes, for routing:

- `Type`: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `security`, `EPIC`
- `Priority`: `Urgent`, `High`, `Medium`, `Low`
- `Status`: `Backlog`, `In progress`, `In review`, `Done`

PR automation links PRs back to GitHub issues from PR metadata. Prefer GitHub
closing keywords in the PR body (`Closes #123`, `Fixes #123`) for work that
should close on merge, or `Refs #123` for contextual links only. The sync also
understands explicit `#123` references in PR titles, PR bodies, and commit
messages. Branch names are not part of issue tracking.

## Asking Hleb (human-in-the-loop)

Before a **risky, irreversible, or ambiguous** step (merging, a destructive migration, "which of these?", "ok to proceed?"), don't guess and don't silently stop — **ask Hleb on his phone and block for the answer**. It blocks until he taps an option OR types a reply, prints the answer to stdout, and exits `0` (resolved, incl. an `--on-timeout` policy) or `2` (expired, no answer).

**Pick by situation — exact command, no thinking:**

| Situation | Command |
|---|---|
| Choose among options (he can also type his own) | `ask.ts "Which DB?" --options "Postgres,MySQL,SQLite" --asker me` |
| Yes/no-ish clarification (Accept / Decline + type-your-own) | `ask.ts "Proceed with the refactor?" --confirm --asker me` |
| Need free-form text | `ask.ts "Any constraints before I start?" --text --asker me` |

```bash
pnpm exec tsx apps/bot/scripts/ask.ts "<question>" <mode> [--summary "context"] [--asker "<you>"] [--on-timeout Reject] [--ttl 3600]
```

**Defaults that mean you don't configure anything:** every option/`--confirm` ask **automatically includes a "✍️ Other (type a reply)" button** (he can always answer in free text) — add `--no-custom` only to force a strict pick. `--confirm` labels default to Approve/Reject; override with `--accept "Ship" --reject "Hold"`. `--on-timeout <value>` makes the answer definitive even if he never replies. Captured stdout is the chosen option or his typed text.

From code: `@workspace/notify` → `ask({question,options,allowCustom})` / `askConfirm(q,{accept,reject})` / `askText(q)`. One-way "done / blocked" pings (no answer needed): `notify()` / `alert()` or `apps/bot/scripts/manual-task.ts`.

**Getting the answer — the answer WAKES you, don't poll.** A non-resident agent (whose turn ends) must NOT rely on polling/self-wakeups to catch the reply — pass a trigger and exit; the bot fires it the instant Hleb answers:
- `resumeWorkflow: "<file>.yml"` — the bot dispatches that GitHub workflow with inputs `ask_id`, `decision`, `text`. Reliable, runs on GitHub's infra, triggered by the answer. **Preferred for this repo.**
- `callbackUrl` (+ `callbackToken`) — the bot POSTs `{id,kind,decision,text,asker}` there on resolve. For a service agent with an endpoint.
- Only a resident process that stays alive should use `waitForAnswer(id)` (a poll loop) or the `ask.ts` CLI (it blocks). `GET /answer/:id` remains a durable fallback floor — the answer is always persisted.

Full reference + the four resolution paths: [`docs/runbooks/AGENT-HITL.md`](docs/runbooks/AGENT-HITL.md). Needs `INGEST_SECRET` (env `NOTIFY_SHARED_SECRET`, or `apps/bot/.dev.vars` locally, materialized via `scripts/bot-dev-vars.sh`).

## Conductor Cloud GitHub Access

In a Conductor **cloud** workspace (Vercel Sandbox) the Conductor GitHub app
brokers `git` — clone / push / PR through `git` work. The interactive `gh` CLI is
a separate context and may print `auth broker has no GitHub token for this
context (context: terminal)` and run unauthenticated. This is expected, not a
break.

- Use `git` (push, fetch) and the normal PR flow for GitHub work in a cloud
  workspace. `git push` is authorized via the broker.
- Do NOT run `gh auth login` in a cloud workspace or loop on `gh auth status` —
  the terminal `gh` cannot be authenticated interactively there; fall back to
  `git`.
- Locally, `gh` uses your machine keyring as usual — no change.

Full model + snapshot script: `docs/runbooks/CONDUCTOR.md`.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **UI package** (`packages/ui`): shadcn/ui components + imported components, consumed source-first (no build step)
- **Component registry** (`packages/ui/src/lib/registry.ts`): metadata for all components (source, upstream URL, categories, deps)
- **Web app** (`apps/web`): Next.js 16 with Turbopack
- **Shared configs**: `packages/eslint-config` (flat config), `packages/typescript-config`

## CodeGraph

CodeGraph is enabled for this repo through `.mcp.json` and the root dev dependency `@colbymchenry/codegraph`. It stores a local, ignored `.codegraph/` SQLite index per checkout/worktree. Do not commit `.codegraph/`.

At the start of a coding session, run one command:

```bash
pnpm codegraph:ready
```

`codegraph:ready` creates `.codegraph/` if missing, syncs changed files, and prints status. Conductor workspace setup also runs it through `.conductor/settings.toml`, but agents should run it again after rebases, branch switches, pulls, or external edits.

Use CodeGraph before grep/read loops for structural questions: where a symbol lives, how a flow reaches another layer, callers/callees, route-to-handler paths, impact analysis, and affected tests. For MCP-enabled agents, prefer the CodeGraph MCP tool; for non-MCP contexts use `pnpm exec codegraph explore "<question>"`, `pnpm exec codegraph query <symbol>`, `pnpm exec codegraph impact <symbol>`, or `codegraph affected`.

If CodeGraph reports stale files, read those specific files directly before editing. Full rebuilds (`pnpm codegraph:init` or `pnpm exec codegraph index --force .`) are only for missing/corrupt indexes.

Full procedure: [`docs/runbooks/CODEGRAPH.md`](docs/runbooks/CODEGRAPH.md).

## Component Pattern

Every component lives in `packages/ui/src/components/{name}/` with 4 files:

```
{name}.tsx          # component implementation
index.ts            # re-exports (export * from "./{name}")
{name}.stories.tsx  # Storybook CSF story
{name}.test.tsx     # Vitest + React Testing Library test
```

## Import Rules

- Components: `import { Button } from "@workspace/ui/components/button"`
- Utilities: `import { cn } from "@workspace/ui/lib/utils"`
- Hooks: `import { useIsMobile } from "@workspace/ui/hooks/use-mobile"`
- Brand surface: `import { Logo, BrandName, BRAND_SUPPORT_EMAIL } from "@workspace/ui/brand-assets"` (+ `getBrandText` from `@workspace/ui/brand-assets/server`)
- Never use `@/components/ui/` (wrong path for monorepo)

## Releases

Versions follow `v<MAJOR>.<MINOR>.<PATCH>` (e.g. `v0.2.0`) for stable releases and `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` (e.g. `v0.2.1-rc.1`) for release candidates. Tagging is manual and gated to Hleb until v1. Full conventions, bump rules, and the cut workflow live in [`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md).

The current build version is surfaced at runtime via the `BUILD_VERSION` env (injected by the Docker image build), readable through `getBuildVersion()` / `<BuildVersion />` from `@workspace/ui/brand-assets`. It shows in the footer of every auth/onboarding page so the deployed version is always visible.

## Brand Assets

The Afframe brand surface — logo SVGs, product name, tagline, legal info, support emails, marketing URLs, social handles — lives in **`packages/ui/src/brand-assets/`** as the single source of truth. Read `packages/ui/src/brand-assets/README.md` for the full reference.

Three layers, one home:

| Layer | Lives in | What it gives you |
|-------|----------|-------------------|
| `<Logo>` SVG component | `packages/ui/src/brand-assets/logo.tsx` | 4 variants × 9 tones, callable from anywhere |
| `<BrandName>`, `<BrandTagline>`, ... + `getBrandText()` | `packages/ui/src/brand-assets/text.tsx` + `text-server.ts` | i18n-localized brand strings — values in `packages/i18n/src/messages/<locale>.json` under `brand.*` |
| `BRAND_SUPPORT_EMAIL`, `BRAND_MARKETING_URL`, ... | `packages/ui/src/brand-assets/constants.ts` | Non-localized identifiers (emails, URLs, phones, socials) |

Brand color hex values live in **`packages/ui/src/styles/globals.css`** as `--brand-primary-light/dark`, `--brand-admin-light/dark`, `--brand-mono-light/dark`. Tailwind exposes them as utility classes (`text-brand-primary-light`, etc.).

Favicon files live per-app in `apps/<app>/app/` (Next file conventions) + `apps/<app>/public/` (manifest icons), regenerated from the color tokens via `python3 scripts/build-favicons.py`.

When a brand value isn't decided yet, the slot ships with an explicit `<BRAND-...>` placeholder. Staging deploys allow placeholders; production deploys block on any remaining one. Run `pnpm check:brand-placeholders` locally, or trust the deploy workflow's `CHECK_BRAND_STRICT=true` step on production.

Never hardcode product name, brand color, support email, or any brand URL outside this surface. Never re-introduce `WalletMinimal` or any other Lucide icon as a brand-mark placeholder. Never duplicate brand strings in app code — always go through `<Brand*>` components, `getBrandText()`, or `BRAND_*` constants.

## Before Importing a Component

READ the source file first. Never guess exports. The export list is at the bottom of each component file.

## Verification After Changes

1. `pnpm typecheck` must pass
2. `pnpm test` must pass
3. `pnpm build` must pass
4. For UI changes: start dev server and check visually

## Runbooks

Agent-specific runbooks live in `docs/runbooks/`:

- `CONDUCTOR.md`: how Conductor workspaces are wired — committed `.conductor/settings.toml` + `scripts/conductor/*` as the source of truth, full per-workspace isolation (own `$CONDUCTOR_PORT` range + own seeded `ws_p<port>` Postgres database, shared demo login `owner@example.com`), the setup/archive/run scripts, and cloud-workspace GitHub + secrets setup
- `APP-SHELL-PANELS.md`: how the persistent org app-shell + structure-driven nav + content panels fit together, and the recipes for adding a page / module / tabs. Its companion `docs/specs/CONTENT-ARCHETYPES.md` is the five-archetype catalog (Table / Blank / Launchpad / Dashboard / Single) — data contracts, layouts, and a "pick one and build a page" recipe, with the four dev-only `/demo-*` routes as living examples
- `CODEGRAPH.md`: how the repo-local CodeGraph MCP/index setup works, how to initialize/sync per Conductor worktree, and when agents should use it before grep/read exploration
- `DB-ACCESS.md`: operator DB access — `scripts/db-query.sh` (fast ~2s reads via ECS Exec) vs the EC2 bastion (`staging-bastion-migrate.sh`) for raw write SQL
- `BRAIN-OPERATOR-SESSION.md`: how Hleb starts a live Brain session and pushes a real org's docs through the HELD write loop — issue the `actor_kind='agent'` key, the exact env vars (`mlive.example.sh` template), the `brain extract` → `brain book` command sequence, and the `/{orgSlug}/accounting/approvals` review gate
- `SHOWCASE.md`: instructions for adding component demos to the showcase page
- `COMPONENT-MIGRATION.md`: workflow for adding non-shadcn components from external registries

## Dependency Update Coverage Rule

Every versioned dependency merged to main MUST have automated update tracking:

1. **Dependabot covers it?** (npm packages, GitHub Actions, Docker) → nothing to do, already tracked via `.github/dependabot.yml`
2. **Dependabot can't cover it?** (source-copied code, non-registry binaries, internal version pins) → create a custom update-check workflow using `.github/workflows/_template-update-check.yml.example`

Before adding a new versioned dependency, verify which category it falls into. If category 2, the PR must include the update-check workflow.

Current custom checks:

- `shadcn-check.yml` — shadcn/ui source-copied components
- `openfga-version-check.yml` — OpenFGA + pgbouncer + cloudflared pinned image versions
- `tool-versions-check.yml` — monthly: pnpm `packageManager` pin, CI tool binaries (gitleaks, infisical, trufflehog, actionlint, fga, cerbos, squawk), e2e postgres digest pin

## Code Standards

- TypeScript 6+ (always latest)
- No unnecessary comments
- No premature abstractions
- Validate at system boundaries only
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Route handler / middleware redirects MUST build base URLs via `publicOrigin(request)` from `apps/web/lib/request-origin.ts` — never `request.url`. Behind Cloudflare Tunnel `request.url` is the container listener (`0.0.0.0:3000`) and emits `Location: https://0.0.0.0:3000/...`. See ADR-0008 "Amendment 2026-05-17 — redirect base URLs".

## Linting

- `pnpm lint` runs ESLint per package. The shared config (`packages/eslint-config/base.js`) is mostly syntactic, with one scoped type-aware override: `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises`, both `error`.
- These two rules use `projectService` — ESLint must build the TypeScript project graph to evaluate them, so every linted package needs a parseable `tsconfig.json` whose `include` covers the source being linted. Files outside any tsconfig (`*.config.ts`, `.storybook/**`, `tests/` helpers, `*.d.ts`) are excluded from the override; test/spec/stories/scripts/migrations are excluded too.
- Fire-and-forget promises: prefix with the `void` operator. Async React handlers passed to a `() => void` prop: wrap inline (`onClick={() => void handler()}`, `onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}`).
- The type-checked override is gated OFF under lefthook (the `LEFTHOOK` env var). The pre-commit ESLint hook stays fast and syntactic; the full type-aware rules run only in CI's `pnpm lint`.

## Domain Rules

- All amounts in CZK by default. Stored as `numeric(19, 4)` in Postgres and `bigint` minor units in TypeScript via `Money<Currency>`. Never use native `number` for money fields.
- Cross-currency conversion uses `FxRate<From, To>`. Call `FxRate.convert(money)` only. Never query rate tables directly; never auto-invert; never substitute a neighbor date.
- AI tool input schemas must NOT declare `organization_id`, `user_id`, `workspace_id`, or `role`. Server-side injection is the only path.
- PostgreSQL 18 uses snake_case for tables and columns. No abbreviated prefixes (`acc_`, `inv_`); full words only (`account_`, `invoice_`).
- Multi-tenant isolation via FORCE RLS. Every tenant-scoped table has `organization_id` + pgPolicy using `current_setting('app.organization_id')`.
- Test-only HTTP endpoints must gate on `NODE_ENV !== 'production'` + explicit env flag check.

## Multi-tenant Isolation

Three tiers (see `ARCHITECTURE.md` for full detail):

1. **Global**: identity, permissions (no scoping)
2. **Workspace**: accountant's office (GUC `app.workspace_id`)
3. **Organization**: client book (GUC `app.organization_id`)

All reads/writes go through `withWorkspace`, `withOrganization`, or `withAdminBypass`.

## Testing

- Framework: Vitest + jsdom + @testing-library/react
- Config: `packages/ui/vitest.config.ts`
- Setup file mocks: ResizeObserver, IntersectionObserver, matchMedia, scrollIntoView, hasPointerCapture
- Run: `pnpm test` (all) or `pnpm --filter @workspace/ui test:watch` (watch mode)

### Vitest runners per package

| Package / App | Config | Environment | Covers |
|---|---|---|---|
| `packages/ui` | `packages/ui/vitest.config.ts` | jsdom | React components, hooks, utils |
| `packages/auth` | `packages/auth/vitest.config.ts` | node | JWT sign/verify, token helpers |
| `packages/shared` | `packages/shared/vitest.config.ts` | node | `PasswordSchema` boundary rules |
| `packages/email` | `packages/email/vitest.config.ts` | node | `pickTransport()` selection logic |
| `apps/web` | `apps/web/vitest.config.ts` | node | Server-side DB integration tests |
| `apps/api` | `apps/api/vitest.config.ts` | node | NestJS controllers, guards, filters |
| `apps/admin` | `apps/admin/vitest.config.ts` | node | Admin app allowlist, server logic |

Run a single package/app: `pnpm --filter @workspace/shared test` / `pnpm --filter web test`.

### apps/web integration test runner (AFF-119)

- Config: `apps/web/vitest.config.ts` (node environment, globalSetup boots Postgres 18 testcontainer)
- Test files: co-located alongside source under `apps/web/app/**/*.test.ts`
- Global setup: `apps/web/tests/global-setup.ts` — mirrors `packages/db/tests/global-setup.ts`
- `server-only` alias: the vitest config maps `server-only` to its `empty.js` stub so server-component
  modules (which begin with `import "server-only"`) import cleanly in the Node test runner.
- All db/auth module imports inside test files are dynamic (`await import(...)`) to ensure
  `DATABASE_URL` is set by globalSetup before the singletons bind.
- Run: `pnpm --filter web test` or `pnpm --filter web test:watch`
- Covered (AFF-119 / E7b):
  - `app/auth/_lib/materialize-invite.ts` — `materializeInvite` happy path, idempotent
    workspace_membership, already-accepted conflict, expiry, unknown token, email-mismatch
    defense, workspace cross-check (F7)
  - `app/[orgSlug]/resolve-membership.test.ts` — DB membership resolution query (mirrors the
    private `resolveMembership` in layout.tsx), slug regex validation, reserved-slug list
  - `app/onboarding/actions.test.ts` — `slugify` contract, `pickUniqueSlug` collision resolution,
    workspace creation DB sequence

### apps/api test runner

- Framework: Vitest (node environment) + `@nestjs/testing` + supertest
- Config: `apps/api/vitest.config.ts` — includes `src/**/*.test.ts`, `reflect-metadata` setup file
- Run: `pnpm --filter api test` or `pnpm --filter api test:watch`
- Test files live alongside source (`src/**/*.test.ts`): `HealthController` smoke test, `ApiKeyGuard`, `ApiKeyThrottlerGuard` (+ `resolveThrottleKey` unit), `DomainExceptionFilter`. Each boots a minimal Nest testing module via `@nestjs/testing` + supertest.

### Integration + E2E databases

- DB integration tests and the web E2E suite both boot a disposable Postgres 18
  testcontainer via `@workspace/testcontainers` `bootPostgres18()` — one shared
  helper, no forked `docker-compose.test.yml`, so migrations + role bootstrap
  stay single-source.
- Loginable-user seed: `seedWorkspaceWithOwner()` in `packages/db/tests/fixtures.ts`
  seeds a genuine Better Auth credential (driven through `auth.api.signUpEmail`,
  not a hand-hashed password) plus the workspace + organization + owner
  memberships. It takes an injected `signUp` callback so `@workspace/db` never
  imports `@workspace/auth` (that would invert the dependency). The canonical
  callback is `betterAuthSignUp` from `@workspace/auth/test-support`.
- Web E2E: `apps/web/playwright.config.ts` boots + seeds via `e2e/db-setup.ts`
  at config-evaluation time and passes the ephemeral DB URLs into
  `webServer.env`. `e2e/global-teardown.ts` stops the container. The seeded
  owner's credentials are written to `e2e/.auth/seed.json` (gitignored) for
  specs to consume.
- CI: `.github/workflows/e2e.yml` runs the testcontainer in-job (no service
  container); its `DATABASE_URL` / `DATABASE_DIRECT_URL` env values are
  build-time placeholders that `db-setup.ts` overrides at runtime.

## Storybook

- Framework: Storybook 10 + Vite
- Config: `packages/ui/.storybook/`
- Run: `pnpm --filter @workspace/ui storybook`
- Stories use CSF format with Meta + StoryObj pattern
- Sidebar sorted alphabetically via `storySort` in preview.ts

## Story Coverage Rules

Every component story file MUST cover:

1. All CVA variants (one story per non-default variant value)
2. All sizes (one story per non-default size value)
3. Disabled state (if component accepts `disabled` prop)
4. All prop unions that map to visual changes (e.g., `animation`, `orientation`, `side`)

Audit coverage: `pnpm --filter @workspace/ui audit:stories`
Auto-generate missing baseline stories: `pnpm --filter @workspace/ui audit:stories:fix`

Generated stories use simple `args` format. For compound components (Dialog, Accordion, etc.) where variants live on sub-components, write render functions manually.

## Component Design Rules

Every component MUST:

1. Use CSS custom property tokens (`var(--background)`, `var(--primary)`, etc.), never hardcoded colors
2. Compose with existing primitives (e.g., use our Button, not raw `<button>`)
3. Support dark mode via `.dark` class and token system
4. Support future themes via token overrides
5. Be registered in `packages/ui/src/lib/registry.ts`

When importing from upstream, rewrite anything that violates these rules. The upstream is a reference for WHAT the component does, not HOW it should be implemented.

**App-chrome-level blocks** (anything that draws the outer layout shell — e.g. `blocks/app-shell`) use the **shell token family** declared in `globals.css` instead of the global shadcn tokens: `--canvas` (page bg), `--shell-surface` (card bg — deliberately diverges from `--card` in dark mode), `--border-subtle` (outlines + separators), plus the dimension tokens `--shell-rail-width`, `--shell-header-height`, `--shell-bottom-inset`, `--shell-right-inset`, `--shell-handle-width`. In-flow surfaces (dialogs, dropdowns, cards inside the body) keep using the standard shadcn tokens (`bg-card`, etc.) — the separation is intentional.

## CI / CD

- Required checks (14 contexts in `.github/rulesets/main.json`): `ci`, `gitleaks`, `lint` (commitlint), `Analyze (javascript-typescript)` (CodeQL), `review` (dependency-review), `scan-pr / osv-scan` (osv-scanner), `knip`, `check` (repo governance: paired-files + changelog Unreleased), `boundaries`, `conv-title`, `size-cap`, `shellcheck`, `cdk-synth-strict (staging)`, `cdk-synth-strict (production)`. A failure in any of these blocks merge. The full required/advisory matrix lives in `docs/conventions/CI-POLICY.md`, treat that file as the single source of truth.
- Advisory (run but don't block): `workflow-lint`, `size-limit`, `container-scan`, `_supply-chain` (called from release), `e2e` (Playwright auth-flow E2E), `openapi-lint` (OpenAPI spec drift + Spectral lint), `sdk-drift`, `mcp-coverage`, `pr-checklist`, `db-schema-drift`, `db-migration-idempotency`, `nuclei-dast` (nightly DAST scan of live prod + staging hosts; probe-skips any host that is down/maintenance/parked, active-but-safe profile, SARIF → Security tab — see `docs/runbooks/DAST-NUCLEI.md`).
- All new workflows ship as ADVISORY. Hleb flips required-status manually after a green PR cycle.
- Branch protection / PR-required rules are managed manually by Hleb via the ruleset (see `docs/conventions/CI-POLICY.md`).
- Hardening conventions: default-deny `permissions: {}`, per-job least privilege, SHA-pinned actions with trailing version comment, `step-security/harden-runner` (audit), concurrency cancellation on PRs.
- Reusable workflows under `.github/workflows/_*.yml`: `_supply-chain.yml`, `_build-image.yml`, `_deploy-aws.yml` (the `guard` job requires `vars.AWS_BOOTSTRAPPED=true`, now set — staging deploys run; production stays gated by the `production` GitHub environment).
- Composite bootstrap: `./.github/actions/setup` (pnpm + Node 24 + frozen install).

## Changelog Requirement

Every non-release PR MUST add one bullet under `CHANGELOG.md` `## [Unreleased]` before the PR is opened. This includes docs, dependencies, CI, infra, and internal changes. Use `pnpm changelog:add -- --category Changed --entry "..."` so existing entries are preserved. Do not rewrite, reorder, or remove another Unreleased entry in a normal PR. Release PRs titled `chore(release): vX.Y.Z` or `chore(release): vX.Y.Z-rc.N` are the only exception: they move Unreleased entries into the new version section instead of adding a new bullet. Dependabot PRs are a second exception, gated by author (`dependabot[bot]`) rather than by title: the changelog gate is skipped on those PRs, and the resulting dependency bumps are recorded at release-cut as a synthesized `### Dependencies` bullet (and `### Security` for CVE-flagged bumps) instead of a per-PR entry.

## Infrastructure

- Single-account AWS CDK v2 (`infra/cdk/`), single region eu-central-1. Stacks: network, data, app, security, observability, backup. See ADR-0007.
- AWS account is connected; bootstrap completed 2026-05-11 (`vars.AWS_BOOTSTRAPPED=true`). Account ID, role ARNs, and secret values live in GitHub Actions repo/environment secrets, never committed — the `<TBD>` markers in docs are deliberate public-repo placeholders. Bootstrap procedure: `docs/runbooks/AWS-SETUP.md`.
- Public host classes (Cloudflare Tunnel → Fargate task, one task per env, 7 containers):

  | Class | Production | Staging |
  |---|---|---|
  | Web | `app.afframe.com` | `app-staging.afframe.com` |
  | Public API | `api.afframe.com` | `api-staging.afframe.com` |
  | Admin | `admin.afframe.com` | `admin-staging.afframe.com` |

  Status page (`status.afframe.com`) runs off AWS on the OVH VPS. Full inventory of every host + email address is at [`docs/DOMAINS-AND-EMAIL.md`](docs/DOMAINS-AND-EMAIL.md). Admin is its own per-env variable `ADMIN_DOMAIN`, not a subdomain of `APP_DOMAIN`.
- See `docs/adr/` for the architectural decisions backing this layout.
- `infra/openstatus/` (the `status.afframe.com` status page) is **not AWS**: it runs OpenStatus self-hosted on the OVH VPS and is never deployed by CDK / `make deploy-cdk` / `_deploy-aws.yml`. It lives in the monorepo as monitors-as-code only. See [ADR-0019](docs/adr/0019-status-page-and-uptime-monitoring.md) and `docs/runbooks/STATUS-PAGE.md`.

### Budgets & Cost-Runaway Protection

- AWS Budgets Actions can DETACH IAM policies or stop services. Never deploy Budget changes without `cdk diff` review. A misconfigured Budget action can lock the operator out of the account.
- Cost-runaway alarms + Lambda kill-switch live in `infra/cdk/lib/observability-stack.ts` + `infra/cdk/lib/security-stack.ts`. See [ADR 0016](docs/adr/0016-cost-runaway-protection.md) and [docs/runbooks/COST-INCIDENT.md](docs/runbooks/COST-INCIDENT.md).
- After first deploy: confirm SNS email subscription via the AWS confirmation link or alerts arrive silently.

## Telegram Dev Control Plane

The dev alert + control hub lives in-monorepo as two parts:

- **`apps/bot`** (`@workspace/bot`) — grammY on a Cloudflare Worker, the **single choke point for all Telegram I/O**. Separate failure domain from AWS (if `api` dies the bot still runs). Outbound `/ingest`, `/issue`, `/ask`, `/beat`; inbound `/sns` (AWS) and `/webhook` (your commands + button taps). Inbound commands are allowlisted to one Telegram user id: reads (`/status`, `/ci`, `/deploys`, …) plus confirm-gated writes (`/deploy`, `/rollback`, `/deploybot`, `/dast`) that fire a GitHub `workflow_dispatch` — the bot never execs on a server.
- **`packages/notify`** (`@workspace/notify`) — thin typed client + shared message contract. **Holds no token and formats no Telegram messages**; senders (app, CI, AWS SNS, agents) POST the typed `IngestPayload` to the bot's `/ingest`.

Rule: never format a Telegram message or hold the bot token anywhere but `apps/bot`. Everything that wants to notify goes through `@workspace/notify`. Write-command dispatch needs the `BOT_GH_DISPATCH_TOKEN` repo secret (GitHub forbids the `GITHUB_` prefix); unset → bot stays read-only.

## Documentation Layout

- `docs/adr/` — Architecture Decision Records (MADR format)
- `docs/api/` — API architecture guide + OpenAPI specs
- `docs/compliance/` — control mappings and audit evidence indexes
- `docs/conventions/` — commit + CI conventions
- `docs/plans/` — strategic execution plans
- `docs/runbooks/` — operational runbooks
- `docs/specs/` — design specifications
- `docs/brain/` — cross-package Brain overview and technical architecture
- `docs/DOMAINS-AND-EMAIL.md` — public host and email registry
- `docs/ENVIRONMENT-VARIABLES.md` — environment-variable registry
- `docs/compliance/ICT-ASSET-INVENTORY.md` — DORA Article 8 ICT asset register
- `docs/brain/README.md` — Afframe Brain landing doc; `docs/brain/TECHNICAL.md` contains internals, and GitHub epic #524 owns delivery status

## Endpoint Addition Rules

Every public API endpoint flows through the same six steps. CI gates
(`openapi-lint`, `sdk-drift`, `mcp-coverage`, `pr-checklist`) catch
deviations; the pre-push `endpoint-checklist` lefthook hook catches the
most common one (registry edited, codegen not regenerated).

1. **Author the Zod schema** in `packages/shared/src/api/<resource>.ts`.
   Chain `.openapi({ description, example })` on every public field.
2. **Register the operation** via `registry.registerPath({ ... })` in
   `packages/shared/src/api/registry.ts`. Reference the schema by name.
   Spread `ERROR_RESPONSE_REFS` into the `responses` map.
3. **Implement the controller** under `apps/api/src/v1/<resource>/`,
   mounted on `V1Module`. Read principal from the API key guard; never
   accept `organization_id` / `user_id` / `workspace_id` / `role` as input.
4. **Run `pnpm gen:all`** from the repo root. Commit the regenerated
   `apps/api/openapi/v1.json`, `packages/sdk/src/generated/`, and
   `apps/mcp/src/tools/generated/`.
5. **Write an E2E test** with tenant isolation. Co-locate under
   `apps/api/src/**/*.test.ts` (NestJS testing module) or
   `apps/web/e2e/` (Playwright auth-bound flow).
6. **`pnpm verify` green** locally (typecheck + lint + test +
   boundaries + openapi-lint).

SDK versioning/publishing (changesets + npm publish) is not wired yet —
tracked as future work; do not add `.changeset/` entries.

Full procedure with diffs: `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`.
Convention reference: `docs/conventions/ENDPOINT-ADDITION.md`.
Canonical fresh-session entry: `README.md`. Documentation navigation:
`docs/README.md`.

The `/add-endpoint <resource>` Claude skill at `.claude/skills/add-endpoint/`
walks a contributor through the steps with the exact paths and refuses
hand-edits of files under any `generated/` directory.
