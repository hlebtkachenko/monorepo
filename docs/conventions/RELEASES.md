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

For now: **Hleb only**. Tagging is a manual, human-gated act. No automation pushes tags.

This keeps the release cadence tight and predictable while the product surface is still fluid.

## Changelog discipline

Every non-release PR must add one bullet under `CHANGELOG.md` `## [Unreleased]`
before review. This applies to docs, dependencies, CI, infra, and internal
changes. Use:

```bash
pnpm changelog:add -- --category Changed --entry "..."
```

The helper inserts at the top of the requested category and preserves existing
entries, which keeps parallel agent work from overwriting another PR's notes.
Release PRs are the only exception: a PR titled `chore(release): vX.Y.Z` or
`chore(release): vX.Y.Z-rc.N` moves the current Unreleased bullets into the new
version section and does not add a new Unreleased bullet.

Dependabot PRs are a second exception, gated by author (`dependabot[bot]`)
rather than by title: the changelog gate is skipped on those PRs. Their
dependency bumps are not lost, they are recorded at release-cut instead of
per-PR, see "How to cut a release" below.

## How to cut a release

```bash
# 1. Review the Dependabot PRs merged since the last tag (they skipped the
#    per-PR changelog gate) and write one summary bullet by hand.
git log --oneline <last-tag>..HEAD --grep='^chore(deps)'

# 2. Move the [Unreleased] bullets into a new section in CHANGELOG.md, add a
#    synthesized "### Dependencies" bullet from step 1 (and "### Security"
#    if any bump fixed a CVE), e.g. ## [v0.2.0] — 2026-05-21
$EDITOR CHANGELOG.md

# 3. Stage + commit the changelog
git add CHANGELOG.md
git commit -m "chore(release): v0.2.0"

# 4. Push the commit, then create + push the tag
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

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
# 1. Review the Dependabot PRs merged since the last tag (they skipped the
#    per-PR changelog gate) and write one summary bullet by hand.
git log --oneline <last-tag>..HEAD --grep='^chore(deps)'

# 2. Move bullets from [Unreleased] to a new section in CHANGELOG.md, adding
#    a synthesized "### Dependencies" bullet from step 1 (and "### Security"
#    if any bump fixed a CVE).
$EDITOR CHANGELOG.md
git add CHANGELOG.md
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
- **No automated changelog generation.** Every non-release PR adds its own `CHANGELOG.md` `## [Unreleased]` bullet. The release PR moves those bullets into the new version section. GitHub Release notes auto-fill from commit subjects, separately.

When the team grows or v1 ships, revisit. Until then: simple wins.

## Related

- `.github/workflows/release.yml` — the tag-triggered pipeline
- `.github/workflows/_supply-chain.yml` — SBOM + cosign + provenance
- `.github/workflows/_build-image.yml` — Docker image tagging strategy
- `docs/conventions/COMMITS.md` — commit message format
- `CHANGELOG.md` — release log
