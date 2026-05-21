# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Tag convention: `v<MAJOR>.<MINOR>.<PATCH>` for stable releases, `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` for release candidates. See [`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md) for the full rule set + cut workflow.

## [Unreleased]

## [v0.2.1] — 2026-05-21

CI + observability follow-ups to v0.2.0. No app surface changes.

### Fixed

- `_supply-chain.yml` now downloads the tarball workflow artifact before computing its digest. Before this, the supply-chain job ran in a fresh runner with no access to the tarball built in `release.yml`'s `build` job, and `sha256sum` failed with "No such file or directory" — surfaced on the first v0.2.0 release. From v0.2.1 onward, every GitHub Release attaches all four artifacts: tarball, SLSA L3 `.intoto.jsonl`, CycloneDX `sbom.cdx.json`, and `*.cosign.bundle`. (#240, AFF-229)

### Changed

- `_deploy-aws.yml` decouples the image's `BUILD_VERSION` env from `IMAGE_TAG`. The deploy pipeline resolves `BUILD_VERSION` in order: (1) explicit `build_version` input, (2) `git describe --exact-match` to discover a tag at HEAD, (3) fallback `sha-<short-7-char>`. `IMAGE_TAG` stays `sha-<full>` to preserve ECR deterministic pin + rollback semantics + the `image_tag_override` flow. Result: after `git tag v0.2.1` the deploy auto-bakes `BUILD_VERSION=0.2.1` without any extra flag — the runtime footer, `/api/version`, OpenAPI `info.version`, and Sentry `release` tag all read `v0.2.1`. Before this change everything ran on a 40-char full SHA regardless of git tag state. (#241)
- `docs/conventions/RELEASES.md` rewritten to match actual mechanics: corrected "Tag → deploy order", added per-service-coherence note (`force_rebuild_images=true` to align unchanged services), documented the `build_version` escape hatch. (#241)
- `docs/runbooks/DEPLOY.md` corrected: `release.yml` does not call `_deploy-aws.yml` — they are independent workflows. (#241)

## [v0.2.0] — 2026-05-21

First tagged release. Establishes the brand surface, release + version conventions, AWS deploy pipeline, and Storybook + test infrastructure on top of the existing app shell.

### Brand surface

- `@workspace/ui/brand-assets` package — single source of truth for logo, brand text, URLs, emails, social handles.
- `<Logo>` SVG component — 4 variants (horizontal, stacked, logomark, wordmark) × 9 tones (6 explicit + 3 adaptive sugar).
- `<BrandName>`, `<BrandTagline>`, `<BrandLegalName>`, `<BrandCopyrightHolder>`, ... — 19 i18n-localized brand-text components + `getBrandText()` server resolver.
- Non-localized constants — `BRAND_SUPPORT_EMAIL`, `BRAND_MARKETING_URL`, `BRAND_GITHUB_URL`, ... with `<BRAND-*>` placeholder pattern for slots awaiting copy.
- Brand color tokens in `globals.css` — `--brand-primary-light/dark`, `--brand-admin-light/dark`, `--brand-mono-light/dark`, exposed as Tailwind utilities.
- Adaptive favicon set across web/admin/api — SVG with internal `@media (prefers-color-scheme)`, dual PNG raster with `<link media>`, PWA manifest icons, apple-touch-icon, legacy `.ico`. Regenerated from tokens via `scripts/build-favicons.py`.
- Production-deploy guard — `scripts/check-brand-placeholders.mjs` fails the deploy when unfilled `<BRAND-*>` placeholders remain (currently bypassed via `CHECK_BRAND_STRICT=false` while content lands — tracked in AFF-228).
- Logo SVG sources committed in-repo under `packages/ui/src/brand-assets/source/`; path data extracted into typed TS modules via `scripts/build-logo-paths.mjs`.
- AGENTS.md + brand-assets README + UI README document the surface end-to-end.

### Release + version conventions

- Tag format: `v<MAJOR>.<MINOR>.<PATCH>` for stable, `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` for release candidates. Regex-enforced in `release.yml`.
- `docs/conventions/RELEASES.md` — bump rules, RC promotion flow, **tag → deploy** operational order, `image_tag_override` / `force_rebuild_images` escape hatches, truth table for ordering trade-offs.
- `release.yml` auto-marks `-rc.*` tags as GitHub Pre-release.
- Build version surfaced at runtime — `getBuildVersion()` reads `BUILD_VERSION` env at SSR; auth + onboarding footers render `© {year} {brand}. v0.2.0`. Local dev falls back to `dev`.
- AGENTS.md `Releases` section + COMMITS.md cross-link.

### Infrastructure + deploys

- AWS CDK v2 single-account stacks (network, data, app, security, observability, backup), eu-central-1.
- ECS Fargate task with init containers for DB migrations + OpenFGA bootstrap.
- Cloudflare Tunnel for staging + production routing.
- Container image tagging via `docker/metadata-action` — `sha-<short>`, `branch-<name>`, `<semver>`, `latest` on main. Build args propagate `BUILD_SHA`, `BUILD_TIME`, `BUILD_VERSION` into image labels + runtime env.
- `_deploy-aws.yml` workflow — manual via `gh workflow run`, per-env SSM tracking, change-detection-driven image build skips, production approval gate.
- Public Swagger UI at `/v1/docs` with brand-customized title + favicon.
- `/api/version` (web) + `/api/health` (api) expose `BUILD_SHA`, `BUILD_TIME`, `BUILD_VERSION`.

### Release artifacts + supply chain

- SLSA L3 provenance for `apps/web` tarball on every tag.
- CycloneDX SBOM + cosign keyless signature attached to every GitHub Release.
- License-check + osv-scanner gates in CI.
- `scripts/sbom-diff.mjs` fails on new copyleft licenses or HIGH/CRITICAL CVEs.

### Testing + Storybook

- Storybook 10 + Vite + addons (docs, a11y, themes, links, chromatic, vitest, test-runner).
- 28 component interaction tests (play functions).
- 21 viewport presets (iPhones, iPads, MacBooks, Windows PCs).
- Vitest coverage (v8 provider).
- axe-playwright a11y checks in CI (warn mode).
- WebKit (Safari) testing via Playwright.
- 506 unit tests across 114 files, 66 dedicated to `<Logo>`.

### Documentation

- ARCHITECTURE.md system reference.
- AGENTS.md `Brand Assets` + `Releases` sections.
- `docs/conventions/RELEASES.md`, `docs/conventions/COMMITS.md`, `docs/conventions/CI-POLICY.md`, `docs/conventions/code-naming.md`, `docs/conventions/typescript.md`.
- Brand-assets README with full API surface + variant/tone tables.
- ADRs covering architecture decisions (see `docs/adr/`).

### Changed

- Auth + onboarding layouts use `<Logo>` (5 sites previously rendered the `WalletMinimal` lucide placeholder).
- Admin auth metadata uses `getBrandText()` instead of hardcoded "Afframe Admin".
- API Swagger site title reads brand name from i18n.
- `apps/api/src/main.ts` registers helmet before `useStaticAssets` so security headers attach to static asset responses.
- CONTRIBUTING.md rewritten with closed-beta rules and pre-merge gates.
- LICENSE — All Rights Reserved (closed beta).
- `.gitignore` expanded (`_junk/`, `.claude/`, `.auth`, playwright artifacts).

### Removed

- `packages/shared/src/brand.ts` (`BRAND`, `AUTH_ASIDE_LOGOS`, `type Brand`) — migrated to `@workspace/ui/brand-assets`.
- `WalletMinimal` re-export from `@workspace/ui/lib/icons` — replaced by `<Logo>`.

### Fixed

- `apps/api/Dockerfile` circular dependency on `builder` stage (public/ COPY moved to runner).
- AWS deploy auto-rollback when migrations applied during the deploy.
- Prod safety + visibility hardening (CR-02, CR-03, HI-07).
- Infra hygiene bundle (HI-03, ME-01/07/08/09, LO-03).
- Batched deploy hardening (PR M code-review items).
- Log-group pre-create only for groups CFN owns.
