# CI Policy

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

Which checks must pass before a PR can merge, and which are advisory.

## Required vs advisory: today

While the repo is pre-revenue and Hleb is solo, _advisory_ means: the check must run on every PR but a failure does not block merge. _Required_ means: failure blocks merge. The matrix changes when the repo turns private + revenue-generating.

| Check                                                 | Today                        | Future (production)         |
| ----------------------------------------------------- | ---------------------------- | --------------------------- |
| `typecheck`                                           | required                     | required                    |
| `lint`                                                | required                     | required                    |
| `test`                                                | required                     | required                    |
| `build`                                               | required                     | required                    |
| `ci` (aggregation shim)                               | required                     | required                    |
| `knip` (dead-code)                                    | required, warn-only [^1]     | required                    |
| `check` (paired-files)                                | required                     | required                    |
| `boundaries` (import boundaries)                      | required                     | required                    |
| `e2e` (Playwright auth flows)                         | advisory, path-filtered      | required (via shim)         |
| `commitlint` (posts as `lint`)                        | required [^6]                | required                    |
| `actionlint`                                          | advisory, path-filtered [^7] | required (via shim)         |
| `zizmor` (workflow lint)                              | advisory                     | required                    |
| `codeql` (posts as `Analyze (javascript-typescript)`) | required [^6]                | required                    |
| `dependency-review` (posts as `review`)               | required [^6]                | required                    |
| `gitleaks`                                            | required                     | required                    |
| `osv-scanner` (posts as `scan-pr / osv-scan`)         | required [^6]                | required (fail on Critical) |
| `license-check`                                       | advisory [^2]                | required                    |
| `size-limit` (bundle, posts as `size`)                | advisory, path-filtered [^7] | required (via shim)         |
| `sbom` (CycloneDX)                                    | advisory [^3]                | required                    |
| `provenance` (SLSA L2)                                | advisory [^4]                | required                    |
| `cosign sign` (push only)                             | required                     | required                    |
| `cosign verify-attestation` (deploy gate)             | n/a (no deploy)              | required                    |
| `openapi-lint` (spec drift + Spectral)                | advisory                     | required                    |
| `db-schema-drift` (migration vs snapshot)             | advisory, path-filtered      | required                    |
| `squawk` (migration lint)                             | advisory                     | required                    |
| `db-tests` (Postgres 18 testcontainer)                | advisory, path-filtered [^5] | required (via shim)         |
| `conv-title` (PR title lint)                          | required                     | required                    |
| `size-cap` (PR size limit)                            | required                     | required                    |
| Mutation testing (Stryker)                            | advisory, nightly            | advisory, nightly           |

[^1]: `knip` is a REQUIRED status check on the `main` ruleset (the job must run and be visible on every PR), but `.github/workflows/knip.yml` uses `continue-on-error: true` on the run step, making it warn-only today. This is intentional: knip found day-1 findings across 101k LOC that require a dedicated owner decision and cleanup pass — silently failing PRs that don't touch dead code would be noise, not signal. Once a dedicated dead-code cleanup issue lands and knip is clean, remove `continue-on-error: true` to make the gate real.

[^2]: `license-check` is implemented at `.github/workflows/_supply-chain.yml:138-167` using `scripts/license-check.mjs` (default-deny posture; allows MIT/Apache-2.0/BSD/ISC/MPL-2.0/etc., denies GPL/AGPL/LGPL). Runs on `release.yml`. Promote to required after one green release cycle.

[^3]: `sbom` is implemented at `.github/workflows/_supply-chain.yml:69-87` using `anchore/sbom-action` (CycloneDX JSON 1.6) with cosign keyless attestation. Runs on `release.yml`. Promote to required after one green release cycle.

[^4]: `provenance` is implemented at TWO levels: SLSA L2 via cosign sign-blob in `_supply-chain.yml:90-111`, and SLSA L3 via `slsa-framework/slsa-github-generator` in `release.yml:95-105`. Promote to required after one green release cycle.

[^5]: `db-tests` was previously listed as `required` here but is not in `.github/rulesets/main.json` required_status_checks. Live branch protection is the source of truth — db-tests is advisory today. When promoted to required (Linear AFF-65), the trigger-paths filter must be replaced with the ci-status-shim pattern (Linear AFF-68) to avoid stuck PRs.

[^6]: Live `.github/rulesets/main.json` lists these checks as required by their posted context name (`lint` for commitlint, `Analyze (javascript-typescript)` for codeql, `review` for dependency-review, `scan-pr / osv-scan` for osv-scanner). The earlier `advisory` classification was stale — branch protection has enforced them for some time. Reconciled 2026-05-19 as part of AFF-65.

[^7]: `actionlint`, `zizmor`, and `size` (size-limit) use trigger-level `paths:` filters today. Promoting them to required without first refactoring to the ci-status-shim pattern (Linear AFF-68 Tier 2) would create stuck PRs — branch protection reads a `paths:`-skipped check as "missing". Promote after the shim refactor lands. Tracked as the AFF-65 follow-up.

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

### Workflow-trigger filters

Workflow-level `paths:` filters on the trigger block create stuck PRs when the workflow is a required status check (the skipped run reads as "missing" to branch protection). They are used ONLY on advisory workflows whose check name is not in `.github/rulesets/main.json` required list — currently `container-scan.yml`, `osv-scanner-pr.yml`, `db-migration-lint.yml`, `db-pgtap.yml`, `e2e.yml`, `db-tests.yml`. **Do not add workflow-trigger `paths:` to required workflows like `ci.yml` or `gitleaks`.** When an advisory workflow is promoted to required (see Linear AFF-65), the trigger-paths filter must be replaced with the ci-status-shim + in-workflow gate pattern from `ci.yml` (Linear AFF-68 for the broader rollout). The six API/DB gate workflows (`openapi-lint`, `sdk-drift`, `mcp-coverage`, `pr-checklist`, `db-schema-drift`, `db-migration-idempotency`) already use the shim pattern on their PR triggers — required-flip ready.

### In-workflow job/step skip via `changes` upstream

Three workflows use the same pattern: a `changes` job runs `dorny/paths-filter` to compute outputs, real jobs gate on those outputs via `if:`, and a final aggregator job owns the required-check name and treats `skipped` as non-failure (only `failure|cancelled` red the aggregator). The required status check stays posted on every PR even when the real job skips. See the `ci` aggregator job in `ci.yml` for the canonical example.

| Workflow         | Required check name | Real job             | Gated on                                                                                    | What skipping saves                   |
| ---------------- | ------------------- | -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `ci.yml`         | `ci`                | `storybook`          | `packages/ui/**`                                                                            | ~3-4 min of job time on non-UI PRs    |
| `ci.yml`         | `ci`                | `lint-typecheck`     | `code` filter (apps/\*\*, packages/\*\*, infra/cdk/\*\*, lockfile, tsconfig, turbo.json)    | ~60-90s runner setup on docs-only PRs |
| `ci.yml`         | `ci`                | `unit-test`          | `code` filter (same as above)                                                               | ~60-90s runner setup on docs-only PRs |
| `ci.yml`         | `ci`                | `build`              | `code` filter (same as above)                                                               | ~2-4 min on docs-only PRs             |
| `ci.yml`         | `ci`                | inner CDK Synth step | `infra/cdk/**`, `apps/*/package.json`, `pnpm-lock.yaml`                                     | ~20-40s on PRs that don't touch CDK   |
| `knip.yml`       | `knip`              | `knip-run`           | source filter (\*\*/\_.{ts,tsx,js,jsx,mjs,cjs}, \*\*/package.json, lockfile, knip config)   | ~60-120s on docs/infra-only PRs       |
| `boundaries.yml` | `boundaries`        | `boundaries-run`     | source filter (\*\*/\_.{ts,tsx,mts,cts}, \*\*/package.json, tsconfig, turbo.json, lockfile) | ~30-60s on docs/infra-only PRs        |

`storybook` builds and tests in a single job (build ~70s turbo-cached + unsharded `@storybook/test-runner` ~150s). An earlier build + 2-shard-matrix split with an artifact handoff was measured net SLOWER end-to-end (each shard paid ~70s setup + ~40s Playwright deps + ~35s cache save for ~80s of test work) and was collapsed back (CICD-02). Re-shard only when the unsharded test phase alone exceeds ~5 min.

`coverage` (`pnpm turbo test:coverage`, ui-scoped) runs as its own advisory job gated on the `code` filter — it is deliberately NOT in the `ci` aggregator's `needs`, so a coverage failure cannot block merge and it no longer sits on the `unit-test` critical path (CICD-03).

### `--affected` policy

`turbo --affected` scopes graph tasks to packages touched vs the PR base (or `HEAD^` on push to main). Applied selectively:

| Task                    | `--affected`? | Why                                                                                                                                                              |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typecheck`             | Yes           | Type errors are local to changed package + downstream consumers; turbo's inputs hashing catches them.                                                            |
| `lint`                  | Yes           | Same reasoning.                                                                                                                                                  |
| `test` (vitest, non-db) | Yes           | Same. `test:coverage` also uses `--affected`.                                                                                                                    |
| `build`                 | **No**        | Deploy/release path consumes the FULL build artifact set (`apps/web/.next/standalone`, `apps/api/dist`, `apps/admin/.next`). A partial build = poisoned release. |
| `build-storybook`       | No            | Job already skipped when no UI change; full graph is fine when running.                                                                                          |
| `synth` (CDK)           | No            | Only runs at all when `infra/**` changed (path-filtered above).                                                                                                  |

`TURBO_SCM_BASE` is set to `${{ github.event.pull_request.base.sha || 'HEAD^' }}` — the existing pattern from `ci.yml`'s `test:coverage` step. Full-graph fallback works on push to main and on the first commit of a new branch.

### `fetch-depth` policy

| Job                         | `fetch-depth` | Reason                                                                            |
| --------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `gitleaks`                  | `0`           | Full-history secret scan.                                                         |
| `lint-typecheck`            | `0`           | `turbo --affected` needs base ref reachable.                                      |
| `unit-test`, `coverage`     | `0`           | Same.                                                                             |
| `storybook`, `build`, `e2e` | default (`1`) | No `--affected` here; full history is dead weight.                                |
| `changes` (paths-filter)    | default (`1`) | `dorny/paths-filter` reads the PR diff via the GitHub API, not local git history. |

## Remote cache

Turborepo Remote Cache runs on Cloudflare Workers + R2. Architecture decision: [ADR-0021](../adr/0021-turborepo-remote-cache-cloudflare.md). Operator runbook: [`docs/runbooks/CI-TURBO-REMOTE-CACHE.md`](../runbooks/CI-TURBO-REMOTE-CACHE.md).

| Layer                                    | What it caches                                                                                                | Backend                                                   | Quota                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| Local `.turbo` (per-runner)              | Most recent task outputs                                                                                      | Runner filesystem                                         | Tmpfs                |
| GitHub Actions cache (content-addressed) | `.turbo` snapshot, per-job key on input hash — restore-only on PRs/schedules, saved on push to main (CICD-04) | GH built-in                                               | 10 GiB/repo (LRU)    |
| **Cloudflare Workers + R2 (remote)**     | All task outputs, cross-branch                                                                                | Worker `cache.afframe.com` → R2 bucket `turbo-cache-prod` | R2 free tier (10 GB) |

**Fail-open posture.** The composite step "Configure Turbo Remote Cache defaults" in `.github/actions/setup/action.yml` uses `continue-on-error: true`, and turbo CLI treats a remote-cache HTTP failure as a cache miss (rebuilds locally). No CI required-check depends on the remote cache being live. A Cloudflare outage at the cache layer slows CI on cached jobs but cannot red the build.

**Fork PRs do not access secrets.** PRs from forks have `secrets.TURBO_TOKEN` as an empty string. The composite step detects this and no-ops, falling back to the local + content-addressed GH Actions cache layers. Fork builds stay cold but functional.

**Cache integrity.** `turbo.json` sets `"remoteCache": { "signature": true }`. The CLI signs every artifact with HMAC-SHA256 using `TURBO_REMOTE_CACHE_SIGNATURE_KEY` on write, and verifies on read. The Worker is a dumb passthrough — a compromised Worker cannot sign artifacts the CLI will trust.

**Required configuration** (set during PR-D pre-flight, see [runbook § 1](../runbooks/CI-TURBO-REMOTE-CACHE.md#1-first-time-deploy-done-once)):

- Repo variable `TURBO_API` — Worker URL (`https://cache.afframe.com`)
- Repo secret `TURBO_TOKEN` — Worker auth bearer
- Repo secret `TURBO_REMOTE_CACHE_SIGNATURE_KEY` — HMAC key

When `TURBO_API` is empty (the v1 default before manual variable set), the composite no-ops and the remote layer is disabled — safe to merge PR-D Commit 2 before Commit 1's Worker is deployed.

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
- No required review (ruleset: required_approving_review_count: 0, require_code_owner_review: false) while solo.
- Require status checks: see "required" column above.
- Require linear history.
- Signed commits: NOT enforced in the live ruleset (no required_signatures rule in main.json).
- Restrict who can push directly: nobody.
- Allow merge, squash, and rebase (all three enabled in the ruleset).

`v*` tags:

- Restrict creation to maintainers.
- Tag re-push blocked.

## Deliberate choices that look like bugs (do NOT "fix")

A workflow audit on 2026-05-31 flagged the items below as defects. Each is
intentional. They are recorded here so future audits (human or AI) stop
re-flagging them. Verify against this list and `git blame` before "fixing" a
CI config.

| Where                                                                                          | Looks like                                     | Reality                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_deploy-aws.yml` `CHECK_BRAND_STRICT: "false"` (prod brand guard)                             | Prod placeholder gate disabled                 | Deliberate pre-v1: no users yet, so prod may ship `<BRAND-*>` placeholders while brand copy is iterated. Commit `da839b8b`. **Flip to `"true"` before the v1 GA cut.**                                                                                                                                                                                                                                                                           |
| `scorecard.yml` SKIP tokens `BranchProtectionID`…`VulnerabilitiesID`                           | The `ID` suffix never matches Scorecard output | Correct — OSSF Scorecard SARIF rule ids genuinely carry the `ID` suffix. Verified against the repo's own `results.sarif`; the 7 informational checks are filtered as intended.                                                                                                                                                                                                                                                                   |
| `db-schema-drift.yml` runs `db-schema-snapshot.sh` without `export PATH=.../postgresql/18/bin` | Bare `pg_dump` resolves to pg16 → bad dump     | Works: the PGDG `pg_wrapper` selects the pg18 client. Confirmed by a green run ("Schema matches snapshot"). The sibling `db-migration-idempotency.yml` sets PATH defensively; the difference is cosmetic, not load-bearing.                                                                                                                                                                                                                      |
| `db-migration-lint.yml` `cargo install squawk` (compiles from source)                          | Should use a prebuilt binary                   | Rejected in-file: squawk's GitHub binary releases are inconsistent across versions; `cargo install` is the canonical path. (Caching `~/.cargo` is the only open optimization.)                                                                                                                                                                                                                                                                   |
| `_build-image.yml` has no `uses:` caller                                                       | Dead reusable workflow, delete it              | Documented extension point — `SUPPLY-CHAIN.md`, `RELEASES.md`, and `ADDING-X-TO-MONOREPO.md` reference it; the deploy pipeline intentionally builds its own image and does NOT call it.                                                                                                                                                                                                                                                          |
| `secrets-drift.yml` is dispatch-only with the Vault auth block commented out                   | Abandoned / vacuously-green monitoring         | NOT M5-blocked: Vault JWT auth shipped in M5 (#279, 2026-05-31) and `linear-sync.yml` uses it. This workflow was just never migrated to it, and it also assumes the env-scoped deploy role, which a scheduled main run's OIDC `sub` can't satisfy. The daily `schedule` was removed in #315 because it fails on both counts; it returns once the workflow is rewired to `vault-action` + given a least-privilege SSM-read role. Tracked: DEV-46. |
| `codeql-action/upload-sarif` comment is `# zizmor: ignore[impostor-commit]` (not a version)    | Missing the version comment                    | Deliberate zizmor suppression — GitHub re-tags `codeql-action`, which zizmor flags as an impostor commit. Same `v4.35.5` SHA as the `init`/`analyze` pins.                                                                                                                                                                                                                                                                                       |
| `osv-scanner-pr.yml` job has no `timeout-minutes`                                              | Missing the hardening field                    | A job that calls a reusable workflow via `uses:` cannot set `timeout-minutes` (GitHub rejects it). The timeout must live inside the upstream reusable workflow.                                                                                                                                                                                                                                                                                  |

Also note: required status checks are defined in **`.github/rulesets/main.json`**
(a ruleset), not classic branch protection — `gh api .../branches/main/protection`
returns 404. The `ci`, `boundaries`, `knip`, and `check` required names are
aggregation **shim** jobs that own the check name and post green even when the
real job is skipped (docs/infra-only PRs).

## Cross-references

- `.github/workflows/ci.yml`
- `docs/conventions/COMMITS.md`
- `docs/adr/0003-coverage-risk-weighted.md`
