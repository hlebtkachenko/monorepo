# Scripts Enablement

Scripts intentionally NOT ported from prior repos pending prerequisites. Each entry lists the trigger condition for porting and a reference path.

## Deferred scripts

| Script | Trigger to enable | Reference (LAC source) |
|---|---|---|
| `bootstrap.sh` | `.env.example` exists + `docker compose` lands | `lac-v1/scripts/bootstrap.sh` |
| `doctor.sh` | First docker service runs locally (postgres, pgmq, mailpit) | `lac-v1/scripts/doctor.sh` |
| `db-reset.sh` | First Drizzle migration lands in `packages/db` | `lac-v1/scripts/db-reset.sh` |
| `tunnel.sh` | First webhook integration ships (Stripe, OAuth callback, mobile QA) | `lac-v1/scripts/tunnel.sh` |

## Enablement procedure

When a trigger fires:

1. Read the LAC source for the proven shape.
2. Adapt to current monorepo state (paths, package names, env var names).
3. Add row to `scripts/README.md`.
4. Remove row from this file.

## Why not ship as stubs

Stubs rot before first use. When the trigger fires months later, an editor will modify a stale file written against an unknown schema instead of writing fresh against the real shape. Empty placeholder beats half-broken stub; absence beats either.

## Scripts that will likely never come back

- `seed-dev.sh` (bash wrapper around `pnpm seed:dev`) — once `pnpm seed:dev` exists in `packages/db`, the wrapper adds zero value on macOS dev. Document `DATABASE_URL` env in `packages/db/README.md` instead.
