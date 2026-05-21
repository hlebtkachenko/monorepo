# scripts/

Repo-wide utility scripts. Plain Node.js / bash, no workspace package.

| Script                         | Purpose                                                                                                                                                                                                                                                          | Run                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `_TEMPLATE.sh`                 | Scaffold for new bash scripts (set -euo pipefail, info/warn/err helpers, usage block)                                                                                                                                                                            | `cp _TEMPLATE.sh new-script.sh`                            |
| `safe-pull.sh`                 | git fast-forward pull with untracked-collision + dirty-tree guards                                                                                                                                                                                               | `bash scripts/safe-pull.sh`                                |
| `check-client-secrets.mjs`     | Scan `apps/web/.next/static/**/*.js` for server env leaks, inlined secret values (api keys, db URLs with creds, JWTs, age keys), and shipped source maps                                                                                                         | `pnpm check:client-secrets` (skips gracefully if no build) |
| `check-pr-title.mjs`           | Lint a PR title against `.github/workflows/pr-title.yml` rules (types + scopes + lowercase-first subject + 100-char max). Wired to lefthook `pre-push` against the latest commit subject — catches a bad title before it becomes a red `conv-title` check on CI. | `pnpm check:pr-title "<title>"`                            |
| `license-check.mjs`            | License compliance scan                                                                                                                                                                                                                                          | (see file header)                                          |
| `sbom-diff.mjs`                | SBOM diff between commits                                                                                                                                                                                                                                        | (see file header)                                          |
| `check-brand-placeholders.mjs` | Scan i18n messages + `packages/ui/src/brand-assets/constants.ts` for unfilled `<BRAND-*>` placeholders. Warn-only by default; `CHECK_BRAND_STRICT=true` exits 1 (production-deploy guard in `_deploy-aws.yml`).                                                  | `pnpm check:brand-placeholders`                            |
| `build-favicons.py`            | Regenerate favicon raster + SVG set across `apps/{web,admin,api}/` from the `--brand-*` tokens in `globals.css`. Re-run after editing a brand color token.                                                                                                       | `python3 scripts/build-favicons.py`                        |
| `build-logo-paths.mjs`         | Extract SVG path geometry from `packages/ui/src/brand-assets/source/primary-light/*.svg` into typed TS modules under `paths/`. Re-run after dropping new SVG sources.                                                                                            | `node scripts/build-logo-paths.mjs`                        |

## Conventions

- `kebab-case.sh` (or `kebab-case.mjs`), executable.
- Bash: `set -euo pipefail` mandatory.
- Idempotent: re-running is safe.
- Never deploy-time. Deploy workflows must not invoke any script here.

## Deferred

Scripts intentionally NOT ported from prior work pending prerequisites. See [`docs/plans/SCRIPTS-ENABLEMENT.md`](../docs/plans/SCRIPTS-ENABLEMENT.md) for triggers.
