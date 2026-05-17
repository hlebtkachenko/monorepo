# CI Policy

Which checks must pass before a PR can merge, and which are advisory.

## Required vs advisory: today

While the repo is pre-revenue and Hleb is solo, _advisory_ means: the check must run on every PR but a failure does not block merge. _Required_ means: failure blocks merge. The matrix changes when the repo turns private + revenue-generating.

| Check                                     | Today                    | Future (production)         |
| ----------------------------------------- | ------------------------ | --------------------------- |
| `typecheck`                               | required                 | required                    |
| `lint`                                    | required                 | required                    |
| `test`                                    | required                 | required                    |
| `build`                                   | required                 | required                    |
| `ci` (aggregation shim)                   | required                 | required                    |
| `knip` (dead-code)                        | required, warn-only [^1] | required                    |
| `check` (paired-files)                    | required                 | required                    |
| `boundaries` (import boundaries)          | required                 | required                    |
| `e2e` (Playwright auth flows)             | advisory                 | required                    |
| `commitlint`                              | advisory                 | required                    |
| `actionlint`                              | advisory                 | required                    |
| `zizmor` (workflow lint)                  | advisory                 | required                    |
| `codeql`                                  | advisory                 | required                    |
| `dependency-review`                       | advisory                 | required                    |
| `gitleaks`                                | required                 | required                    |
| `osv-scanner` (lib CVEs)                  | advisory                 | required (fail on Critical) |
| `license-check`                           | advisory [^2]            | required                    |
| `size-limit` (bundle)                     | advisory                 | required                    |
| `sbom` (CycloneDX)                        | advisory [^3]            | required                    |
| `provenance` (SLSA L2)                    | advisory [^4]            | required                    |
| `cosign sign` (push only)                 | required                 | required                    |
| `cosign verify-attestation` (deploy gate) | n/a (no deploy)          | required                    |
| `openapi-lint` (spec drift + Spectral)    | advisory                 | required                    |
| `db-schema-drift` (migration vs snapshot) | required                 | required                    |
| `squawk` (migration lint)                 | required                 | required                    |
| `db-tests` (Postgres 18 testcontainer)    | required                 | required                    |
| `conv-title` (PR title lint)              | advisory                 | required                    |
| `size-cap` (PR size limit)                | advisory                 | required                    |
| Mutation testing (Stryker)                | advisory, nightly        | advisory, nightly           |

[^1]: `knip` is a REQUIRED status check on the `main` ruleset (the job must run and be visible on every PR), but `.github/workflows/knip.yml` uses `continue-on-error: true` on the run step, making it warn-only today. This is intentional: knip found day-1 findings across 101k LOC that require a dedicated owner decision and cleanup pass — silently failing PRs that don't touch dead code would be noise, not signal. Once a dedicated dead-code cleanup issue lands and knip is clean, remove `continue-on-error: true` to make the gate real.

[^2]: `license-check` is implemented at `.github/workflows/_supply-chain.yml:138-167` using `scripts/license-check.mjs` (default-deny posture; allows MIT/Apache-2.0/BSD/ISC/MPL-2.0/etc., denies GPL/AGPL/LGPL). Runs on `release.yml`. Promote to required after one green release cycle.

[^3]: `sbom` is implemented at `.github/workflows/_supply-chain.yml:69-87` using `anchore/sbom-action` (CycloneDX JSON 1.6) with cosign keyless attestation. Runs on `release.yml`. Promote to required after one green release cycle.

[^4]: `provenance` is implemented at TWO levels: SLSA L2 via cosign sign-blob in `_supply-chain.yml:90-111`, and SLSA L3 via `slsa-framework/slsa-github-generator` in `release.yml:95-105`. Promote to required after one green release cycle.

A check moves from advisory to required by:

1. PR demonstrating the check is stable on the repo (≤1% false positive rate over 4 weeks).
2. ADR if the check changes architecture (rare).
3. Update to this file in the same PR that flips the branch protection rule.

## Type-aware linting

The `lint` check runs two type-aware ESLint rules in addition to the syntactic set: `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` (both `error`). They use typescript-eslint's `projectService`, so `pnpm lint` requires a parseable TypeScript project graph: every package must have a `tsconfig.json` whose `include` covers the source being linted. A `tsconfig` parse failure surfaces as a lint error, not a typecheck error.

The override is scoped to source files only — config files (`*.config.ts`, `.storybook/**`), `tests/` helpers, `*.d.ts`, and test/spec/stories/scripts/migrations are excluded.

The override is gated OFF under lefthook (detected via the `LEFTHOOK` env var) so the pre-commit ESLint hook stays fast and syntactic. The full type-aware rules run only in CI's `pnpm lint`, which is the authoritative gate.

## Path filters

Path filters skip checks that are demonstrably orthogonal to the changed paths. Use sparingly.

| Path changed                | Skip                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| Only `docs/**`, `*.md`      | typecheck, test, build, mutation                                  |
| Only `.github/workflows/**` | typecheck, lint, test, build (but actionlint and zizmor MUST run) |
| Only `apps/web/**`          | mutation testing for `packages/**`                                |

Any check that is part of _required_ status above cannot be skipped by path filter on PRs targeting `main`.

## Concurrency

| Workflow                 | Group                                | cancel-in-progress |
| ------------------------ | ------------------------------------ | ------------------ |
| PR builds (`ci.yml`)     | `ci-${{ github.ref }}`               | `true`             |
| `main` builds            | `ci-main`                            | `false`            |
| Release builds (tag)     | `release-${{ github.ref }}`          | `false`            |
| Deploy AWS               | `deploy-aws-${{ env }}-${{ stack }}` | `false`            |
| Drift detect (scheduled) | `drift`                              | `true`             |

Rule: PR runs cancel; `main`, releases, and deploys never cancel. Cancellation on `main` or release would leave a half-built artifact on the registry.

## Branch protection summary (post-bootstrap)

`main`:

- Require PR before merging.
- Require review from CODEOWNERS.
- Require status checks: see "required" column above.
- Require linear history.
- Require signed commits (gpg or ssh).
- Restrict who can push directly: nobody.
- Allow squash merge only.

`v*` tags:

- Restrict creation to maintainers.
- Tag re-push blocked.

## Cross-references

- `.github/workflows/ci.yml`
- `docs/conventions/COMMITS.md`
- `docs/adr/0003-coverage-risk-weighted.md`
