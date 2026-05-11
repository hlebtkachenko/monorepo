# Local Development

Bring up the web app locally with a real Postgres + Better Auth wired in.

## Required environment

Generate `apps/web/.env.local` with random secrets:

```bash
bash scripts/generate-env.sh
```

The script writes the file at `chmod 600`. Re-run with `--force` to
regenerate. The generated file contains:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection used by `@workspace/db` |
| `BETTER_AUTH_SECRET` | Better Auth signing key (33-byte base64) |
| `BETTER_AUTH_URL` | Server-side base URL |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Client-side base URL |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Allowed `/api/auth/*` callers |
| `APP_TOKEN_SECRET` | HMAC secret for signup + invite JWTs |
| `RESEND_API_KEY` | Set to send real password-reset emails; empty = log to console |
| `EMAIL_FROM` | From address for outbound mail |

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
