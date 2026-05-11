# Local Development

Bring up the web app locally with a real Postgres + Better Auth wired in.

## Required environment

Create `apps/web/.env.local` with:

```bash
# Postgres connection (consumed by @workspace/db client)
DATABASE_URL=postgres://app:app_dev@localhost:5432/app_dev

# Better Auth secret — 32+ byte random string
# Generate: openssl rand -base64 33
BETTER_AUTH_SECRET=<generated>

# Public base URL of this web app
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Origins allowed to call /api/auth/* (comma-separated)
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000

# HMAC secret for signup + invite JWTs — 32+ byte random string,
# separate from BETTER_AUTH_SECRET so they rotate independently
APP_TOKEN_SECRET=<generated>
```

`.env*` is gitignored. Never commit secrets.

## Bring up Postgres

Quickest path:

```bash
docker run --rm -d \
  --name app-dev-pg \
  -e POSTGRES_USER=app \
  -e POSTGRES_PASSWORD=app_dev \
  -e POSTGRES_DB=app_dev \
  -p 5432:5432 \
  postgres:18
```

Apply migrations:

```bash
pnpm --filter @workspace/db db:migrate
```

The migrate script reads `DATABASE_URL` from env. It applies every SQL file
under `packages/db/src/migrations/` in lexical order, tracking which have
been applied in a `_schema_migrations` ledger.

## Run the web app

```bash
pnpm --filter web dev
```

Visit `http://localhost:3000`. Auth catchall is mounted at
`/api/auth/[...all]`. Workspace + organization routes do not exist yet —
they will land in subsequent scaffold steps.
