# Agent Instructions

Instructions for AI agents (Claude Code, Codex, Cursor) working in this monorepo.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **UI package** (`packages/ui`): 55 shadcn/ui components, consumed source-first (no build step)
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
2. `pnpm test` must pass (144 tests)
3. `pnpm build` must pass
4. For UI changes: start dev server and check visually

## Runbooks

Agent-specific runbooks live in `docs/runbooks/`:
- `SHOWCASE-RUNBOOK.md`: instructions for adding component demos to the showcase page

## Dependency Update Coverage Rule

Every versioned dependency merged to main MUST have automated update tracking:

1. **Dependabot covers it?** (npm packages, GitHub Actions, Docker) → nothing to do, already tracked via `.github/dependabot.yml`
2. **Dependabot can't cover it?** (source-copied code, non-registry binaries, internal version pins) → create a custom update-check workflow using `.github/workflows/_template-update-check.yml.example`

Before adding a new versioned dependency, verify which category it falls into. If category 2, the PR must include the update-check workflow.

Current custom checks:
- `shadcn-check.yml` — shadcn/ui source-copied components

## Code Standards

- TypeScript 6+ (always latest)
- No unnecessary comments
- No premature abstractions
- Validate at system boundaries only
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

## Testing

- Framework: Vitest + jsdom + @testing-library/react
- Config: `packages/ui/vitest.config.ts`
- Setup file mocks: ResizeObserver, IntersectionObserver, matchMedia, scrollIntoView, hasPointerCapture
- Run: `pnpm test` (all) or `pnpm --filter @workspace/ui test:watch` (watch mode)

## Storybook

- Framework: Storybook 10 + Vite
- Config: `packages/ui/.storybook/`
- Run: `pnpm --filter @workspace/ui storybook`
- Stories use CSF format with Meta + StoryObj pattern

## CI / CD

- Existing required checks: `ci`, `gitleaks` (advisory). New advisory checks added: `workflow-lint`, `codeql`, `dependency-review`, `commitlint`, `size-limit`, `osv-scanner`, `container-scan`, `_supply-chain` (called from release).
- All new workflows ship as ADVISORY. Hleb flips required-status manually after a green PR cycle.
- Branch protection / PR-required rules are managed manually by Hleb (see `docs/conventions/CI-POLICY.md`).
- Hardening conventions: default-deny `permissions: {}`, per-job least privilege, SHA-pinned actions with trailing version comment, `step-security/harden-runner` (audit), concurrency cancellation on PRs.
- Reusable workflows under `.github/workflows/_*.yml`: `_supply-chain.yml`, `_build-image.yml`, `_deploy-aws.yml` (AWS deploy is GUARDED — short-circuits until `vars.AWS_BOOTSTRAPPED=true`).
- Composite bootstrap: `./.github/actions/setup` (pnpm + Node 24 + frozen install).

## Infrastructure

- Hybrid IaC: `infra/tofu/` (OpenTofu) for platform layer (Org, OUs, SCPs, Identity Center, log archive, network); `infra/cdk/` (AWS CDK v2) for app stacks (network, data, app, observability).
- All AWS-specific values are `<TBD>` placeholders today. AWS account is NOT yet connected. Bootstrap procedure: `docs/runbooks/AWS-BOOTSTRAP.md`.
- See `docs/adr/` for the 6 architectural decisions backing this layout.

## Documentation Layout

- `docs/adr/` — Architecture Decision Records (MADR format)
- `docs/api/` — OpenAPI/Zod schemas (placeholder)
- `docs/conventions/` — commit + CI conventions
- `docs/plans/` — strategic execution plans
- `docs/runbooks/` — operational runbooks
- `docs/specs/` — design specifications
- `docs/INVENTORY.md` — DORA Article 8 ICT asset register
