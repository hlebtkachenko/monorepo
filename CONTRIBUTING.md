# Contributing

This is a closed-beta product. External contributions are not accepted yet. This document exists for the core team and any human or AI agent doing planned work in the repo.

## Hard Rules (project-wide)

These rules are enforced by ESLint, Git hooks, and reviewer judgement. See the full list in `AGENTS.md`.

1. English only in files, code, comments, directory names, and documentation. Czech only appears in UI strings, legal output formats, and Czech accounting terminology with no clean English equivalent.
2. No em-dash (U+2014) anywhere. Use comma, colon, or parentheses.
3. Never permanently delete files. Move to `_junk/`.
4. Never display or log secrets. `.env*`, `*.key`, `*.enc` are gitignored.
5. TypeScript 6.0+ across every package.
6. PostgreSQL 18, snake_case for tables and columns, full words only (`account_`, `invoice_`, never `acc_`, `inv_`).
7. All amounts in CZK by default. Stored as `numeric(19, 4)` in Postgres and `bigint` minor units in TypeScript via `Money<Currency>`. Never use native `number` for money.
8. AI tool input schemas must NOT declare `organization_id` / `user_id` / `role`. Server-side injection is the only path.

## Branching and Commits

- Branch naming: `<author>/<short-topic>` (e.g. `hlebtkachenko/q9-resume`).
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `style:`, `revert:`.
- Never use `--no-verify` unless explicitly requested by the owner.
- Never amend a published commit; create a new one.

## Testing

- Unit + integration: Vitest 4.x. `pnpm test` for full run.
- Storybook: `pnpm --filter @workspace/ui storybook` (dev), `pnpm --filter @workspace/ui build-storybook` (CI).
- E2E: Playwright (config TBA when backend ships).

Tests are mandatory for non-trivial work. Mock the database only when documented; default is real Postgres via testcontainers.

## Pre-merge Gates

Before opening a PR:

1. `pnpm typecheck` green across all packages.
2. `pnpm lint` 0 errors.
3. `pnpm test` full Vitest green.
4. `pnpm build` succeeds.
5. Storybook builds if UI changed.
6. CHANGELOG.md updated under `[Unreleased]` for user-facing changes.

## Pull Requests

Use `gh pr create` with a clear title and body that includes:

- Summary (1-3 bullets).
- Test plan (markdown checklist).
- Linked issue or ADR if applicable.

## Local Development

### Pre-flight (one-time)

```bash
brew install mise   # runtime version manager
mise install        # reads mise.toml: Node 24 + pnpm 11
```

### Day-to-day

```bash
pnpm install --frozen-lockfile
pnpm dev          # apps/web at http://localhost:3000
pnpm test         # all tests
```

## Code Style

- TypeScript 6+ everywhere.
- No unnecessary comments.
- No premature abstractions.
- Validate at system boundaries only.
- One concern per file. Do not bundle unrelated changes.

## CI Checks

Every PR triggers (advisory until promoted to required-status):

| Check | What it does |
|---|---|
| `ci` | typecheck, lint, test, storybook build, build |
| `gitleaks` | secret scan |
| `commitlint` | conventional commits enforcement |
| `codeql` | JS/TS SAST |
| `dependency-review` | CVE + license check on PR diff |
| `osv-scanner` | dependency CVE scan |
| `size-limit` | bundle budget on `apps/web` |

## License

All Rights Reserved. See `LICENSE`.

## Questions

Ping Hleb. Office hours by appointment.
