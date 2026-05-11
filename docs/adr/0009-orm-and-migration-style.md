# 9. ORM + migration style: drizzle-orm types-only + handwritten SQL migrations

- Status: Accepted
- Date: 2026-05-11
- Deciders: Hleb Tkachenko
- Refines: none

## Context and Problem Statement

`packages/db` needs to ship the multi-tenant Postgres schema for `monorepo`. The schema is non-trivial: FORCE row-level security with custom `USING`/`WITH CHECK` clauses keyed on session GUCs, append-only triggers on audit tables, SECURITY DEFINER helper functions for workspace-tier RLS without 42P17 recursion, EXCLUDE-USING-gist constraints on calendar tables, `ltree` columns for hierarchical accounting codes, circular foreign-key ordering across migration files, and `DO $$ ... $$` data-backfill blocks.

The reference implementation in the sibling `lac` repo went through the full design space: started hybrid (drizzle-kit generate + occasional handwritten patches), hit the wall on every constraint above, ended at 100% handwritten SQL with drizzle-orm used only as the runtime query builder. The `HANDWRITTEN_MIGRATIONS.md` in lac documents each round-trip failure that drove the choice.

We need to pick the same constraint upfront in `monorepo`, not iterate into it.

## Decision Drivers

- Multi-tenant FORCE RLS is a day-one requirement (see `ARCHITECTURE.md`).
- Audit append-only triggers are a day-one requirement (compliance posture).
- drizzle-kit's diff engine cannot round-trip RLS policies, trigger functions, EXCLUDE constraints, custom roles, or data-backfill blocks. Once a single handwritten migration lands, drizzle-kit's "single source of truth" promise breaks; introspection produces drift on the next generate.
- Greenfield consolidation: lac's 49 incremental production migrations collapse into ~11 final-state monorepo migrations because we have no historical data to preserve.
- Conventional Commits + ADR culture: every schema change is reviewable in PR; SQL diffs are the most direct review surface.

## Decision

`packages/db` uses **drizzle-orm at runtime as the typed query builder** and **handwritten SQL files in `packages/db/migrations/`** as the schema source of truth. A custom runner (`packages/db/scripts/apply-migrations.ts`) applies migrations in lex order, tracks them in an `_app_migrations` journal table with checksum drift detection, and uses `pg_advisory_lock` to prevent concurrent runs.

`drizzle-kit generate` and `drizzle-kit push` are forbidden. The `drizzle.config.ts` exists only so that drizzle-orm's runtime types can resolve schema metadata. CI rejects any commit that runs either command, and the `package.json` scripts that invoke them fail loudly with a pointer back to this ADR.

## Consequences

Positive:

- Every DDL change is a deliberate SQL file reviewed in PR. The diff is exactly what runs in production.
- Supports anything Postgres supports: RLS, triggers, EXCLUDE, ltree, pgvector, pgaudit, custom roles, GRANT/REVOKE, partial indexes with predicates, `CREATE OR REPLACE FUNCTION`.
- No translation layer between schema files and applied DDL. No introspection drift.
- Migration runner is ~200 lines: lex-sort, BEGIN/COMMIT wrap, postgres.unsafe(body), journal insert. No vendor-specific DSL to learn.
- Greenfield freedom: 11 final-state migrations instead of replaying 49 historical ones.

Negative / trade-offs:

- Slow to iterate: every "add column" is hand-written SQL instead of `pnpm db:generate`. Discipline tax on contributors.
- No automatic down-migrations. Rolling back a schema change means writing a new forward migration that undoes it (matches production reality; production never runs `migrate down`).
- Junior contributors will write unsafe DDL. Mitigated by `squawk` lint (planned for CI gates phase) flagging unsafe patterns (`ALTER TABLE` without lock, `DROP COLUMN` without warning, etc.).
- drizzle-orm schema files in `src/schema/*.ts` (Section 2 of port plan) must be hand-kept in sync with migration DDL. No automatic verification. Drift is caught only when a query fails at runtime or in tests.

Follow-up work required:

- Section 2 ships the `@workspace/db` runtime: `client.ts` (postgres-js + drizzle), `tenancy.ts` (`withWorkspace`/`withOrganization`/`withAdminBypass` with branded types and GUC save/restore), Drizzle schema files in `src/schema/`.
- Section 3 ships testcontainers + RLS leak harness + pgBouncer canary + pgTap suite.
- Section 4 ships CI gates: migration idempotency check (apply twice), `squawk` linting, schema-diff vs main, hardcoded-role-string detector, SECURITY DEFINER ownership audit, `NULLIF` guard coverage.
- A pre-commit hook (or CI grep) that rejects any commit invoking `drizzle-kit generate` or `drizzle-kit push`.

## Alternatives considered

- **Pure drizzle-kit** — fastest bootstrap, hits the wall on RLS + triggers + EXCLUDE + custom roles in week 2. Lac's `HANDWRITTEN_MIGRATIONS.md` is the postmortem on this path.
- **Hybrid (drizzle-kit for trivial changes, handwritten for the rest)** — sounds reasonable, fails in practice. The moment one migration is handwritten, drizzle-kit's diff sees the ORM schema vs the DB and tries to "fix" what it thinks is drift. End up disabling drizzle-kit anyway.
- **Atlas (atlasgo.io)** — declarative schema-as-HCL with a real diff engine. Heavyweight: another tool, another DSL, another binary in CI. Solves a problem we don't have at this scale.
- **Sqitch** — verify/deploy/revert with a dependency graph. Most rigorous, slowest to ship, Perl-based, heavy DX cost. Used at large fintech; overkill for a single-engineer MVP.
- **dbmate / golang-migrate** — language-agnostic SQL runners with up/down migrations. The down-migration ergonomics encourage a workflow we will never use in production. Same shape as our custom runner but packaged with extra weight.
- **node-pg-migrate** — JS DSL with up/down. Same down-migration trap; DSL adds a layer over raw SQL we explicitly want to read.
- **Prisma Migrate** — Prisma's generator with the same diff-engine trap as drizzle-kit, different vendor. Already ruled out elsewhere in the repo.

## See also

- `packages/db/migrations/` — the migration files themselves (Section 1 of the port plan)
- `packages/db/scripts/apply-migrations.ts` — the runner
- `packages/db/drizzle.config.ts` — config used only for drizzle-orm runtime type metadata
- `infra/compose/postgres/init.d/00-roles.sql` — role bootstrap that runs before any migration
- `.context/db-port-migrations-audit.md` — full audit of the 49 lac migrations and the 11-migration consolidation plan
- `.context/db-port-inventory.md` — the broader port plan that this ADR is one slice of
- ADR-0007 — single-account CDK deploy (production target)
- ADR-0008 — Cloudflare Tunnel + email split (deployment shape)
- Future ADR-0010 — multi-tenant RLS design (workspace + organization tiers, GUC contract, branded transaction helpers)
- Future ADR-0011 — audit log design (two-table append-only, two-pass redaction, GRANT-chain trade-off)
- Future ADR-0012 — local Postgres dev infra (compose + pgBouncer + pgBackRest + extensions)
- Future ADR-0013 — Money + FX representation (`numeric(19,4)` + `Money<Currency>` brand)
