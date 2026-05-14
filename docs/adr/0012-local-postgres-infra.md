# 12. Local Postgres development infrastructure

- Status: Accepted
- Date: 2026-05-11 (Accepted 2026-05-14)
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The production database is PostgreSQL 18 on Amazon RDS, accessed through an RDS Proxy in
pgBouncer transaction mode. The proxy is the critical piece: it enforces that GUCs set via
`set_config(name, value, true)` are transaction-scoped and never leak across connections.
This is the GUC contract described in ADR-0010.

A developer running the stack locally needs equivalent infrastructure. Without a local
pgBouncer, any test that does `withOrganization(...)` is testing against a direct Postgres
connection where session-level `SET` would not leak — giving false confidence. The
pgBouncer canary test (`packages/db/tests/pgbouncer-canary.test.ts`) explicitly proves the
leakage behavior; it requires a real pgBouncer to be meaningful.

Additionally, the production schema relies on PostgreSQL extensions that are not bundled in
the standard `postgres:18` Docker image: `pgaudit` (append-only audit event log, ADR-0011),
`pgvector` (future embedding storage), and `uuid-ossp` / `uuidv7` (primary key generation).
A development Dockerfile must install these extensions so the local environment mirrors
production exactly.

The existing `lac` sibling repo proved that each of these requirements — local pgBouncer,
custom extensions, per-role GUC defaults, two-URL contract — needs to be addressed on day
one. Retrofitting them into a running development environment is expensive.

## Decision

A Docker Compose stack in `infra/compose/` provides the local development Postgres
infrastructure. It ships with:

1. A custom `postgres:18` image (built from `infra/compose/postgres/Dockerfile`) with
   `pgaudit`, `pgvector`, `uuid-ossp`, and the `uuidv7()` SQL function installed.
2. A pgBouncer sidecar configured in transaction mode, listening on port 6432. Application
   code connects through pgBouncer on `DATABASE_URL`. Migrations and admin scripts connect
   directly on `DATABASE_DIRECT_URL` (port 5432).
3. Role and grant initialization via `infra/compose/postgres/init.d/` scripts that run on
   first container start. `00-roles.sql` creates the `app_owner`, `app_admin`, and `app_user`
   roles and sets the `app.app_user_role_name` GUC default via `ALTER ROLE`.

The two-URL contract is:

| Variable | Target | Port | Used by |
|----------|--------|------|---------|
| `DATABASE_URL` | pgBouncer | 6432 | Application runtime, `@workspace/db` client |
| `DATABASE_DIRECT_URL` | Postgres | 5432 | Migration runner, admin scripts, testcontainers |

pgBouncer is configured in `transaction` pool mode. `server_reset_query` is left empty
(the pgBouncer default for transaction mode) so `RESET ALL` does not fire on connection
return. This preserves the leakage behavior documented in the canary test.

## Two-URL contract in detail

`DATABASE_URL` passes through pgBouncer. pgBouncer routes each statement or transaction to a
backend from the pool, then returns the backend on `COMMIT`/`ROLLBACK`. GUCs set via
`set_config(name, value, true)` (is_local = true) are transaction-scoped: they revert when
the transaction ends, so the backend is returned to the pool clean.

`DATABASE_DIRECT_URL` bypasses pgBouncer entirely. The migration runner uses this path
because `drizzle-kit`-style DDL and `pg_advisory_lock` require a session-scoped connection
that pgBouncer transaction mode cannot provide.

Testcontainers (`packages/testcontainers/`) use the direct URL to apply migrations and
seed test data. They never connect through pgBouncer; the canary test gates on
`PGBOUNCER_URL` and is skipped in the default CI vitest run.

## Initialization sequence

On first `docker compose up`, Postgres runs every file in `init.d/` in lexical order as
the superuser before accepting application connections:

1. `00-roles.sql` — creates `app_owner`, `app_admin`, `app_user` roles; sets GUC defaults
   via `ALTER ROLE app_user SET app.app_user_role_name = 'app_user'`. This GUC is read by
   the last-owner-demotion trigger to distinguish the application role from the admin bypass
   role. Without it the trigger fails closed on the first `workspace_membership` write.
2. `01-grants.sql` — grants `CONNECT`, `CREATE`, and schema-level permissions so the
   migration runner can apply DDL and the application role can read/write tenant tables.

Migrations in `packages/db/migrations/` are applied separately by the runner
(`pnpm --filter @workspace/db db:migrate`). The init.d scripts only create roles and
grants; they do not create application tables.

## Custom Dockerfile

`infra/compose/postgres/Dockerfile` installs extensions on top of `postgres:18`:

- `postgresql-18-pgvector` — vector similarity search (future phase)
- `postgresql-18-pgaudit` — structured audit logging (ADR-0011)
- `uuid-ossp` extension + `uuidv7()` SQL function — UUIDv7 primary keys

The `uuidv7()` function is implemented as a pure-SQL function in the Dockerfile init
script because no packaged Postgres 18 extension ships it yet. The implementation uses
`gen_random_uuid()` with timestamp embedding to produce time-sorted UUIDs.

## Testcontainers integration

`packages/testcontainers/` provides a `bootPostgres18()` helper that:

1. Pulls or reuses the custom Postgres image.
2. Starts a `PostgreSqlContainer` with the same init.d scripts.
3. Applies all migrations via the runner.
4. Exports `userUrl` (app_user connection) and `adminUrl` (superuser connection).

`packages/db/tests/global-setup.ts` calls `bootPostgres18()` in the Vitest `globalSetup`
hook. The container is shared across all test files in the suite (`pool: 'forks'`,
`fileParallelism: false`) to avoid redundant image pulls in CI.

## Alternatives considered

- **Supabase CLI** — rejected. Supabase wraps Postgres with its own opinionated role model,
  GoTrue auth schema, and Realtime/Storage extensions. The local stack would differ from our
  bare RDS target in ways that matter: different default roles, different superuser path,
  different extension set. Any test that exercises `pg_has_role(current_user, 'app_admin', 'MEMBER')`
  would behave differently against Supabase's bundled Postgres vs. our RDS target.

- **Embedded Postgres (pglite / @electric-sql/pglite)** — rejected. No extension support
  for `pgaudit` or `pgvector`. WASM-based; behavior diverges from server Postgres on GUC
  handling, trigger semantics, and `SET LOCAL ROLE`. The canary test is meaningless against
  embedded Postgres.

- **Testcontainers only (no persistent compose stack)** — rejected for daily development.
  Testcontainers boot fast (4-6s warm) and work for CI and `pnpm test`. They do not serve
  as a persistent development database with pgAdmin, persistent data between runs, or manual
  SQL exploration. The compose stack provides that; testcontainers provides the disposable
  test surface. The two are complementary.

- **neon.tech / Supabase cloud free tier** — rejected. Development parity requires the same
  pgBouncer transaction-mode pooling as production. Cloud free tiers change their pooling
  behavior without notice. An always-on cloud DB also requires network access; the compose
  stack works offline.

- **dbmate or golang-migrate as the runner** — considered for the runner inside the compose
  stack but rejected. The custom runner ships in the monorepo, uses only `postgres-js` and
  `pg_advisory_lock`, and is already the migration path for both CI and production. Adding a
  second tool for local-only use is unnecessary complexity.

## Consequences

Positive:

- Development environment mirrors production: same Postgres 18, same pgBouncer transaction
  mode, same extension set, same role model. The "works on my machine" surface area shrinks.
- The pgBouncer canary test provides a direct proof that the GUC contract holds under pool
  churn. No equivalent proof is possible without a real pgBouncer.
- init.d role setup is idempotent (`CREATE ROLE IF NOT EXISTS`, `ALTER ROLE IF EXISTS`) and
  documented in one file, separate from application migrations.
- Two-URL contract is explicit in `.env.example` and validated at startup by `client.ts`.

Negative / trade-offs:

- Docker Desktop (or compatible runtime) is required. Documented in ADR-0005.
- First `docker compose up` takes longer than a plain `postgres:18` pull because the custom
  image must be built locally.
- Developers must remember to run `pnpm db:migrate` after `docker compose up` before using
  the stack. No auto-migration on compose start (intentional: migrations are destructive DDL
  and must not run silently).
- pgBouncer configuration is manually maintained. Any change to `pool_mode`, `server_reset_query`,
  or `default_pool_size` must be tested against the canary test.

Follow-up work required:

- pgAdmin service in the compose stack for GUI-based schema inspection (convenience; not
  required for correctness).
- `.env.example` with `DATABASE_URL`, `DATABASE_DIRECT_URL`, `PGBOUNCER_URL` values pre-filled
  for the compose stack.
- CI job that runs the pgBouncer canary: start compose stack, export `PGBOUNCER_URL`, run
  `pnpm --filter @workspace/db test`. Currently deferred to the Section 4 CI gates phase.

## See also

- `infra/compose/docker-compose.dev.yml` — compose file defining postgres + pgbouncer services
- `infra/compose/postgres/Dockerfile` — custom image with pgaudit + pgvector + uuidv7
- `infra/compose/postgres/init.d/00-roles.sql` — role creation and GUC defaults
- `infra/compose/postgres/init.d/01-grants.sql` — schema-level grants
- `infra/compose/pgbouncer/` — pgbouncer.ini and userlist.txt
- `packages/testcontainers/src/` — `bootPostgres18()` helper used in vitest globalSetup
- `packages/db/tests/global-setup.ts` — vitest globalSetup that calls `bootPostgres18()`
- `packages/db/tests/pgbouncer-canary.test.ts` — pgBouncer transaction-mode canary
- ADR-0009 — handwritten SQL migrations (explains `DATABASE_DIRECT_URL` requirement)
- ADR-0010 — multi-tenant RLS, GUC contract, `set_config(name, value, true)` pattern
- ADR-0011 — audit log append-only design (requires `pgaudit` extension)
- ADR-0013 — Money and FX representation

## Amendment — 2026-05-14 (sidecar pgBouncer; RDS Proxy eliminated)

The Context section's reference to "RDS Proxy in pgBouncer transaction mode" is superseded
by E.2 of the infra-rebuild plan (`.context/decision-pgbouncer-prod.md`, 2026-05-12).
Production pooling is a sidecar pgBouncer container co-located in the api Fargate task on
`localhost:6432`. RDS Proxy is eliminated: AWS RDS Proxy intercepts `SET LOCAL` and
rewrites it to session-scope, breaking the GUC contract
(`set_config(name, value, true)`).

The two-URL contract (`DATABASE_URL` → pgBouncer :6432, `DATABASE_DIRECT_URL` → RDS :5432)
is unchanged. Only the network topology to the pool changes: Proxy → sidecar container.

See `infra/cdk/lib/app-stack.ts` pgBouncer container definition (added in the infra
rebuild PR).
