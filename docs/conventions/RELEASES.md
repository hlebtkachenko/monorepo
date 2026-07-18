# Release & Version Tag Convention

Single source of truth for how Afframe versions and ships releases. Brief on purpose — automation is intentionally minimal until v1.

## Tag format

Strictly semver-conformant:

| Kind              | Format                            | Example       |
| ----------------- | --------------------------------- | ------------- |
| Stable release    | `v<MAJOR>.<MINOR>.<PATCH>`        | `v0.2.0`      |
| Release candidate | `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` | `v0.2.1-rc.1` |

Regex enforced at the start of the release workflow:

```
^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[1-9][0-9]*)?$
```

A typo like `v0.2`, `0.2.0`, `v0.2.0-beta`, `v0.2.0-rc.0` will fail-fast before any artifact is built. RC numbers start at `1`, no leading zeros.

## Bump rules

We are pre-1.0. Until `v1.0.0` ships, the following applies:

| Component | When to bump                                                                    | Example             |
| --------- | ------------------------------------------------------------------------------- | ------------------- |
| **MINOR** | Anything you'd consider a breaking change later, OR a meaningful new capability | `v0.2.0` → `v0.3.0` |
| **PATCH** | Bug fixes, config tweaks, internal-only changes, doc updates                    | `v0.2.0` → `v0.2.1` |
| **MAJOR** | Stays at `0` until v1 launch                                                    | always `0`          |

Post-1.0 we switch to classic semver: MAJOR for breaking API changes, MINOR for additive, PATCH for fixes.

## Release candidate flow

RCs let you ship a near-final build to staging without committing to the version number. Flow:

1. Cut `v0.2.0-rc.1` → goes to staging, GitHub marks it as **Pre-release**.
2. Find an issue → cut `v0.2.0-rc.2`. Repeat.
3. When the candidate is clean, cut `v0.2.0` (drop the `-rc` suffix). GitHub marks it as **Latest**.

The release workflow auto-flags `-rc.*` tags as pre-release; stable tags become the "latest" pointer.

## Who tags

Tagging is **human-gated**, not human-executed. A release tag is cut only on
Hleb's explicit authorization — never autonomously, never by scheduled
automation. That authorization is **delegable**: when Hleb tells an agent to
"cut a release" (with no narrower scope), the agent runs the workflow end to
end **including creating and pushing the annotated tag** — that instruction _is_
the human gate. Absent such an instruction, no agent and no automation pushes a
tag.

This keeps the release cadence human-decided while letting a delegated cut
finish in one shot instead of stalling half-done at the release PR.

## Changelog discipline (fragment files)

Every non-release PR must add one **fragment** under `changelog.d/` before
review. This applies to docs, dependencies, CI, infra, and internal changes.
Each PR writes its own uniquely-named fragment file, so parallel PRs never edit
a shared region and never conflict — this replaced the old single hand-edited
`## [Unreleased]` block, whose shared lines conflicted on every second parallel
merge. Use:

```bash
pnpm changelog:add -- --category Changed --entry "..." [--bump minor] [--override]
```

Only `--category` and `--entry` are required. The `--entry` text becomes the
fragment body — the exact one-sentence bullet that lands in `CHANGELOG.md`. The
optional fields become YAML frontmatter:

| Field        | Effect                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bump`     | `patch` \| `minor` \| `major`. The strongest bump across all fragments = the suggested version bump _level_ (never a concrete version number — the actual `vX.Y.Z` is decided at cut).  |
| `--override` | Marks the `--bump` as deliberate. If a rule would suggest a different level, the release agent honors this one and does not argue. Tags the preview's suggested-bump line `(override)`. |

Categories are the six canonical Keep-a-Changelog sections plus `Dependencies`:
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`,
`Dependencies`. Documentation-only changes go under `Changed`; `Dependencies` is
auto-synthesized from Dependabot `chore(deps)` commits at release-cut.

**One fragment per commit.** Write the fragment in the same commit as the change
it documents (`git add changelog.d/… <code> && git commit`). Squash `wip` /
`fixup` commits before they reach `main`, so every landed commit carries exactly
one fragment = one bullet. A PR that makes three distinct changes has three
commits and three fragments; the squashed PR still yields three rich bullets.
Never scrape raw commit messages — the fragment body is the curated bullet.
Full authoring reference: [`changelog.d/README.md`](../../changelog.d/README.md).

Preview the pending release at any time (renders every fragment as the next
version section, prints the suggested bump with an `(override)` tag when set):

```bash
pnpm changelog:preview
```

Release PRs are the only exception to the add-a-fragment gate: a PR titled
`chore(release): vX.Y.Z` or `chore(release): vX.Y.Z-rc.N` runs the collector
(below), which consumes the fragments instead of adding one.

Dependabot PRs are a second exception, gated by author (`dependabot[bot]`)
rather than by title: the fragment gate is skipped on those PRs. Their
dependency bumps are not lost — the collector synthesizes them into the
`### Dependencies` section from `chore(deps)` commits at release-cut, see below.

## How to cut a release

```bash
# 1. Collect every changelog.d/ fragment (plus synthesized Dependabot bumps
#    since the last tag) into a new CHANGELOG.md version section, then delete
#    the consumed fragments. Backfills each bullet's (#PR) from git.
#    Preview first with: pnpm changelog:preview
pnpm changelog:collect -- --version v0.2.0

# 2. Review the generated section. Add a "### Security" bullet by hand if any
#    dependency bump fixed a CVE. The suggested bump printed by collect follows
#    the docs bump rules above.
$EDITOR CHANGELOG.md

# 3. Stage + commit the changelog and the fragment deletions
git add CHANGELOG.md changelog.d/
git commit -m "chore(release): v0.2.0"

# 4. Push the commit, then create + push the tag
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

For a release candidate, pass `--keep` so the fragments survive into the final
cut (`pnpm changelog:collect -- --version v0.2.0-rc.1 --keep`); drop `--keep`
only on the final `vX.Y.Z` so each fragment is consumed exactly once.

### Partial cut — release the first N of several already-merged PRs

By default the collector folds in **every** fragment sitting in `changelog.d/`.
When several PRs are already on `main` but you only want to release the earlier
ones, pass `--through <ref>`: only fragments whose adding commit is an ancestor
of `<ref>` are collected and deleted; anything merged after the boundary stays
pending for the next cut. No file-juggling, no tagging an ancestor.

```bash
# main tip has PRs #101–#104 merged; release only through #102.
git log --oneline            # find the squash commit of the last PR you want
pnpm changelog:preview -- --through <sha-of-#102>     # confirm the subset
pnpm changelog:collect -- --version v0.2.0 --through <sha-of-#102>
git add CHANGELOG.md changelog.d/                     # #103/#104 fragments remain
git commit -m "chore(release): v0.2.0"
git push origin main                                  # ledger commit lands on main tip
git tag v0.2.0 <sha-of-#102>                           # tag the boundary — see below
git push origin v0.2.0
```

The boundary applies to synthesized Dependabot bullets too (`sinceTag..<ref>`).
`--through` defaults to `HEAD`, so an unqualified cut is unchanged.

**Where the tag goes — read this, it is the one non-obvious part.** Trunk-based
flow (no release branches — see the rules at the end of this doc) means the
`chore(release): v0.2.0` commit — the one that writes the `## [v0.2.0]` section
and deletes the consumed fragments — always lands on **main tip**, a descendant
of #104. That is correct and intended: `CHANGELOG.md` is a forward ledger. What
you then tag/deploy depends on what "release the first half" means for you:

- **First-half _code_ too** (the build must not contain #103/#104): tag the
  boundary commit's sha (`git tag v0.2.0 <sha-of-#102>`) and deploy that sha.
  Its tree predates #103/#104, so the artifact matches the bullets. The tagged
  commit will not itself contain the `## [v0.2.0]` changelog section — that is
  expected; the section lives on main tip.
- **Full main-tip build, changelog split only** (all of #101–#104 code ships,
  but their notes are split across v0.2.0 and the next version): tag main tip.
  Be aware this means v0.2.0's build contains #103/#104 code whose bullets are
  deferred — the changelog understates the build. Only do this deliberately.

If a prior tag already sits between `<ref>` and HEAD, pass `--since <that-tag>`
so the Dependabot range stays `<that-tag>..<ref>` (the default `previousTag()`
describes from HEAD, not the boundary).

The push of the `v*` tag fires `.github/workflows/release.yml`, which:

1. Validates the tag format (fails fast on typos).
2. Builds `apps/web` standalone bundle, packs as `web-v0.2.0.tar.gz`.
3. Generates SLSA L3 provenance.
4. Runs the supply-chain orchestrator (SBOM + L2 provenance + cosign keyless signature + license scan).
5. Creates the GitHub Release with auto-generated notes from commit subjects since the previous tag.
6. Attaches the tarball + provenance + SBOM as release assets.
7. Marks the release as **Pre-release** if the tag matches `-rc.<N>`, otherwise **Latest**.

## Tag → deploy order (the operational rule)

`release.yml` (tag push) and `_deploy-aws.yml` (manual) are independent workflows. The tag itself only produces the GitHub Release artifact + SLSA provenance + SBOM. **Tagging never touches AWS.** A manual deploy after the tag is what moves staging / production to the new version.

The deploy pipeline does its own Docker image build (it does NOT call `_build-image.yml`). It resolves `BUILD_VERSION` in this order:

1. Explicit `-f build_version=...` input (strips leading `v`)
2. `git describe --exact-match` — if a git tag points at HEAD, that tag becomes the value
3. Fallback: `sha-<short-7-char>`

So in the canonical flow, **no extra flag is needed** — just tag, then deploy.

### Production: tag, then deploy

```bash
# 1. Collect fragments + synthesized Dependabot bumps into a new CHANGELOG.md
#    version section, deleting consumed fragments.
pnpm changelog:collect -- --version v0.2.0

# 2. Review the generated section. Add a "### Security" bullet by hand if any
#    dependency bump fixed a CVE.
$EDITOR CHANGELOG.md
git add CHANGELOG.md changelog.d/
git commit -m "chore(release): v0.2.0"
git push origin main

# 3. Tag and push.
git tag v0.2.0
git push origin v0.2.0
#    → release.yml builds the tarball + SLSA + SBOM, creates the GitHub Release

# 4. Deploy the same commit to production. The build-images job runs
#    `git describe --exact-match HEAD`, picks up v0.2.0, and bakes
#    BUILD_VERSION=0.2.0 into the image.
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=all
#    → footer renders "© 2026 Afframe. v0.2.0"
#    → /api/version returns 0.2.0
#    → Sentry release tag = 0.2.0
```

### Staging: same flow for RCs

```bash
git tag v0.2.0-rc.1
git push origin v0.2.0-rc.1
gh workflow run _deploy-aws.yml -f environment=staging
#    → footer reads "© 2026 Afframe. v0.2.0-rc.1"
```

### Already deployed, want to align the footer

If you deployed an untagged commit and then tagged it (deploy-before-tag), the running image still carries `BUILD_VERSION=sha-<short>`. Two ways to align:

```bash
# (a) Rebuild at the tagged commit. The auto-detect picks up the tag.
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f force_rebuild_images=true
#    → footer reads v0.2.0 after the deploy
```

```bash
# (b) Skip the rebuild — point production at the tagged image that
#     already exists in ECR (e.g. staging built it earlier).
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f image_tag_override=0.2.0
```

Note: `image_tag_override` skips the build-images job entirely. The image already exists with its baked-in BUILD_VERSION; this flow simply repoints CDK at it.

### Explicit override (rare)

`-f build_version=...` is for hotfix / cosmetic-relabel cases when the auto-detect picks the wrong thing, or when you want to deploy an untagged commit but display a specific version string. Almost never needed.

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f build_version=v0.2.0
#    → forces BUILD_VERSION=0.2.0 regardless of git state
```

### Per-service coherence

`detect-changes` may rebuild only the services whose source actually changed (e.g. only `web`). Unchanged services reuse their last-deployed sha-tagged image. After a `git tag v0.2.0 && deploy`, that means:

- **web** rebuilt from the tagged commit → footer `v0.2.0`
- **api / admin** reused from the previous deploy → `/api/health` still returns `sha-<oldshort>`

To make all three services show the same version, pair with `force_rebuild_images=true`:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f force_rebuild_images=true
```

### What happens if you do it out of order

| Order                    | Image `BUILD_VERSION` | Footer        | GitHub Release                                    |
| ------------------------ | --------------------- | ------------- | ------------------------------------------------- |
| **tag, then deploy**     | `0.2.0`               | `v0.2.0`      | exists ✓                                          |
| **deploy, then tag**     | `sha-<short>`         | `sha-<short>` | exists, but AWS is out of sync until you redeploy |
| **only deploy (no tag)** | `sha-<short>`         | `sha-<short>` | no release ever                                   |
| **only tag (no deploy)** | unchanged             | unchanged     | exists, but no AWS environment runs it            |

The prod-truthful default is **tag → deploy**.

## Version visibility at runtime

`BUILD_VERSION` flows from the image tag into the running app:

| Surface                                   | Where it's read                                      |
| ----------------------------------------- | ---------------------------------------------------- |
| Footer line on every auth/onboarding page | `<BuildVersion />` from `@workspace/ui/brand-assets` |
| `GET /api/version` (web)                  | `apps/web/app/api/version/route.ts`                  |
| `GET /api/health` (api)                   | `apps/api/src/health/health.controller.ts`           |
| OpenAPI `info.version`                    | `apps/api/src/openapi.ts`                            |
| Sentry `release` tag                      | `apps/api/src/main.ts`                               |

On local dev, `BUILD_VERSION` is unset and the helper falls back to `"dev"`. On staging/production, the Docker image build sets it from the metadata-action's `version` output (semver when tagged, `sha-<short>` otherwise).

## What we intentionally do NOT do (yet)

- **No Changesets, release-please, or semantic-release.** Manual tagging is fine for a pre-1.0 product with one decider.
- **No automated `version` field bumps** in `package.json`. The 18 workspace packages stay at `0.0.1`/`0.0.0` until we adopt a tool. The git tag is the source of truth for "what's released".
- **No release branches.** Trunk-based — tag any commit on `main` you trust.
- **No auto-derived changelog prose.** Bullets stay hand-written (richer than PR titles), but each PR ships them as a `changelog.d/` fragment instead of editing a shared file; the release collector assembles them. We deliberately did NOT adopt Changesets/towncrier/changie — the homegrown fragment scripts already match the single-version, manual-tag, non-npm model without a new runtime or binary to track. GitHub Release notes still auto-fill from commit subjects, separately.

When the team grows or v1 ships, revisit. Until then: simple wins.

## Related

- `.github/workflows/release.yml` — the tag-triggered pipeline
- `.github/workflows/_supply-chain.yml` — SBOM + cosign + provenance
- `.github/workflows/_build-image.yml` — Docker image tagging strategy
- `docs/conventions/COMMITS.md` — commit message format
- `CHANGELOG.md` — release log
