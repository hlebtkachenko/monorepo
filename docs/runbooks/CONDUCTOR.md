# Conductor Workspaces

How the Afframe monorepo is wired for [Conductor](https://conductor.build) —
the macOS app that runs many Claude Code / Codex agents in parallel, each in its
own git worktree + branch. This runbook is the source of truth for the
`.conductor/` config; read it before changing setup/run scripts or debugging a
workspace.

## The model in one paragraph

Every Conductor workspace is a separate git worktree on its own branch, created
from the latest `origin/main`. Config lives in **committed** `.conductor/settings.toml`
(the source of truth for local _and_ cloud workspaces) plus committed scripts
under `scripts/conductor/`. Nothing critical lives in untracked local files — a
freshly created workspace rebuilds itself entirely from the remote, which is what
keeps ~10 parallel workspaces reproducible even after a local wipe.

## Isolation: how 10 parallel workspaces don't collide

`run_mode = "concurrent"` + full per-workspace isolation. Conductor gives each
workspace a 10-port range starting at `$CONDUCTOR_PORT`. The setup script turns
that into complete isolation:

| Resource    | Isolation     | Value                                                 |
| ----------- | ------------- | ----------------------------------------------------- |
| Ports       | per workspace | web `$CONDUCTOR_PORT`, api `+1`, admin `+2`           |
| Database    | per workspace | `ws_p<port>` on the **shared** Postgres server        |
| Auth secret | per workspace | random `BETTER_AUTH_SECRET` (generated)               |
| Demo login  | **shared**    | `owner@example.com` / `passwordpassword` → org `acme` |

The Postgres _server_ is shared (one Docker container, cheap), but each workspace
gets its **own database** on it — so migrations and data on branch A never touch
branch B. Each database is seeded with the same demo owner, so you sign in to any
workspace's dev server with one set of credentials and never think about it.

> Why a per-workspace secret is safe: Better Auth hashes passwords with scrypt,
> independent of `BETTER_AUTH_SECRET` (the secret only signs sessions). A fresh
> DB seeded under its own random secret logs in fine. Do not _rotate_ a
> workspace's secret after seeding — that invalidates its sessions + 2FA.

pgBouncer's dev config is a static single-DB list, so per-workspace databases
**bypass pgBouncer** and connect directly to Postgres `:5432` (role `app_user`
still enforces FORCE RLS).

## What runs when

- **`scripts.setup` → `scripts/conductor/setup.sh`** (on workspace create):
  1. `pnpm install --frozen-lockfile` (the only fatal step).
  2. If Docker is reachable: bring up the shared Postgres, create `ws_p<port>`,
     apply per-DB grants (`init.d/00-roles.sql`, `01-grants.sql`) **before**
     migrating, run `db:migrate`, then mint the demo owner
     (`apps/web/scripts/seed-dev-owner.ts`) + `db:seed` the `acme` tenant graph.
  3. Generate `apps/web/.env.local` from `scripts/generate-env.sh` with this
     workspace's port + database baked in.
  4. Best-effort `pnpm codegraph:ready`.
     Every DB/index step warns but never aborts creation. **No Docker (cloud) → the
     whole DB block is skipped**, so cloud stays usable for coding + typecheck + git.
- **`scripts.archive` → `scripts/conductor/archive.sh`** (before archive): drops
  the workspace's `ws_p<port>` database so dead databases don't pile up.
- **Run buttons** (`scripts.run.*`): `web` (default), `api`, `typecheck`,
  `test`, `codegraph`. All but `typecheck` are `available_in = ["local"]`
  (they need Docker / the local DB).

## Add a page / run a workspace

1. Create the workspace in Conductor (branches off `origin/main`).
2. Setup runs automatically. When it finishes, press **Run → web**.
3. Open `http://localhost:<CONDUCTOR_PORT>`, sign in
   `owner@example.com` / `passwordpassword`, land on `/acme`.

## Cloud workspaces

Cloud runs on Conductor's infra, not your Mac: no Docker, no local DB, and it
does **not** see your machine-local `.conductor/settings.local.toml` or SSH
keyring. Cloud reads only committed `settings.toml`. Cloud is for coding, `typecheck`,
and git — the DB-backed run buttons are hidden there by `available_in`.

To make cloud fully functional, connect GitHub and (optionally) provide a token —
these are **app/GUI settings, not repo files**:

1. **GitHub connection** — Conductor app **Settings → GitHub** (Local _and_ Cloud
   sections). Authorize the Conductor GitHub App for the Cloud environment on
   `hlebtkachenko/monorepo`. This is what fixes "not connected to GitHub".
2. **git push over SSH from cloud** — set `ssh_key_path` in your **local**
   `.conductor/settings.local.toml` (a path, not a secret; machine-specific, so
   never in committed `settings.toml`).
3. **`gh` CLI in cloud** — cloud has no keyring, so `gh` needs a `GH_TOKEN`
   provided through Conductor's **cloud environment/secrets UI** (or
   `[environment_variables.cloud]` in `settings.local.toml`). A token is a secret
   → **never** put it in committed `settings.toml` (public repo).

## Settings precedence (why committed vs local matters)

Highest → lowest: managed (`~/.conductor/settings.managed.toml`) → **local**
(`.conductor/settings.local.toml`, machine-only, applies immediately, gitignored)
→ **committed** (`.conductor/settings.toml`, applies only after merge to
`origin/main`, reaches cloud + teammates) → user (`~/.conductor/settings.toml`) →
defaults. Keep secrets and machine paths in the local file; everything shared and
reproducible goes in the committed file.

## Troubleshooting

- **`web` fails / login rejected** — the workspace DB probably didn't build.
  Re-run: `bash scripts/conductor/setup.sh` (idempotent). Confirm Docker is up
  and `docker compose -f infra/compose/docker-compose.dev.yml ps` shows postgres
  healthy.
- **Port already in use** — another workspace is on the same port; that shouldn't
  happen (each gets its own `$CONDUCTOR_PORT`). Check you didn't launch two dev
  servers in one workspace.
- **Cloud can't push / `gh` fails** — see Cloud workspaces above; it's the app
  GitHub connection, not a repo change.
- **Leftover `ws_p*` databases** — archive normally drops them; drop manually
  with `docker compose -f infra/compose/docker-compose.dev.yml exec -T postgres
psql -U app_owner -d app_dev -c "DROP DATABASE IF EXISTS ws_p<port> WITH (FORCE);"`.
