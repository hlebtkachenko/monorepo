# CI Policy

Which checks must pass before a PR can merge, and which are advisory.

## Required vs advisory: today

While the repo is pre-revenue and Hleb is solo, *advisory* means: the check must run on every PR but a failure does not block merge. *Required* means: failure blocks merge. The matrix changes when the repo turns private + revenue-generating.

| Check | Today | Future (production) |
|-------|-------|---------------------|
| `typecheck` | required | required |
| `lint` | required | required |
| `test` | required | required |
| `build` | required | required |
| `commitlint` | advisory | required |
| `actionlint` | advisory | required |
| `zizmor` (workflow lint) | advisory | required |
| `codeql` | advisory | required |
| `dependency-review` | advisory | required |
| `gitleaks` | required | required |
| `osv-scanner` (lib CVEs) | advisory | required (fail on Critical) |
| `license-check` | advisory | required |
| `size-limit` (bundle) | advisory | required |
| `sbom` (CycloneDX) | advisory | required |
| `provenance` (SLSA L2) | advisory | required |
| `cosign sign` (push only) | required | required |
| `cosign verify-attestation` (deploy gate) | n/a (no deploy) | required |
| Mutation testing (Stryker) | advisory, nightly | advisory, nightly |

A check moves from advisory to required by:
1. PR demonstrating the check is stable on the repo (≤1% false positive rate over 4 weeks).
2. ADR if the check changes architecture (rare).
3. Update to this file in the same PR that flips the branch protection rule.

## Path filters

Path filters skip checks that are demonstrably orthogonal to the changed paths. Use sparingly.

| Path changed | Skip |
|--------------|------|
| Only `docs/**`, `*.md` | typecheck, test, build, mutation |
| Only `.github/workflows/**` | typecheck, lint, test, build (but actionlint and zizmor MUST run) |
| Only `infra/tofu/**` | typescript checks (not TS); but `tofu fmt` and `tofu validate` MUST run |
| Only `apps/web/**` | mutation testing for `packages/**` |

Any check that is part of *required* status above cannot be skipped by path filter on PRs targeting `main`.

## Concurrency

| Workflow | Group | cancel-in-progress |
|----------|-------|--------------------|
| PR builds (`ci.yml`) | `ci-${{ github.ref }}` | `true` |
| `main` builds | `ci-main` | `false` |
| Release builds (tag) | `release-${{ github.ref }}` | `false` |
| Deploy AWS | `deploy-aws-${{ env }}-${{ stack }}` | `false` |
| Drift detect (scheduled) | `drift` | `true` |

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
