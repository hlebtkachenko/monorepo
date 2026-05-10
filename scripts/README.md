# scripts/

Repo-wide utility scripts. Plain Node.js, no workspace package.

| Script | Purpose | Run |
|---|---|---|
| `check-client-secrets.mjs` | Scan `apps/web/.next/static/**/*.js` for server env leaks, inlined secret values (api keys, db URLs with creds, JWTs, age keys), and shipped source maps | `pnpm check:client-secrets` (skips gracefully if no build) |
| `license-check.mjs` | License compliance scan | (see file header) |
| `sbom-diff.mjs` | SBOM diff between commits | (see file header) |
