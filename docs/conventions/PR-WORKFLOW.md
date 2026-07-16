# PR Workflow

How pull requests are sized, gated, and merged in this monorepo. Derived from
measured behaviour of this repo's own CI (Turborepo remote cache, `--affected`,
and `dorny/paths-filter`), not generic advice.

## What actually drives CI cost

CI baseline is ~5 minutes, not 20. Two things move the number, and neither is
"lines of code":

1. **Which package a change touches.** Turbo rebuilds the changed package plus
   everything that depends on it; the rest are cache hits. Measured invalidation
   set (`turbo run build typecheck test --filter=...<pkg> --dry=json`):

   | Change touches              | Packages invalidated |
   | --------------------------- | -------------------- |
   | a leaf app (`web`, `admin`) | 1 / 32               |
   | `@workspace/auth`           | 5 / 32               |
   | `@workspace/ui`             | 7 / 32               |
   | `@workspace/db`             | 10 / 32              |
   | `@workspace/shared`         | 15 / 32              |
   | a cache-buster (see rule 2) | 32 / 32              |

   A 2,000-line change in `apps/web` invalidates one package. A 10-line change in
   `@workspace/shared` invalidates fifteen. Blast radius is a function of package
   depth, not diff size.

   The figures above were measured 2026-07 against 32 packages and drift as the
   graph changes — re-measure with the one-liner; treat the ratios as a shape
   (blast radius ≈ number of reverse dependencies), not constants. "~5 min" and
   "~20 min" are the warm-cache and cold-rebuild ends of that spectrum at that
   measurement, not guarantees.

2. **Cache-busters** (rule 2). They force a full 32/32 cold rebuild — the biggest
   lever _you control_. (A cold remote cache — eviction, a fork PR without cache
   credentials, the first run on a new global hash — also forces a full rebuild,
   but you don't trigger that per-PR.)

So: keep cache-busters out of feature PRs, and know that touching a foundational
package is wide regardless of how small the diff looks. PR line-count matters for
review quality, revertability, and AI-review fidelity — not primarily for CI
speed.

## The rules

1. **One concern per PR, kept well under the enforced cap.** The required
   `size-cap` check hard-fails over **2,000 added lines** (lockfile, migration
   metadata, and binary assets excluded) and warns over **800** — plan for ~800 as
   the ceiling, not 2,000; the cap is a backstop, not a target. Split the moment a
   PR mixes two concerns (a refactor plus a feature) or touches more than one
   package's public surface. Large features ship as several PRs cut at natural
   commit boundaries. `size-cap-override` is for genuinely-atomic exceptions
   (codegen, a single mechanical rename), not routine use.

2. **Isolate cache-busters.** A change to any turbo `globalDependencies` file
   (`tsconfig.json`, `eslint.config.js`, `pnpm-workspace.yaml`, `.npmrc`), to
   `turbo.json` or the root `package.json`, or to `pnpm-lock.yaml`, invalidates the
   global hash and forces a full 32/32 cold rebuild. Land it as its own standalone
   PR merged first, then **rebase in-flight branches onto the new main** — a branch
   cut before the cache-buster landed keeps the old global hash and cold-misses the
   remote cache until rebased. Dependabot bumps already arrive pre-isolated; leave
   them alone.

3. **Stack, don't slab.** For a feature that is a chain of dependent changes, base
   each PR on the previous branch (`gh pr create --base <prev-branch>`) so each link
   reviews and CIs as its own small PR — no extra tooling, no local stack state.
   (Graphite/`gt` was evaluated and rejected: its value is human-reviewer and
   persistent-stack ergonomics this solo, squash-only, parallel-worktree setup does
   not have.) Merge bottom-up. A stacked child PR's required checks run against its
   parent branch, not main; green there does not certify it against main. Never
   merge a child until its parent has landed, the child is retargeted/rebased onto
   main, and its required checks have re-run green on that main-based state.

4. **Preflight locally before pushing.** `pnpm preflight` runs `typecheck` + `lint`
   on the affected packages, `boundaries`, the docs-link check, and the CHANGELOG
   `## [Unreleased]` gate (the same one CI's `check` job runs). It pins the
   affected base to `origin/main` (and fetches it first) so the set matches what CI
   computes — without that pin turbo compares against your worktree's local `main`,
   which in a Conductor worktree is routinely tens of commits stale and silently
   expands "affected" to all 32 packages. Use `pnpm preflight:full` (adds `test
--affected`) when Docker is running; the DB integration tests need a Postgres
   testcontainer, so `test` is out of the default. Preflight is a fast subset of the
   required gate, not a mirror: changelog, PR-title, and nav-drift run in the
   pre-push hook, and `conv-title`, `knip`, `gitleaks`, and the heavy tail run only
   in CI. Green preflight means "probably won't break CI," not "CI will pass."

5. **Squash-merge only, coupled to small PRs.** Every PR lands as one revertable
   commit on `main`. Squash is correct _because_ PRs are small: squashing a small PR
   is near-lossless (the internal commits stay on the PR page and in the squash
   body), while squashing a 6k-line PR would destroy real bisect and revert
   granularity. The two decisions are one: small PRs **and** squash, or neither. The
   squash subject comes from the PR title (`squash_merge_commit_title = PR_TITLE`),
   which the `conv-title` check validates, so every commit on `main` is guaranteed
   conventional and carries `(#N)`.

6. **High-stakes code clears more than the fast gate.** The required `ci` gate is
   fast by design; the correctness tail that matters for money and data — `e2e`,
   `db-migration-idempotency`, `db-schema-drift`, `container-scan` — is advisory and
   may not have reported when the PR goes green. For any PR touching `packages/db`
   (migrations), `packages/accounting`, `packages/filing`, tax/VAT or
   `Money`/`FxRate` logic, or RLS/tenant-isolation code: run `pnpm preflight:full`
   locally and wait for the relevant advisory checks to report green before merging,
   even though they do not block. Migrations and data changes are forward-fix only —
   a squash revert does not undo them.

7. **Serialize where parallel worktrees collide.** Agents branch off main in
   separate worktrees, so two PRs can silently edit the same file. Before every
   push, `git fetch origin main` and rebase; never resolve a conflict by
   merge-clobber. `CHANGELOG.md` (Unreleased) and any `*.generated.*` /
   `openapi/v1.json` file are conflict magnets — land PRs that touch them fast or
   serialize them, and always regenerate (never hand-merge) generated files after a
   rebase. Give each in-flight PR a non-overlapping file/package territory; one
   concern per PR is necessary but not sufficient.

   After merging or rebasing `main`, **re-run `pnpm preflight` before pushing**. A
   release cut on `main` moves its `## [Unreleased]` entries into a version
   section, and a 3-way merge silently files _your_ Unreleased bullets into that
   just-released section, leaving `## [Unreleased]` empty — CI's `check` job then
   fails. `pnpm preflight` now includes that gate, so it catches the mis-file
   locally. This matters most on a **merge commit push**: the merge subject is not
   conventional, so it needs `git push --no-verify`, which skips every pre-push
   hook (including the changelog guard) — `pnpm preflight` is the only thing that
   still runs, so it is mandatory there.

8. **One branch per PR; start each PR from fresh main.** A branch is one PR is one
   concern. On squash-merge the branch is auto-deleted (remote) and is now behind
   main — never continue new work on a merged branch. Before starting any new unit
   of work, check where you are and don't duplicate a branch Conductor or Hleb
   already made:

   ```bash
   git branch --show-current           # where am I?
   git fetch origin main
   ```

   - If the current branch is the just-merged one (its upstream is gone —
     `git status` says "gone", or it appears in `git branch -vv | grep ': gone]'`)
     or is `main` itself: do **not** start committing here.
   - First check whether Hleb or Conductor already opened a fresh workspace/branch
     for the next task; if so, work there — do not create a competing branch.
   - Otherwise cut a new branch off updated main:
     `git switch main && git pull && git switch -c <type>/<concern>`.

   Never carry unrelated new work onto a branch whose PR already merged.

## Repo settings this convention assumes

Applied via repo settings / `gh api -X PATCH repos/{owner}/{repo}`:

- `allow_squash_merge = true`, `allow_merge_commit = false`,
  `allow_rebase_merge = false` — one merge method, uniform history. (Applied
  2026-07-16.)
- `squash_merge_commit_title = PR_TITLE`, `squash_merge_commit_message =
COMMIT_MESSAGES` — conv-title-gated subject, internal commits archived in the
  body. (Applied.)
- `delete_branch_on_merge = true` — parallel Conductor worktree branches would
  otherwise pile up. (Applied.)

Rebase-merge is deliberately off: the internal branch commits were only ever
CI-gated at the PR head, not individually, so landing them on `main` would put
untested commits in the `git bisect` surface. Squash guarantees every commit on
`main` is the exact CI-green, buildable unit.

## What CI does (and does not) block

The single required `ci` status check is an aggregator shim: it posts on every run
and treats `skipped` jobs as non-failures, so docs-only PRs (skipped by the
`changes` paths-filter) stay fast and green. The heavy tail — e2e, container scan,
CodeQL, DAST, Storybook — is advisory or post-merge, never in the blocking
pre-merge path. Advisory checks still run and still report; they just do not hold
the merge. Do not move slow jobs into the required gate, and do not delete checks
to make a PR faster.

Because `skipped` counts as pass, read a required check reported `skipped`/neutral
as "did not run," not "passed" — an all-green on a docs-only PR does not mean code
was tested, and a job that failed to _start_ also shows as non-failing. On code
PRs, confirm the code jobs actually ran.

## Grouping related PRs

Only for a genuine **campaign** — one change that legitimately spans many PRs
(e.g. the same fix applied across 20 pages). A normal single PR needs **no issue
and no epic** — it stands on its own. And even for a campaign, the scope +
changelog grouping below needs no issue at all; the tracking issue is optional,
added only when you want the timeline view for release-splitting. **Never open an
issue per PR** — that is noise, not tracking. When you do group a campaign, one
issue for the whole campaign, and make the connection visible in three places:

- **Tracking issue.** Open one `Type: EPIC` issue for the campaign and put
  `Refs #<epic>` in every PR body. GitHub then shows all of them in the issue
  timeline, and the issue-sync automation understands the `#<epic>` reference.
- **Commit history.** Use one shared conventional-commit scope across the campaign
  (`fix(<scope>): ...`). Every squash commit carries `(#N)`, so
  `git log --oneline --grep '(<scope>)'` reconstructs the whole cluster.
- **Changelog.** Prefix the campaign's `CHANGELOG.md` entries with the same
  `#<epic>` ref (e.g. `- #<epic> corrected VAT rounding on the invoice page`), so
  connected entries are eyeballable when deciding what goes in a release.

Optional extras: a `epic:<slug>` label for `gh pr list --label epic:<slug>`, and a
GitHub **Milestone** per release bucket — assign PRs to `v0.24.0` etc. and the
milestone page becomes the "what's in this release" view.

## How a feature flows

1. Cache-buster needed? Land it first as its own tiny PR; rebase in-flight branches.
2. Build the feature as small, conventional commits.
3. Split into per-concern PRs (chain with `gh pr create --base <prev>` if dependent).
4. `pnpm preflight` before each push — no remote churn.
5. Each PR CIs on a warm cache and squash-merges independently; the branch is
   auto-deleted.
6. A regression reverts as one squash commit (except migrations/data — forward-fix).
