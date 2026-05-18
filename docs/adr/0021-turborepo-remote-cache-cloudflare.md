# 21. Turborepo Remote Cache on Cloudflare Workers + R2

> **Updated**: Live host inventory is in [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md). This ADR is the decision record; "follow-up" notes below about `cache.afframe.com` custom domain have since landed.

- Status: Accepted
- Date: 2026-05-18
- Deciders: Hleb

## Context and Problem Statement

After PR-A (cache/composite foundations) and PR-B (`--affected` + storybook path-filter) the CI wall sat at ~2.8 min on non-UI PRs and ~4.1 min on UI PRs. PR-C (storybook test-runner sharding + content-addressed turbo cache key on the in-GH cache) regressed wall to 4.3 min on the first run because the GitHub Actions cache quota was 99% full (173 entries, ~3.5 GiB of Docker buildx blobs, ~2 GiB of pnpm node-cache, ~1.8 GiB of Playwright browsers). The content-addressed key thrashed against the LRU cap: new cache entries evicted older ones before they could be reused on cross-branch hits.

Target: sub-3-min wall on all PR types. A remote cache outside the GH Actions 10 GiB quota is the only path to that target without compromising the existing pre-commit + pre-push + content-addressed-fallback layers.

Candidates evaluated:

- **Vercel Remote Cache** — Hobby tier ToS forbids commercial use. HAPD is a commercial product; rejected.
- **OVH VPS Turbo cache** (the `setup-turbo-cache` skill provisions this) — Prague-hosted; GitHub-hosted runners live in Azure US/EU. RTT 50-150 ms transatlantic-ish kills the savings. Rejected.
- **AWS S3 + Lambda + API Gateway** — fits existing CDK pattern but adds ~$1-2.50/mo dominated by S3 → Azure-runner egress at $0.09/GB. Rejected on cost when a free option exists.
- **Cloudflare R2 + Workers** — chosen. R2 has zero egress fees (the line item that dominated the AWS estimate disappears). Cloudflare is already in our stack (Tunnel for ECS routing in `_deploy-aws.yml:232`, DNS for `afframe.com`). Worker free tier (100k req/day) and R2 free tier (10 GB storage, 1M Class A, 10M Class B) both cover our projected solo-dev CI volume by 2-3 orders of magnitude.

## Decision

Deploy `AdiRishi/turborepo-remote-cache-cloudflare` v4.0.0 as a Cloudflare Worker (`turbo-cache`) backed by an R2 bucket (`turbo-cache-prod`). The Worker is served at `cache.afframe.com` via a Cloudflare custom-domain route on the existing `afframe.com` zone (`wrangler.jsonc` declares `custom_domain: true` so wrangler auto-manages the DNS record). The Turbo CLI in CI consumes it via `TURBO_API`, `TURBO_TOKEN`, `TURBO_TEAM`, `TURBO_REMOTE_CACHE_SIGNATURE_KEY` env vars set at workflow level in `ci.yml`, `e2e.yml`, `release.yml`. Cache integrity is enforced by HMAC-SHA256 signatures verified client-side in the CLI (the Worker is a dumb passthrough).

> Note: the original PR-D plan deferred custom domain to a follow-up and used a `*.workers.dev` subdomain. The first deploy attempt failed because the account had no workers.dev subdomain registered (Cloudflare auto-creates one only on the first dashboard visit to Workers & Pages, requiring a manual click). Custom domain on a zone we already own (`afframe.com`) sidesteps that onboarding entirely and is the long-term right answer regardless. Decision flipped early.

## Consequences

Positive:

- Cache lives outside the 10 GiB GitHub Actions cache quota — no LRU eviction pressure between pnpm / Playwright / buildkit / turbo.
- Cross-branch sharing works for every branch (R2 is a shared bucket; no per-branch scope rules).
- Zero monthly cost at current scale (R2 free tier headroom 50-99% across every line; Workers free tier 98% headroom).
- Fail-open: `continue-on-error: true` on the composite's "Configure Turbo Remote Cache defaults" step means a Cloudflare outage cannot red CI; turbo falls back to local `.turbo` (still populated by the PR-C content-addressed GH Actions cache).
- Cache poisoning defence: HMAC verification is client-side, so a compromised Worker cannot sign artifacts the CLI will trust.

Negative / trade-offs:

- Cloudflare becomes a Tier-3 CI dependency (registered in `docs/INVENTORY.md`). Not Tier-1 because of the fail-open path.
- Vendored upstream source (`infra/cloudflare/src/`) requires manual upgrade per `infra/cloudflare/SOURCE.md`. Upstream is small (~500 LOC), MIT-licensed.
- `vars.TURBO_API` is a manual GitHub repo variable set after first Worker deploy. One-time setup friction.
- New tooling: Wrangler CLI added to dev surface (not used by app code, only the deploy workflow).

Follow-up work required:

- After first Worker deploy: set GitHub repo variable `TURBO_API` to `https://cache.afframe.com`. Until then, remote cache stays disabled and turbo uses local + GH Actions cache only.
- Observe cache hit-rate over first 2 weeks via `wrangler tail` and turbo run summaries (`cache hit (remote)` lines). If hit rate < 30% on small PRs, investigate input-hash drift.
- Consider custom domain `cache.afframe.com` in a follow-up (requires Cloudflare DNS edit + `routes` block in `wrangler.jsonc`). Purely cosmetic.
- Quarterly: rotate `TURBO_TOKEN` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` per runbook.

## Alternatives considered

- **Vercel Remote Cache** — Hobby tier limited to "personal, non-commercial use." HAPD is a commercial product; rejected on ToS.
- **OVH VPS Turbo cache** — Prague is geographically wrong for GH-hosted Azure runners; transatlantic RTT (~50-150 ms) costs 3-6 s per CI job on cache fetches alone, defeating the speed-up. User also explicitly rejected.
- **AWS S3 + Lambda + API Gateway** (via `NimmLor/cdk-turborepo-remote-cache` or hand-rolled CDK) — works, fits the existing CDK pattern + GitHub OIDC trust, ~$1-2.50/mo dominated by S3 → Azure egress. Rejected when R2 delivered the same at $0 with no egress.
- **AWS Lambda + R2 storage** (hybrid) — gets free egress but splits the system across two providers for marginal gain. Rejected for complexity.
- **In-GH Actions cache only, with a nightly prune workflow** — would keep us inside the 10 GiB cap but caps cross-branch sharing at GH's per-branch scope rules. Won't deliver the same hit rate on first-PR-after-main flows.
- **Larger paid GitHub runners (`ubuntu-latest-4-cores` and up)** — NOT free on public repos in 2026 (per GH 2026-01-01 pricing changelog); standard public-repo free allowance covers only the standard `ubuntu-latest`. Rejected on cost.
- **Self-hosted runners** — `~/.claude/CLAUDE.md` and project CI policy forbid on public repos due to PR-fork security. Rejected.

## See also

- [ADR-0007](0007-mvp-single-account-cdk-only.md) — AWS-side single-account CDK choice (now joined by Cloudflare for cache only)
- [ADR-0019](0019-status-page-and-uptime-monitoring.md) — pattern precedent for Cloudflare-fronted self-hosted OSS
- `docs/runbooks/CI-TURBO-REMOTE-CACHE.md` — operator runbook (deploy, rotation, debugging)
- `docs/conventions/CI-POLICY.md` § Remote cache
- `infra/cloudflare/SOURCE.md` — vendoring provenance + upgrade procedure
- `infra/cloudflare/wrangler.jsonc` — Worker config
- `infra/cloudflare/src/` — vendored Worker (entry: `src/index.ts`)
- `.github/workflows/_deploy-cloudflare.yml` — deploy workflow
- `.github/actions/setup/action.yml` — composite consumer step
- Turborepo Remote Caching docs: <https://turborepo.dev/docs/core-concepts/remote-caching>
- Cloudflare R2 pricing: <https://developers.cloudflare.com/r2/pricing/>
- Cloudflare Workers pricing: <https://developers.cloudflare.com/workers/platform/pricing/>
