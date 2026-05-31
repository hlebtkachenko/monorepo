# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Tag convention: `v<MAJOR>.<MINOR>.<PATCH>` for stable releases, `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` for release candidates. See [`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md) for the full rule set + cut workflow.

## [Unreleased]

## [v0.2.4] — 2026-06-01

Largest release since v0.2.0. Introduces the public API v1 surface, the Vault-on-VPS secrets architecture (M1–M10), AWS cost-runaway protection, and env power controls — plus a security-findings sweep and a CI/supply-chain hardening pass.

### Added

- **Public API v1** — `/v1` release candidate: Scalar API reference, generated SDK + MCP tool surface + CLI, OpenAPI registry codegen, status + feedback endpoints, topnav/brand polish.
- **Secrets architecture — Vault → SSM (M1–M10)** — Vault-on-VPS bring-up assets (compose, HCL, env, logrotate); `SecretsBootstrap` CDK stack (KMS auto-unseal + IAM user); Vault AWS IAM auth verifier + operator-admin policy (M3 / M3.5); vault-to-SSM sync (script + systemd + drift CI); M4 CDK flip of 3 workflow secrets to SSM SecureString + `vault-ssm-sync` IAM user; restic backup + DR-drill assets; `linear-sync.yml` fetches `LINEAR_API_KEY` from Vault via OIDC (M5); `infisical-scan` gate.
- **AWS cost-runaway protection** — account-wide $55 production cost guard; always-on cost reduction + hardened cost kill-switch.
- **env power** — `env-power` workflow (resume / warm-pause / cold-pause) with auto-cold-pause on staging + prod and an `all`-envs matrix fan-out. Auto-pause binds an edge "app is asleep" page served by the `cloudflare-sleeping` worker (the in-app `/sleeping` twin was dropped).
- **ECS Exec** enabled on the App stack.
- **admin** allowlist now read from a database table.

### Changed

- All Docker base images pinned by digest (Scorecard `PinnedDependencies`). (#300)
- CI / supply-chain hardening: `timeout-minutes` on required jobs; corrected stale action version comments; `workflow-lint` runs on every PR so required checks always report; secret tooling hardened (gitleaks Vault rule, deploy gate, scoped access, runbooks).
- Dependency bumps: production (31), dev (37), and GitHub Actions (10) groups; codegraph MCP server wired in.
- Docs: secrets M-series rewrites with an honest DR caveat, VAULT-OPS escrow-location correction, Czech-accounting KB roadmap, GSD references removed; `.context/` gitignored.
- `patch-emails.sh` deploy helper scoped to `/app/apps` instead of `/app` (perf).

### Fixed

- **admin** sign-in now always surfaces "invalid email or password" after a Better Auth success-then-fail.
- **api** full horizontal logo + topnav polish; `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_TRANSPORT` wired on the api container.
- **infra**: ECS Exec agent crash on read-only rootfs; `_app_migrations` checksum-schema alignment across bootstrap paths; CDK replace-guard drops `Logs::LogGroup`; `BUILD_VERSION` shows the nearest release tag for untagged deploys; migration rollback / checksum safety.

### Security

- Remediated the open GitHub security findings: `js/log-injection` (CodeQL) fixed with a recognized empty-string sanitizer (#302); three transitive dependency CVEs — `tmp`, `qs`, `uuid` — bumped via pnpm overrides (#299); base-image CVE patches (gnutls) + allowlist for unfixable entries.

## [v0.2.3] — 2026-05-21

Supply-chain follow-up to v0.2.2. No app surface changes.

### Fixed

- `_supply-chain.yml` now **extracts the release tarball before SBOM scan**. v0.2.2's SBOM was 497 bytes with a single opaque "file" component because `anchore/sbom-action` was passed `file: <tarball>` and syft never descended into the archive. v0.2.3 unpacks the tarball into `sbom-target/`, then runs syft against the directory tree — the JS cataloger walks every `package.json` under `node_modules/` in the Next.js standalone bundle and emits the full component list. (#246, AFF-229)
- `_supply-chain.yml` dropped the explicit `sbom.cdx.json.cosign.bundle` entry from the `gh release upload` list. The `./*.cosign.bundle` glob already matches it, and the duplicate listing raced with `--clobber` on v0.2.2 → HTTP 404 → the SBOM cosign signature never attached. (#246, AFF-229)

### Added

- `_supply-chain.yml` post-upload verification step. Asserts the GitHub Release has `sbom.cdx.json`, `sbom.cdx.json.cosign.bundle`, and `<package>-<version>.cosign.bundle` attached after the release-mode upload, fails the job if any is missing. Silent missing-asset bugs (as on v0.2.2) now fail loud instead of waiting for the next release attempt.

## [v0.2.2] — 2026-05-21

CI + observability follow-ups to v0.2.0. No app surface changes.

> Note: tag `v0.2.1` was burned by a second supply-chain bug in the SBOM generator (`anchore/sbom-action` rejecting `.tar.gz` as a non-directory). The fix bundle ships as v0.2.2 instead. The v0.2.1 tag remains on the remote as a dangling reference with no GitHub Release attached.

### Fixed

- `_supply-chain.yml` now downloads the tarball workflow artifact before computing its digest, AND passes it to `anchore/sbom-action` as `file:` instead of `path:`. `path:` treats the input as a directory (`syft dir:…`) and rejects a `.tar.gz` with "not a directory" — surfaced on both v0.2.0 and the burned v0.2.1 attempts. `file:` lets syft auto-decompose the tarball into a meaningful SBOM. From v0.2.2 onward, every GitHub Release attaches all four artifacts: tarball, SLSA L3 `.intoto.jsonl`, CycloneDX `sbom.cdx.json`, and `*.cosign.bundle`. (#240, this release, AFF-229)

### Changed

- `_deploy-aws.yml` decouples the image's `BUILD_VERSION` env from `IMAGE_TAG`. The deploy pipeline resolves `BUILD_VERSION` in order: (1) explicit `build_version` input, (2) `git describe --exact-match` to discover a tag at HEAD, (3) fallback `sha-<short-7-char>`. `IMAGE_TAG` stays `sha-<full>` to preserve ECR deterministic pin + rollback semantics + the `image_tag_override` flow. Result: after `git tag v0.2.2` the deploy auto-bakes `BUILD_VERSION=0.2.2` without any extra flag — the runtime footer, `/api/version`, OpenAPI `info.version`, and Sentry `release` tag all read `v0.2.2`. Before this change everything ran on a 40-char full SHA regardless of git tag state. (#241)
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
