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
