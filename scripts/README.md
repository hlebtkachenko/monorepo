# scripts/

Repo-wide utility scripts. Plain Node.js / bash, no workspace package.

| Script | Purpose | Run |
|---|---|---|
| `_TEMPLATE.sh` | Scaffold for new bash scripts (set -euo pipefail, info/warn/err helpers, usage block) | `cp _TEMPLATE.sh new-script.sh` |
| `safe-pull.sh` | git fast-forward pull with untracked-collision + dirty-tree guards | `bash scripts/safe-pull.sh` |
| `check-client-secrets.mjs` | Scan `apps/web/.next/static/**/*.js` for server env leaks, inlined secret values (api keys, db URLs with creds, JWTs, age keys), and shipped source maps | `pnpm check:client-secrets` (skips gracefully if no build) |
| `license-check.mjs` | License compliance scan | (see file header) |
| `sbom-diff.mjs` | SBOM diff between commits | (see file header) |

## Conventions

- `kebab-case.sh` (or `kebab-case.mjs`), executable.
- Bash: `set -euo pipefail` mandatory.
- Idempotent: re-running is safe.
- Never deploy-time. Deploy workflows must not invoke any script here.

## Deferred

Scripts intentionally NOT ported from prior work pending prerequisites. See [`docs/plans/SCRIPTS-ENABLEMENT.md`](../docs/plans/SCRIPTS-ENABLEMENT.md) for triggers.
