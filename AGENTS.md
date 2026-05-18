# Agent Instructions

Instructions for AI agents (Claude Code, Codex, Cursor) working in this monorepo.

## Issue Tracking

Issues and planning live in **Linear** — team Afframe (key `AFF`). Agents reach it through the `linear` MCP server (`mcp__linear__*` tools): list, search, read, create, and update issues in-session. Conductor can also open a workspace directly from a Linear issue. When work spans sessions, the Linear issue is the source of truth — read it before starting, update it as you go. Current branch-recovery and merge work is grouped under the Linear **Cleanup** project.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **UI package** (`packages/ui`): shadcn/ui components + imported components, consumed source-first (no build step)
- **Component registry** (`packages/ui/src/lib/registry.ts`): metadata for all components (source, upstream URL, categories, deps)
- **Web app** (`apps/web`): Next.js 16 with Turbopack
- **Shared configs**: `packages/eslint-config` (flat config), `packages/typescript-config`

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
- Never use `@/components/ui/` (wrong path for monorepo)

## Before Importing a Component

READ the source file first. Never guess exports. The export list is at the bottom of each component file.

## Verification After Changes

1. `pnpm typecheck` must pass
2. `pnpm test` must pass
3. `pnpm build` must pass
4. For UI changes: start dev server and check visually

## Runbooks

Agent-specific runbooks live in `docs/runbooks/`:

- `SHOWCASE-RUNBOOK.md`: instructions for adding component demos to the showcase page
- `COMPONENT-MIGRATION-RUNBOOK.md`: workflow for adding non-shadcn components from external registries

## Dependency Update Coverage Rule

Every versioned dependency merged to main MUST have automated update tracking:

1. **Dependabot covers it?** (npm packages, GitHub Actions, Docker) → nothing to do, already tracked via `.github/dependabot.yml`
2. **Dependabot can't cover it?** (source-copied code, non-registry binaries, internal version pins) → create a custom update-check workflow using `.github/workflows/_template-update-check.yml.example`

Before adding a new versioned dependency, verify which category it falls into. If category 2, the PR must include the update-check workflow.

Current custom checks:

- `shadcn-check.yml` — shadcn/ui source-copied components
- `openfga-version-check.yml` — OpenFGA + pgbouncer pinned image versions

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
- AI tool input schemas must NOT declare `organization_id`, `user_id`, or `role`. Server-side injection is the only path.
- PostgreSQL 18 uses snake*case for tables and columns. No abbreviated prefixes (`acc*`, `inv*`); full words only (`account*`, `invoice\_`).
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

## CI / CD

- Existing required checks: `ci`, `gitleaks` (advisory). New advisory checks added: `workflow-lint`, `codeql`, `dependency-review`, `commitlint`, `size-limit`, `osv-scanner`, `container-scan`, `_supply-chain` (called from release), `e2e` (Playwright auth-flow E2E), `openapi-lint` (OpenAPI spec drift + Spectral lint).
- All new workflows ship as ADVISORY. Hleb flips required-status manually after a green PR cycle.
- Branch protection / PR-required rules are managed manually by Hleb (see `docs/conventions/CI-POLICY.md`).
- Hardening conventions: default-deny `permissions: {}`, per-job least privilege, SHA-pinned actions with trailing version comment, `step-security/harden-runner` (audit), concurrency cancellation on PRs.
- Reusable workflows under `.github/workflows/_*.yml`: `_supply-chain.yml`, `_build-image.yml`, `_deploy-aws.yml` (the `guard` job requires `vars.AWS_BOOTSTRAPPED=true`, now set — staging deploys run; production stays gated by the `production` GitHub environment).
- Composite bootstrap: `./.github/actions/setup` (pnpm + Node 24 + frozen install).

## Infrastructure

- Single-account AWS CDK v2 (`infra/cdk/`), single region eu-central-1. Stacks: network, data, app, security, observability, backup. See ADR-0007.
- AWS account is connected; bootstrap completed 2026-05-11 (`vars.AWS_BOOTSTRAPPED=true`). Account ID, role ARNs, and secret values live in GitHub Actions repo/environment secrets, never committed — the `<TBD>` markers in docs are deliberate public-repo placeholders. Bootstrap procedure: `docs/runbooks/AWS-DEPLOY.md`.
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
- Cost-runaway alarms + Lambda kill-switch live in `infra/cdk/lib/observability-stack.ts` + `infra/cdk/lib/security-stack.ts`. See [ADR 0016](docs/adr/0016-cost-runaway-protection.md) and [docs/runbooks/COST-INCIDENT-RESPONSE.md](docs/runbooks/COST-INCIDENT-RESPONSE.md).
- After first deploy: confirm SNS email subscription via the AWS confirmation link or alerts arrive silently.

## Documentation Layout

- `docs/adr/` — Architecture Decision Records (MADR format)
- `docs/api/` — API architecture guide + OpenAPI specs
- `docs/conventions/` — commit + CI conventions
- `docs/plans/` — strategic execution plans
- `docs/runbooks/` — operational runbooks
- `docs/specs/` — design specifications
- `docs/INVENTORY.md` — DORA Article 8 ICT asset register
