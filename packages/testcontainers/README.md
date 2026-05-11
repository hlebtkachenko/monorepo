# @workspace/testcontainers

Disposable Postgres 18 testcontainer helper for integration tests.

## Usage

```typescript
import { bootPostgres18 } from "@workspace/testcontainers"

const { adminUrl, userUrl, container } = await bootPostgres18()

// adminUrl — superuser (app_owner), use for schema queries + admin ops
// userUrl  — app role (app_user), RLS enforced, matches production

// In vitest globalSetup teardown:
await container.stop()
```

## What bootPostgres18 does

1. Starts a `postgres:18-alpine` container
2. Applies `infra/compose/postgres/init.d/*.sql` (role bootstrap, GUC defaults)
3. Applies `packages/db/migrations/*.sql` in order (DDL, RLS, triggers)
4. Returns `{ adminUrl, userUrl, container }`

The init.d SQL files are read from disk at runtime — the same files used by
the dev compose stack (`docker compose -f infra/compose/docker-compose.dev.yml`).
This is the single source of truth for role topology.

## Environment contract

`bootPostgres18` does not read from `process.env`. URLs are returned directly.
The vitest `global-setup.ts` sets `DATABASE_URL` and `DATABASE_DIRECT_URL` in
`process.env` so the db package's `client.ts` picks them up.

## Two-URL pattern

| Variable             | Role      | Port  | Notes                            |
|----------------------|-----------|-------|----------------------------------|
| DATABASE_URL         | app_user  | ephemeral | RLS enforced, matches prod       |
| DATABASE_DIRECT_URL  | app_owner | ephemeral | Superuser, for migrations + admin|

The testcontainer port is direct Postgres (no pgBouncer). The
`apply-migrations.ts` port-6432 guard does not fire for testcontainer URLs.
