# Local Compose Stack

Postgres 18 + pgBouncer for local development. Matches the production
two-URL contract: `DATABASE_DIRECT_URL` (port 5432, direct Postgres) and
`DATABASE_URL` (port 6432, pgBouncer transaction pool).

## Quick start

```bash
# 1. Start postgres only (fastest path for migration runs)
docker compose -f infra/compose/docker-compose.dev.yml up -d postgres

# 2. Apply migrations
pnpm --filter @workspace/db db:migrate

# 3. Start pgBouncer too (required for pgBouncer canary test)
docker compose -f infra/compose/docker-compose.dev.yml up -d postgres pgbouncer

# 4. Stop everything
docker compose -f infra/compose/docker-compose.dev.yml down

# 5. Reset (wipe volume + restart)
docker compose -f infra/compose/docker-compose.dev.yml down -v && \
  docker compose -f infra/compose/docker-compose.dev.yml up -d postgres
```

pgBouncer credentials live in committed `pgbouncer/userlist.txt` (dev-only,
non-secret). No manual setup step needed.

## Services

| Service    | Port  | Role         | Notes                                  |
|------------|-------|--------------|----------------------------------------|
| postgres   | 5432  | Direct PG    | `app_owner` login, healthcheck via `pg_isready` |
| pgbouncer  | 6432  | Pool (tx)    | `app_user` login, TCP healthcheck      |
| mailpit    | 1025/8025 | SMTP     | `--profile mailpit` only (opt-in)      |

## Roles

| Role       | Login | Attributes | Usage                          |
|------------|-------|------------|--------------------------------|
| app_owner  | yes   | SUPERUSER  | Migrations, object ownership   |
| app_user   | yes   | RLS active | Application connections        |
| app_admin  | no    | BYPASSRLS  | Via `SET LOCAL ROLE app_admin` |
| app_worker | no    | —          | Via `SET LOCAL ROLE app_worker`|

## Environment variables

Copy `.env.example` to `.env.local` for local overrides:

```
DATABASE_URL=postgres://app_user:dev_user@localhost:6432/app_dev
DATABASE_DIRECT_URL=postgres://app_owner:dev_owner@localhost:5432/app_dev
```

## Mailpit (optional)

Start with the `mailpit` profile:

```bash
docker compose -f infra/compose/docker-compose.dev.yml --profile mailpit up -d
```

Web UI: http://localhost:8025
