# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Tag convention: `v<MAJOR>.<MINOR>.<PATCH>` for stable releases, `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` for release candidates. See [`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md) for the full rule set + cut workflow.

## [Unreleased]

## [v0.15.1] — 2026-07-05

Patch release: fix the release pipeline for GitHub immutable releases.

### Fixed

- **ci**: `release.yml` now creates the GitHub Release as a **draft**, lets the `build` (tarball), `slsa-provenance` (SLSA L3) and `supply-chain` (SBOM + cosign) jobs attach their assets to the mutable draft, and a new `publish-release` job flips it live only once every upload has landed. With release immutability enabled (a repo/org setting that flipped in around v0.14.0), the previous create-then-upload flow published the release immediately and every asset upload failed `HTTP 422: Cannot upload assets to an immutable release` — v0.14.0 through v0.15.0 shipped with zero assets. The SLSA generator now targets the draft via `draft-release: true` (without it its softprops step 404s the tag and forks a duplicate release). The four already-published empty releases are immutable and cannot be back-filled; this fixes it forward.

## [v0.15.0] — 2026-07-05

Minor release: the first public accounting **API surface** (`/v1/accounts`, `/v1/invoices`), Czech localization going live, and the accounting-period switcher wired to real data.

### Added

- **api**: `GET/POST /v1/invoices` — invoice CRUD over the posting model. Captures invoice-typed doklady (received → RECEIVED_INVOICE, issued → ISSUED_INVOICE) with their line/partial money decomposition; organization-scoped (FORCE RLS); runs through the server safety gate (201 apply / 202 hold), tenant + responsible user injected from the API-key principal, never the body. (#534)
- **api**: `GET /v1/accounts` + admin edit — chart-of-accounts (účtový rozvrh) read, organization-scoped; the chart exists only for DOUBLE_ENTRY periods. (#529)
- **web**: the app-shell accounting-period switcher wired to real `accounting_period` data — org-scoped read (newest-first, open/closed lock state), selection persisted server-side in the httpOnly `afframe_period` cookie. Replaces the mock. (#528)
- **i18n**: the **Czech locale** promoted live (`cs.json`, full `en.json` parity including the createOrg onboarding surface with statutory accounting terminology); the footer locale picker (web + admin) now offers CZ. (#531)
- **db**: pgTap RLS coverage for every FORCE-RLS table plus a shared vitest `globalSetup` factory across `@workspace/testcontainers`. (#542)

### Changed

- **accounting**: EU services received are split into DPH rows 5/6 (correct kód plnění per the reverse-charge rules) instead of collapsing into one row. (#539)

### Fixed

- **auth**: the invite duplicate-email race is closed with a partial unique index on the pending-invite token (migration 0044). (#530)

## [v0.14.2] — 2026-07-05

Patch release: dependency + documentation updates.

### Changed

- **deps**: openfga image pin `v1.17.1` → `v1.18.0` (constant-time preshared-key auth). The MySQL case-sensitivity CVEs + migration-008 lock window and the OIDC-audience enforcement do not apply here — the datastore is Postgres and the sidecar runs no OIDC authn. (#523)
- **deps**: every workspace `eslint` specifier aligned to the pinned `^9.39.2` override (they advertised `^10.4.1`, which the override already overrode). Zero lockfile change; eslint still resolves to `v9.39.4`. (#521)
- **docs**: the AI financial-agents plan rewritten from the stale BullMQ substrate to the shipped pg-boss lanes (ADR-0017); no BullMQ mention remains. (#522)

## [v0.14.1] — 2026-07-05

Patch release: CI + repo-tooling housekeeping.

### Changed

- **ci**: monthly tool-version pin refresh behind upstream drift (pnpm `packageManager`, CI tool binaries). (#526)
- **ci**: knip config hardened + a dead admin barrel export removed. (#525)
- **docs**: the `v0.14.0` changelog recorded (committed after the tag). (#538)

## [v0.14.0] — 2026-07-04

Minor release: **Afframe Brain v1** — the unprivileged Brain client on top of the v0.13.0 foundation, plus the server-side gate that closes the confident-wrong hole for good. The write lane still ships **OFF** (`BRAIN_RUNTIME_ACTIVE` fail-closed); nothing user-facing changes until Brain launch. Every agent write is HELD at cold start — the live end-to-end run and the launch milestones (M-live → M2 → M3 → M4 → flip) remain ahead, tracked in EPIC #524.

### Added

- **api**: the **server-side evidence gate** — ends client-scalar-only auto-apply trust. Auto-apply now requires a three-way AND (client confidence ≥ threshold **AND** the independent server veto not held **AND** a server-side evidence score green). The client's self-reported `signals` are never consumed directly: every non-server-verifiable field degrades to its worst value and a structural `extraction_failed` block forces the score sub-green, so green is **unreachable at cold start** regardless of any fitted calibration → all writes HELD. Held-write resolve enforces author ≠ approver. (#520)
- **brain / intake**: the unprivileged Brain client — a pure IR→capture adapter (rate-less / non-positive / NaN rows → `OUTSIDE_VAT` hold; money via string math, never `BigInt(Number())`), a per-tool MCP sandbox bound to the real accounting tools (DENY `resolve`/`list`-held: self-approval + injection surface), a post-calibration hard-class confidence ceiling (a fitted map cannot lift a capped class above green), isotonic calibration-refit machinery for M3 (≥10-run guard; not wired to the live path), and an honest creds-gated live-CC harness scaffold (never faked). (#520)
- **accounting / db**: persist `supply_kind` (migration 0043, additive-nullable) so the Souhrnné hlášení emits the correct kód plnění (0 = goods §64, 3 = services §9/1) instead of hardcoding 0. (#520)
- **web**: a read-only ingestion inbox — a Table archetype over `tool_call_log` surfacing the org's gated writes alongside the approvals queue (upload/OCR/extraction pipeline deferred to #518). (#520)

### Changed

- **brain**: the LOCKED `.brain/constitution.md` re-derived to the v1 **server-side HTTP boundary** (Hleb-ratified) — I1 (server-side `withOrganization` from the API-key principal), I4 (rollback unit = `tool_call_log` row + `conversation_id`; no per-row `brain_run_id` column), I5 (17 mutable / 6 append-only tables, three-way AND primary), I6 (held-write queue), I3/I10 + enforcement-map. (#520)

## [v0.13.0] — 2026-07-04

Minor release: the Afframe Brain v1 **foundation** — the server-side safety spine that lets an unprivileged agent book accounting without ever auto-applying a wrong entry unreviewed. The v1 accounting write lane ships **OFF by default** (`BRAIN_RUNTIME_ACTIVE` fail-closed), so nothing user-facing changes until Brain launch. This is the foundation layer only; the actual Brain client + first end-to-end run (M1) and the milestones beyond remain ahead.

### Added

- **api**: server-side confidence veto on the accounting write gate — a client's claimed `confidence` is now necessary but not sufficient. The server derives the dangerous signals from the payload and forces a HOLD regardless of the claim: `asset_vs_expense` at posting (in-tx `accountId`→`account.number` lookup, per-synthetic DHM aggregation over 501/502/503/504/505/511/512/513/518/548), and `unverified_vat_regime` / `vat_amount_missing` / `vat_mismatch` at capture (all non-STANDARD VAT held, STANDARD-missing-`vatAmount` held, `base×rate` mismatch held). Honest limit: a wrong VAT rate with self-consistent arithmetic and sub-40k misclassification stay underivable — human review of held writes is the master gate (full evidence contract tracked in #464). (#479)
- **api / db / web**: EPIC-R marshrutizátor wired into the write path — a per-(org, period) transaction-scoped advisory lock (`lockPeriodInTx`) serializes concurrent posts across the write gate + both approve-replay lanes, and a fail-closed admission kill-switch (`BRAIN_RUNTIME_ACTIVE`) + concurrency caps front every v1 accounting write (held-write resolve stays exempt so a human can always drain the review queue). (#479)
- **brain / intake / accounting-kb**: the Brain packages — `@workspace/brain` (calibrated confidence engine, canonical IR + provenance, the server-side gate, agent login-pack + N-1 tool sandbox + prompt-injection defense, cross-source reconcile/dedup), `@workspace/intake` (pure heterogeneous-dump parsers → Brain IR), `@workspace/accounting-kb` (vendored machine-readable KB + CZ-law taxonomy: §34 loss, PDP 343-split, OSVČ/DPFO, zahajovací rozvaha). Plus the BGTG build-ground-truth harness and ADRs 0025-0028. (#479)
- **infra**: `BRAIN_RUNTIME_ACTIVE` wired into the api task env as a context flag defaulting OFF — the agent write lane stays closed until an operator enables it at Brain launch (`cdk deploy -c brainRuntimeActive=1`), no code change. (#479)

### Fixed

- **accounting**: `closePeriod` now takes the same per-(org, period) advisory lock as the write path, closing a close-vs-post race — a roll-forward close could previously commit concurrently with an in-flight post (the closed-period guard is a BEFORE-INSERT trigger only and cannot stop a close racing a live post). (#479)

## [v0.12.4] — 2026-07-03

Patch release: organization slug hardening — a single shared reserved-name policy, a real name-to-slug pipeline, and two guard fixes from the org-scaffolding review.

### Added

- **org-provisioning**: a single shared slug + reserved-name policy (`slug.ts`) — `RESERVED_SLUGS` (grouped: routing/framework, product surface, Afframe brand, accounting domain, generic) + `isReservedSlug`, consumed by the create-org scaffolder, the `[orgSlug]` router guard, and onboarding (replacing three hand-mirrored copies). A real `slugify` pipeline: diacritic transliteration (á→a, š→s, ř→r, ú→u…), symbol words (`&`→"a", `+`→"plus"), word runs→`-`, a trailing legal-form cut (s.r.o./a.s./k.s./v.o.s./spol. s r.o./o.p.s./družstvo…), min length 3, max 48. (#475)

### Fixed

- **org-provisioning**: `pickUniqueSlug` skips router-reserved slugs so a company is never minted at an unreachable `/{slug}`. (#474)
- **web**: company archive/restore now requires the active workspace role to be owner or admin, matching the org settings mutation gate; a plain member gets a forbidden toast. (#474)
- **web**: onboarding no longer pads a short workspace name to the reserved literal `workspace` (which minted the default company at an unreachable `/workspace`); it uses the shared slugify + reserved-slug skip. (#475)
- **org-provisioning / web**: the old collapse-only slugify left `Acme, s.r.o.` → `acme-s-r-o` and mangled diacritics (`Škoda` → `koda`); now `acme` / `skoda`. (#475)

## [v0.12.3] — 2026-07-03

Patch release: the organization creation-scaffolding protocol — one call mints a ready-to-book účetní jednotka, wired into the workspace Companies hub and the org settings pages. Additive only; no existing behavior changed.

### Added

- **org-provisioning**: `@workspace/org-provisioning` — `scaffoldOrganization(input)` mints a fully-configured účetní jednotka in one atomic idempotent transaction: identity + owner membership + NACE links + vat_status + first accounting period + full směrná-osnova chart + number series + self-counterparty + peněžní-deník categories + optional signatory / OSS. Platform rows under `withAdminBypass`, accounting master-data via a nested `withOrganization(outerTx)` frame in the same transaction. (#443)
- **registries**: `@workspace/registries` — ARES v3 REST + CRPDPH SOAP + ČSÚ legal-form lookups supplying prefill suggestions (kraj / finanční úřad / spisová značka / delivery address), zero workspace deps. (#443)
- **accounting**: additive setup + lifecycle primitives — `createVatStatus` (§6/§6f/§97 ZDPH range), `seedChartFromDirectives` (materialize the směrná osnova via one INSERT…SELECT over `directive_account`), `rollForwardPeriod` (close result → close → open next účetní období). No existing domain function changed. (#443)
- **db**: migrations 0041/0042 — organization identity + config columns (IČO, sídlo split, region, delivery address, data box, contact, tax office, registry file, archived_at) and 3 org-scoped satellites (authorized person, tax representative, OSS registration) + a workspace-tier provisioning idempotency table; all in `ORGANIZATION_SCOPED_TABLES`. (#443)
- **web**: create-organization wizard (IČO → server-side ARES/DPH prefill → scaffold) on the Companies hub, plus archive/restore, an Active/Archived filter, and CSV export. The `[orgSlug]/settings` stub pages are filled — identity (identity/contact/sídlo/signatories), periods (list + roll-forward), VAT status (change / OSS / tax representative), data box. A scaffolded book auto-surfaces in the header org switcher via its active owner membership. (#443)

## [v0.12.2] — 2026-07-03

Patch release: the human half of the accounting write gate, API-key write scopes, and a repo-hygiene guard.

### Added

- **api**: held-writes review surface — `GET /v1/accounting/held-writes` lists the gated writes the confidence gate held for human review; `POST /v1/accounting/held-writes/{id}/resolve` approves (re-validates the stored payload against the original schema and executes it through the same domain path, with the approver as the responsible user) or rejects (audit-only). 404/409/403/422 seams covered; SDK + MCP regenerated (23 tools). The "Ke schválení" page gains Schválit a zaúčtovat / Zamítnout actions with an optional note. (#462)
- **api**: `accounting:write` API-key scope enforced on the three accounting write mutations via `@RequireScopes` in ApiKeyGuard — 403 names the missing scope; keys with empty scopes pass as legacy full access (warn-logged) until issued keys carry scopes. (#462)

### Fixed

- **ci**: removed a `_junk/` file force-added to the tree by #444 and added a tracked-but-gitignored guard (`git ls-files -i -c --exclude-standard` must be empty) to the CI `changes` job and lefthook pre-commit — `.gitignore` only affects untracked files, so nothing previously stopped ignored paths from being committed. (#463)

## [v0.12.1] — 2026-07-03

Patch release: Sidekick brand accent recolored to the shared purple token, UI-only, no runtime behavior change.

### Changed

- **ui**: the Sidekick brand mark, the `tone="sidekick"` IconButton, the "Ask Sidekick" context-menu item, and the admin command palette's "Ask AI" row now use the shared `--purple` token instead of hardcoded grays. The "Ask Sidekick" menu item's lucide `Sparkles` glyph is replaced with the real brand mark and its `BorderBeam` gradient wrapper is dropped. (#460)

## [v0.12.0] — 2026-07-03

Minor release: the v2 Czech accounting system — the double-entry domain, its public agent surface, and the accounting UI, landed as one piece (EPICs 1–5).

### Added

- **db**: v2 accounting ground layer — 16 migrations / 39 tables: law-as-reference directives, time-bound org links (regime, size, legal form, VAT regime), events → documents → postings spine, gapless number series, FORCE-RLS tenant isolation, trigger-maintained turnover read models, saldokonto open items. (#445)
- **accounting**: `@workspace/accounting` domain engine — classification (predkontace + `decideVat`), capture, double-entry + monetary posting, FX (daily/real/fixed), depreciation, accruals, corrections, and statutory outputs: DPH return, kontrolní hlášení, souhrnné hlášení, DPPO, financial statements (závěrka) with statement layouts. (#445)
- **api**: 15 `/v1/accounting` endpoints / 21 MCP tools — reads (journal, ledger, open items, saldokonto), 6 statutory outputs, pure `classify`, number-series discovery, and 3 gated write mutations (events, documents, postings) behind a confidence + idempotency gate (`tool_call_log`): low-confidence writes are held for human review, replays are idempotent, tenant identity comes only from the API-key principal. (#445)
- **web**: accounting module UI on live domain data — deník (journal, with event description + counterparty context), hlavní kniha, saldokonto, účtový rozvrh, accounting overview, and the "Ke schválení" held-writes review queue; Records module connected to captured documents (overview + faktury přijaté); doklad editor (Single archetype) relocated into Records. (#445)

### Fixed

- **ci**: paired-files required check no longer fails structurally on PRs over 20k changed lines — the script lists files via the paginated REST Files API instead of the line-capped diff endpoint; squawk migration lint excludes `ban-char-field` + `adding-field-with-default` (correct-by-design fixed-length codes and generated columns). (#445)
- **api**: high-severity polynomial-regex (ReDoS) in the accounting error seam replaced with linear matching; MCP generator now wires path/query/header parameters (11 accounting tools were broken at runtime). (#445)

## [v0.11.0] — 2026-07-03

Minor release: the workspace tier — the accountant-office surface for managing multiple client books, billing, and team, distinct from a client's own book.

### Added

- **web**: full workspace-tier app shell + 8 modules (Companies hub, Analyse, Audit, Inbox, Legislation, Billing, Team, Settings/Profile), built on the org tier's shell/archetype vocabulary. Green office-chrome identity, combined logomark+wordmark rail lockup. Real writes for Settings, Billing entity, and Profile display name; Companies/Team/Billing-overview backed by real data. Inbox and other undelivered surfaces (Audit backend, Legislation, Billing/Invoices) ship as designed mock UI with tracked follow-ups (#452–458), or as a prod TODO stub with the mock preserved dev-only (Inbox). (#444)

### Fixed

- **ci**: gitleaks false positives (statute citations, example IBAN, fixture DIČ) from other branches surfacing via the all-refs scan. (#444)

## [v0.10.3] — 2026-07-03

Patch release: dev-tooling and docs only, no runtime behavior change.

### Fixed

- **deps**: bounded the `js-yaml` pnpm override to `>=4.2.0 <5.0.0` — an unbounded 4.x floor let `@redocly/openapi-core` float to js-yaml 5.x and break `pnpm gen:all` SDK/MCP codegen repo-wide. (#442)

### Docs

- **api**: `/v1/structure` surface listed in the API README, CLI, and MCP guides. (#441)

## [v0.10.2] — 2026-07-01

Patch release: the app-structure discovery surface — the org navigation tree, pages, and layout archetypes, reachable by AI agents **outside the GUI** via the public API / SDK / MCP / CLI. Read-only metadata; no runtime behavior change to the app.

### Added

- **api**: read-only app-structure discovery surface for agents — `GET /v1/structure` (the ten rail modules → pages → subpages, each with route, icon, build-status, and layout archetype) and `GET /v1/structure/archetypes` (the five content-panel archetypes). Public (no API key — the IA is tenant-agnostic), auto-shipped as MCP tools (`getStructure`, `listArchetypes`) and CLI commands (`afframe structure`, `afframe archetypes`). Generated from the typed `nav.ts` trees at build time (`scripts/gen-structure.ts` → committed snapshot), drift-locked via a lefthook `structure-drift` hook; the GUI is untouched. Operability (agents acting on pages) is deferred until the accounting domain lands — see [`docs/api/AGENT-STRUCTURE.md`](docs/api/AGENT-STRUCTURE.md) + issue #439. (#438)

## [v0.10.1] — 2026-07-01

Patch release: Intrastat placeholder pages on the app skeleton, plus admin security-scan hygiene. Mock-surface + hygiene only, no runtime behavior change.

### Added

- **web**: Intrastat obligation surface on the app skeleton — a **Closing › Obligations › Intrastat** page with **Dispatches** / **Arrivals** subpages (TBA-flagged `ModulePage` placeholders, matching every other closing leaf). Statistical filing to ČSÚ via the Celní správa INTRASTAT-CZ portal (threshold 15M CZK/flow; §58 Act 242/2016 + NV 333/2021). Also documents the VAT-registration turnover watcher (rolling-12mo gauge, §6/§6c ZDPH) on Company › Overview and flags the §89/§90 VAT margin schemes as a V2-deferred scope-out. (#434)

### Fixed

- **admin**: cleared the three open security-scan findings, all on the staff-gated admin surface (two-advisor verified as real root-cause fixes). CodeQL `js/file-system-race` (TOCTOU) in the Storybook static route removed by dropping the `stat` check and reading directly with an `EISDIR` fallback; the one unpinned `storybook-builder` Docker stage pinned to the same digest as the other four (also clears a latent Dependabot mixed-reference under-update); and the `js-yaml <3.15.0` quadratic-DoS (GHSA-h67p-54hq-rp68, dev/test-only transitive) closed with a bounded pnpm override to exactly `3.15.0`. (#435)

## [v0.10.0] — 2026-07-01

Minor release: the org application surface skeleton — the full navigable sidebar built from the enriched SITEMAP, plus the four reusable content-panel archetypes.

### Added

- **web**: the full org application nav skeleton — all 10 module sidebars + 101 mock leaf `page.tsx` placeholders, generated from the enriched `docs/specs/SITEMAP.md` (two independent latest-Opus advisor passes + a confirmation pass over the Czech-accounting IA). Regime is a superset for now, marked with `TODO(regime)` swap points. Mock-backed skeleton only — no data wiring yet. (#429)
- **ui**: four content-panel archetypes so a new org page can be scaffolded by picking one and feeding it data — **Launchpad** (folder/overview card grid), **Dashboard** (KPI tiles + sparklines + chart cards + a metrics matrix on the real Table grid), and **Single** (the ABRA three-panel `RecordWorkspace` via a new additive `formLayout="panels"`), on top of the pre-existing Table gold standard. Adds a shared content-header `⋯` menu and dev-only demo routes (`/demo-table`, `/demo-launchpad`, `/demo-dashboard`, `/demo-single`) that 404 in production. (#432)

### Fixed

- **ci**: unpinned `wranglerVersion` in the `deploy-sleeping` workflow. (#428)

### Documentation

- **readme**: added the release tag-format section + a link to `docs/conventions/RELEASES.md`. (#430)

## [v0.9.0] — 2026-06-30

Minor release: the cold-pause "app is asleep" edge page, redesigned onto the in-app auth shell.

### Changed

- **infra**: redesigned the cold-pause "app is asleep" edge page (`infra/cloudflare-sleeping`) onto the in-app auth split-shell — light/dark via `prefers-color-scheme`, adaptive brand logo, a corporate watercolor aside, a header return-link + single "Try again" action, and a contact-support line. Stays self-contained static HTML (zero network deps; watercolor inlined as a base64 webp). (#426)

## [v0.8.1] — 2026-06-29

Patch release: cold-start deploy reliability — resilient RDS resume + the per-env `Audit` stack drop. No app-surface change.

### Fixed

- **deploy**: cold-start deploys now resume RDS reliably and parallel staging+prod deploys no longer collide. The brittle single `aws rds wait` (hard-capped ~30 min, which a deeply-cold DB exceeded) is replaced by a resilient poll loop (`infra/scripts/rds-resume.sh`, shared by `_deploy-aws.yml` + `power.yml`) that tolerates transitional states, re-issues start, re-asserts the cost-stop tag removal each iteration, and disables the `RdsRestartWatcher` EventBridge rule for the resume window (re-enabled on every exit via a trap) so it cannot re-stop the DB mid-resume. The account-global `Audit` CloudTrail stack is no longer deployed by the per-env workflow (it ships once, manually, like `SecretsBootstrap`) — including it made parallel deploys collide on the shared CFN stack. (#422, #423)

## [v0.8.0] — 2026-06-29

Minor release: the staff admin back-office (`apps/admin`) on the shared AppShell layout.

### Added

- **admin**: staff back-office on the AppShell chrome — rail + collapsible sidebar + header, five operator modules (Now, Customers, Ops, Platform, Staff), detail-page header tabs. Capability-gated security spine: `admin_staff_role` (7 roles), `SECTION_ACCESS` map, workspace-allowlist gate, and step-up re-auth whose 2FA requirement is server-derived from the operator's enrollment (not the request). Real-data surfaces for orgs / users / workspaces / staff / audit / impersonation / kill switches / maintenance / critical systems / domains / TLS / email deliverability / command palette. `/invites` is the production account-creation path (signup + invite token minting, capability + step-up gated, `WEB_BASE_URL`-targeted links). Plus a reusable `DataTable`, a live GitHub-Releases changelog, and an operator profile. (#409)

## [v0.7.0] — 2026-06-29

Minor release: org/period context switchers wired to real data, public sign-up closed on web, operator DB-access tooling, plus a dependency + CI tail.

### Added

- **web**: org switcher wired to real organization data; the accounting-period switcher now tracks live state. (#406, #408)

### Fixed

- **auth**: closed the public sign-up/email endpoint on web — accounts are admin-provisioned only, no self-service signup. (#405)
- **deps**: pinned `rolldown` to `1.0.0-rc.18` to fix the Storybook bundle crash. (#417)

### Operations

- **db**: fast ECS-exec `db-query.sh` read helper; hardened the EC2 bastion migrate path. (#407)
- **ci**: skip the linear-sync job on Dependabot PRs (no secret access). (#415)

### Infrastructure

- Dependency bumps: github-actions group (#414), `axllent/mailpit` (#412), `postgres` (#410, #411), dev-dependencies group (#413).

## [v0.6.3] — 2026-06-25

Patch release: pinned infra image bumps. No app-surface change. **Not deployed** — takes effect at the next CDK deploy / Vault-VPS sidecar restart.

### Infrastructure

- **edoburu/pgbouncer** `v1.25.1-p0` → `v1.25.2-p0` (#378).
- **openfga/openfga** `v1.15.1` → `v1.17.1` (both task defs, #377). No datastore migration or breaking change on this path (verified against upstream release notes; v1.18 is the next migration boundary).
- **cloudflare/cloudflared** `2026.6.0` → `2026.6.1` — AWS tunnel sidecar (`app-stack.ts`) plus the Vault-VPS sidecar in `infra/vault/compose.yaml` (tag + digest `sha256:6d91c121…`). The Vault-VPS container restart is a separate manual step on the secrets host (#393).

## [v0.6.2] — 2026-06-25

Patch release: security-only transitive dependency overrides. Clears all 23 open Dependabot alerts (+ the 3 Trivy code-scanning mirrors). No product-surface change.

### Security

- **`pnpm.overrides`** forces patched floors for transitive advisories: `undici` ≥7.28.0 (bounded to 7.x so jsdom's deep import keeps working; DB#69–75), `ws` ≥8.21.0 (DB#54), `multer` ≥2.2.0 (DB#67,68), `form-data` ≥4.0.6 (DB#58), `protobufjs` ≥7.6.3 (DB#59), `@opentelemetry/core` ≥2.8.0 (DB#61), `vite` ≥8.0.16 (DB#56,57), `js-yaml` ≥4.2.0 scoped to the 4.x line (DB#55), `tmp` ≥0.2.7 (DB#53, supersedes the earlier ≥0.2.6), `esbuild` ≥0.28.1 (DB#51), `hono` floor raised to ≥4.12.25 (DB#62–66, already shipped direct in v0.5.2).
- Lockfile regenerated from scratch; `pnpm typecheck` (23/23) + `pnpm test` (17/17) green.

## [v0.6.1] — 2026-06-25

Minor release: app-shell global header context switchers + the page-adding runbook refresh.

### Added

- **ui**: `app-header` block — `OrgSwitcher` (current-org identity + dropdown) and an accounting-period switcher for the app-shell global header. Stacked follow-up to the App Shell (#397). (#400)

### Documentation

- Refresh the app-shell page-adding runbook with page / module / tab recipes. (#402)

## [v0.6.0] — 2026-06-25

Minor release: the app-shell **Content Panel** + a persistent, structure-driven org layout. One persistent shell now mounts across every `/[orgSlug]` route; the sidebar nav is derived per module from co-located config and guarded against the route tree. (#397)

### Added

- **ui**: `data-grid-view` — a presentational grid bound to a TanStack table (resize / reorder / pin / sort / hide, keyboard nav, scroll-gated pin shadow); `ContentPanel` Inspector (panel / dialog) + a status-bar clearance contract + a five-variant taxonomy (Table / Launchpad / Dashboard / Single / Blank) with stories; `Separator` `inset` prop; a generic data-table column manager + `DetailField` extracted into `packages/ui`. `data-grid-view` added to the admin showcase; app-sidebar block stories.
- **web**: the persistent `AppShell` mounted in the org layout; a structure-driven sidebar nav (co-located `<module>/nav.ts` + an `_nav` aggregator, active module via the rail); one Overview page per module; a `nav-drift` guard (`scripts/check-nav.ts`) and a `ui-location` lefthook guard for reusable-UI placement.

### Changed

- **web**: sidebar reminders + insight are on-call — the sidebar self-hides them until a real source pushes data. The invoices Content Panel demo moved to a dev-only `/<org>/demo` route.

### Fixed

- **ui**: `useDataTable` controlled-pagination render crash; `InsightProgress`'s progress bar now has an accessible name; the content-header collapsed-tabs trigger composes `Button` instead of a raw element.

### Removed

- **web**: the legacy `SectionTabs` / `SectionStub` scaffolds and the non-module placeholder routes.

## [v0.5.2] — 2026-06-25

Patch release: bundled dependency bumps. No product-surface change. Supersedes the seven open Dependabot PRs (#384, #387–#392), applied on one branch with a single regenerated + deduped lockfile.

### Infrastructure

- **npm**: `hono` 4.12.23 → 4.12.25 (#384); production-dependencies group (12 updates, #392); dev-dependencies group (8 updates, #391). One regenerated `pnpm-lock.yaml`, `pnpm dedupe` applied.
- **GitHub Actions**: github-actions group (3 SHA-pinned action updates across all workflows). (#390)
- **Docker / compose**: `postgres:18-alpine` digest (#387); `ubuntu:26.04` devcontainer digest (#388); `axllent/mailpit` v1.30.1 → v1.30.2 (#389).

## [v0.5.1] — 2026-06-21

Patch release: dependency, CI, accessibility, observability, and docs cleanup tail. No new product surface.

### Changed

- **observability**: deduped the client-error gate into `@workspace/notify` so app + worker error capture share one path. (#368)
- **web**: code-quality leftovers from the D wave (DEV-78). (#371)

### Fixed

- **ui**: mobile a11y — 40px sheet-close target + shell tokens for the bottom nav. (#370)
- **admin**: resolve only the brand name in the root layout. (#385)
- **ci**: install deps before `wrangler-action` in `deploy-sleeping` (#364); force `joi >=18.2.1` (CVE-2026-48038) (#365); gate `sbom-diff` on version upgrades, not just added components (#367); allow the `bot` scope in PR titles (#345); post-audit corrections — wrangler deploy pin, PII redaction, override-aligned deps (#380).

### Infrastructure

- Dependency bumps: production deps (25 then 15) (#366, #375), dev deps (35) (#376), GitHub Actions group (#352), `aws-actions/amazon-ecr-login` (#374), postgres image (#359, #360, #372, #373), infra-compose images (#358).

### Documentation

- Generalize the break-glass escrow location across the repo (#349); normalize runbook filenames (drop `-RUNBOOK`, `AWS-DEPLOY`→`AWS-SETUP`, `COST-INCIDENT`) (#347).

## [v0.5.0] — 2026-06-11

Minor release: pre-v1 hardening — mobile UI, brand surface, performance, i18n — plus infra cost/alarm fixes.

### Added

- **Pre-v1 hardening (feature wave)** — UI mobile support, brand surface, performance, and i18n. (#361)

### Fixed

- **Pre-v1 hardening (fix wave)** — security, docs, observability, API platform, CI, tests, and DX. (#356)

### Infrastructure

- Cut Vault→SSM sync KMS usage to zero in steady state. (#354)
- Wire facade-generated CloudWatch alarms to the `BillingTopic`. (#355)

## [v0.4.1] — 2026-06-07

Patch release: web layout re-land and supporting docs/UX fixes.

### Changed

- **ui**: switch the AppShell content area to flex and drop `react-resizable-panels`; re-land the web layout changes after the unreviewed direct-to-main push was reverted. (#350, #351)
- **web**: rename the `/personnel` org route to `/hr` and move section titles to design tokens.

### Fixed

- App errors now open deduped Linear issues; dropped the Next.js control-flow signals from error capture. (#342)

### Documentation

- Repo-wide drift sweep (root docs, ADRs, runbooks, inventory) + register `app-context-menu` and the verify script (#341); root-doc security + freshness pass (#348).

### Added

- Theme-adaptive `favicon.svg` at the repo root for the Conductor sidebar icon. (#343)

## [v0.4.0] — 2026-06-07

Minor release: the agent human-in-the-loop (HITL) round-trip and the Telegram command/control surface.

### Added

- **Agent HITL round-trip** — complete free-text replies, timeout policy, and agent wiring (#337); hybrid asks (options + type-your-own) with crisp agent recipes (#338); answer-as-trigger so the reply WAKES the consumer with no agent polling (#340).
- **Telegram bot control plane** (PR-2) — continues the dev alert + control hub from v0.3.0. (#332)
- **Telegram command surface** — command menu + interactive button pickers (#336).
- **Security findings fan-in** (DEV-59). (#333)

### Changed

- Point the bot `/status` at `api/health` and set `ENVIRONMENT=production`. (#334)
- **ci**: gate `cdk-synth` + icon-parity heavy work on change-detection. (#335)

### Fixed

- Keep the HITL question visible + strip options when ✍️ Other is chosen. (#339)

## [v0.3.0] — 2026-06-06

Minor release: the Afframe Telegram dev alert + control hub (epic DEV-48).

### Added

- **Telegram dev alert + control hub** (`apps/bot`): a Cloudflare Worker (grammY + Hono) that is the single choke point for developer-facing Telegram I/O. Outbound `POST /ingest`; inbound `/webhook` (secret-token + Telegram user-id allowlist, constant-time auth); `/issue` + `/sns`; a scheduled health scan (cron 06:00/18:00 Prague) with a `/scan` command; and an auto-issue engine (Cloudflare D1 dedup → Linear issue in **DEV — Incidents** with source/type/risk/area labels). New `@workspace/notify` typed client. AWS CloudWatch alarms fan in via SNS (Billing + KillSwitch topics); an independent GitHub Actions watchdog monitors the bot's `/health`.
- App-side error capture + business pings wired to the bot: `apps/api` `DomainExceptionFilter` (Sentry + notify), Next.js `global-error`/`error`/`instrumentation-client` + a same-origin client-error route, `packages/workers` `permissions-drain` dead-letter, plus feedback + new-workspace pings.

### Infrastructure

- `BOT_INGEST_URL` + `NOTIFY_SHARED_SECRET` wired into the **web** + **api** task definitions; `notify-shared-secret` added to the Vault→SSM sync loop and the `vault-ssm-sync` IAM allowlist.
- Rolled out the codified account-wide $55 cost guard + cost kill-switch to AWS staging + production. The three CloudFormation budgets (`BudgetTotal`, `BudgetDataTransfer`, `BudgetAccountTotal`) are recreated with the codified config and the `AutoStopFn` gains `rds:StopDBInstance`. Deployed with `v0.2.5` alongside the env-power auto-stop wiring. (CDK budget replace — non-data-bearing; reviewed cdk diff.)

## [v0.2.5] — 2026-06-01

Patch release: code-scanning + supply-chain follow-ups to v0.2.4. No app-surface changes.

### Fixed

- `js/log-injection` (CodeQL) in the email console transport — `stripLineBreaks` now uses `/[\r\n]/g` with an empty replacement so CodeQL recognises it as a sanitizer. A `+` quantifier silently defeated the prior fix (verified against the real `js/log-injection` query with the CodeQL CLI). Behaviour is unchanged — the global flag still strips every CR/LF. (#306)

### Added

- CI workflow to seed the Cloudflare routes token into SSM. (#305)

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
