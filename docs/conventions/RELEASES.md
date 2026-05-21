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

## How to cut a release

```bash
# 1. Move your bullets from [Unreleased] to a new section in CHANGELOG.md
#    e.g. ## [v0.2.0] — 2026-05-21
$EDITOR CHANGELOG.md

# 2. Stage + commit the changelog
git add CHANGELOG.md
git commit -m "chore(release): v0.2.0"

# 3. Push the commit, then create + push the tag
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

Docker images get a matching `<semver>` tag automatically via `docker/metadata-action` in `_build-image.yml` when a tagged commit is built.

## Tag → deploy order (the operational rule)

`release.yml` (tag push) and `_deploy-aws.yml` (manual deploy) are independent. The tag doesn't deploy anything to AWS by itself; it only creates the GitHub Release artifact + signed SBOM. For production to actually run the tagged version, the **tag must exist before the image is built**.

**Production rule:** tag first, then deploy.

```bash
# 1. Tag the commit you're about to ship.
git tag v0.2.0
git push origin v0.2.0
#    → release.yml builds the tarball + SLSA + SBOM, creates the GitHub Release

# 2. Then deploy that same commit to production.
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=all
#    → _build-image.yml runs at the tagged commit
#    → docker/metadata-action sees the v0.2.0 tag, emits BUILD_VERSION=0.2.0
#    → image gets the `0.2.0` tag in ECR
#    → footer renders "© 2026 Afframe. v0.2.0"
#    → /api/version returns 0.2.0
```

**Staging rule:** same flow for RCs.

```bash
git tag v0.2.0-rc.1
git push origin v0.2.0-rc.1
gh workflow run _deploy-aws.yml -f environment=staging
#    → footer reads "© 2026 Afframe. v0.2.0-rc.1"
```

### Already deployed, want to align footer to the tag?

If you already deployed at a commit + then tagged it (deploy-before-tag), the running image still carries `BUILD_VERSION=sha-<short>`. To swap to the semver-labelled image, rebuild + redeploy from the tagged commit:

```bash
# Force the image build to rerun at the tagged commit. Without
# force_rebuild_images the detect-changes job will skip image builds
# (no app source changed since last deploy) and reuse the sha-tagged image.
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f force_rebuild_images=true
```

Or, if the image with the `0.2.0` tag already exists in ECR (e.g. you previously deployed staging from the tag), point production at it directly without a rebuild:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f image_tag_override=0.2.0
```

### What happens if you do it out of order

Order matters because `docker/metadata-action` reads the tag at image-build time, not retroactively:

| Order                    | Image `BUILD_VERSION` | Footer        | GitHub Release                                     |
| ------------------------ | --------------------- | ------------- | -------------------------------------------------- |
| **tag, then deploy**     | `0.2.0`               | `v0.2.0`      | exists ✓                                           |
| **deploy, then tag**     | `sha-<short>`         | `sha-<short>` | exists, but prod is out of sync until you redeploy |
| **only deploy (no tag)** | `sha-<short>`         | `sha-<short>` | no release ever                                    |
| **only tag (no deploy)** | unchanged             | unchanged     | exists, but no AWS environment runs it             |

Mixing is fine for one-off audit snapshots, but the prod-truthful default is **tag → deploy**.

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
- **No automated changelog generation.** Hleb edits `CHANGELOG.md` manually as part of the cut. GitHub Release notes auto-fill from commit subjects, separately.

When the team grows or v1 ships, revisit. Until then: simple wins.

## Related

- `.github/workflows/release.yml` — the tag-triggered pipeline
- `.github/workflows/_supply-chain.yml` — SBOM + cosign + provenance
- `.github/workflows/_build-image.yml` — Docker image tagging strategy
- `docs/conventions/COMMITS.md` — commit message format
- `CHANGELOG.md` — release log
