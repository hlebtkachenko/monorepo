# PR Workflow

How pull requests are sized, gated, and merged in this monorepo. Derived from
measured behaviour of this repo's own CI (Turborepo remote cache + `--affected`

- paths-filter), not generic advice.

## Why the "big PR" habit is wrong here

CI baseline is ~5 minutes, not 20. The 20-minute runs are **cache-bust
outliers**: any change to a `turbo.json` `globalDependencies` entry
(`tsconfig.json`, `eslint.config.js`, `pnpm-workspace.yaml`, `.npmrc`) or to
`pnpm-lock.yaml` invalidates all ~128 tasks across the 26 packages and forces a
full cold rebuild. A change scoped to one package invalidates only that package
plus its dependents and hits the remote cache everywhere else.

So the fix for slow CI is **not** batching work into large PRs. It is keeping
cache-busters out of feature PRs and keeping each PR small enough to review,
revert, and gate cleanly.

## The six rules

1. **One concern per PR. Target ≤ ~800 lines / ≤ 20 files.** Large features ship
   as several PRs, cut at the natural commit boundaries you already create.
2. **Isolate cache-busters.** A change to `pnpm-workspace.yaml`,
   `tsconfig.json`, `eslint.config.js`, `.npmrc`, or `pnpm-lock.yaml` goes in its
   own standalone PR, merged first. Pay the full-rebuild cost once on a tiny
   diff; feature PRs then run on a warm cache.
3. **Stack, don't slab.** For a feature that is genuinely a chain of dependent
   changes, use stacked PRs (e.g. Graphite `gt`) so each link CIs and merges
   independently while sharing lineage — instead of one large blob.
4. **Preflight locally before pushing.** Run the affected gate
   (`pnpm preflight`) before `gh pr create` to catch breaks without a GitHub
   round-trip. This kills the multi-retry churn where a branch runs CI 4-5 times.
5. **Squash-merge only.** Every PR lands as one revertable commit on `main`. No
   merge commits, no `chore: sync origin/main into <branch>` noise in history.
6. **Let the merge queue serialize.** Approved PRs enter the GitHub merge queue,
   which re-tests against the latest `main` before landing. Closes the
   green-on-stale-main gap that manual `merge origin/main` commits paper over.

## What CI does (and does not) block

The single required `ci` status check is an aggregator shim: it posts on every
run and treats `skipped` jobs as non-failures, so docs-only PRs (skipped by the
`changes` paths-filter) stay fast and green. The heavy tail — e2e, container
scan, CodeQL, DAST, Storybook — is advisory or post-merge, never in the blocking
pre-merge path. Do not move slow jobs into the required gate.

## How a feature flows

1. Cache-bust change needed? Land it first as its own tiny PR.
2. Build the feature as small, conventional commits.
3. Split into per-concern PRs (stacked if dependent), each ≤ ~800 lines.
4. `pnpm preflight` before each push — no remote churn.
5. Each PR CIs in ~5 minutes on a warm cache and squash-merges independently.
6. A regression reverts as one squash commit, not the whole feature.
