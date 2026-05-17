# CI Speedup Research — Sub-3-Minute PRs (May 2026)

**Repo:** `monorepo/madrid` (public Turborepo + pnpm; Next.js 16, NestJS, Postgres 18, Storybook 10, Playwright)
**Baseline:** PR wall 2.8-4.1 min. UI PRs ceiling on `storybook` job at 220-240 s.
**Out of scope per user:** OVH/Prague infra, cost optimization (public = free), home/office self-hosted.
**Researched:** 2026-05-17.

---

## 1. Vercel Remote Cache for arbitrary Turborepo OSS projects (2026)

**Status:** **Free for everyone**, including OSS projects not hosted on Vercel. Announced in the [Turborepo blog post](https://turborepo.dev/blog/free-vercel-remote-cache) and reflected on the [Remote Caching docs page](https://turborepo.dev/docs/core-concepts/remote-caching) and [Vercel monorepos docs](https://vercel.com/docs/monorepos/remote-caching). Fair-use limited, 7-day artifact expiry.

**Setup:** Create a Vercel scoped access token, store as `TURBO_TOKEN` secret, set `TURBO_TEAM` repo variable to your team slug. No `TURBO_API` override needed — Turborepo defaults to `https://vercel.com/api` when both vars are set. The CLI's `turbo login` / `turbo link` only works for Vercel's official cache; self-hosted custom servers need manual config.

**Tradeoff:** Vercel is US-based; the GH Actions runners are also in Azure US/EU, so latency is fine. Public-repo CI pulling a few MB of Turborepo task outputs is well under fair-use thresholds.

**Risk:** None observed. Free since 2024, still free per May 2026 page snapshot.

**Recommendation for this repo:** Adopt. The current `actions/cache@v4` strategy is single-runner-isolated — it does not help when GitHub evicts cache (10 GB limit, LRU) or when a new branch runs cold. Vercel Remote Cache shares across branches/PRs/forks.

---

## 2. Turborepo cache-key behaviour + `actions/cache@v4` (2026)

`actions/cache@v4` (latest stable) remains the standard local-cache approach. There's no Turborepo-native GH Actions cache backend; the choices are:

| Backend                                                                 | Cross-branch sharing            | Cross-fork sharing           | Eviction               | Maintenance    |
| ----------------------------------------------------------------------- | ------------------------------- | ---------------------------- | ---------------------- | -------------- |
| `actions/cache@v4` keyed on lockfile + sha                              | No (best-effort `restore-keys`) | No                           | LRU @ 10 GB repo limit | Zero           |
| `rharkor/caching-for-turbo` (GH cache backend behind a Turbo HTTP shim) | Partial                         | No                           | LRU @ 10 GB repo limit | Action update  |
| Vercel Remote Cache                                                     | **Yes**                         | **Yes** (read-only on forks) | 7-day TTL              | Zero (managed) |
| `ducktors/turborepo-remote-cache` self-hosted on AWS                    | Yes                             | Yes (if pubicly reachable)   | Custom                 | High           |

Turborepo's content-addressed hash (global + task) is unchanged in 2.x: `globalDependencies` + `globalEnv` + `inputs` + `outputs` + the resolved task DAG. The 2026 [caching ruleset](https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/caching/RULE.md) is stable; `futureFlags.globalConfiguration` is the only behavioural shift (folds `global.inputs` into task hashes instead of the global hash).

**Recommendation:** Switch from `actions/cache@v4` (Turborepo cache only) to Vercel Remote Cache for `turbo` outputs. Keep `actions/cache@v4` for the **pnpm store** and **Playwright browsers** — those are not Turborepo task outputs.

---

## 3. Third-party fast runner services

Sources: [RunsOn benchmarks (2026)](https://runs-on.com/benchmarks/github-actions-cpu-performance/), [Better Stack runner comparison](https://betterstack.com/community/comparisons/github-actions-runner/), individual vendor pricing pages.

| Vendor         | Free / OSS tier (2026)                                                                                           | Drop-in syntax                            | Passmark ST          | Speedup vs `ubuntu-latest`   | Notes                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------- | ---------------------------- | --------------------------------- |
| **Blacksmith** | 3,000 min/mo free; explicit OSS sponsorship program (Celery, Ladybird, Zen, Limbo)                               | `runs-on: blacksmith-2vcpu-ubuntu-2404`   | 4,484                | ~2.0x                        | Bare-metal gaming CPUs            |
| **Namespace**  | Trial only; no documented permanent free tier                                                                    | `runs-on: nscloud-ubuntu-22.04-amd64-4x8` | 4,433                | ~2.0x                        | AMD EPYC + NVMe cache             |
| **Depot**      | 7-day trial, no permanent free tier; OSS discount by request                                                     | `runs-on: depot-ubuntu-24.04`             | Refuses benchmarking | Vendor claim ~10x for builds | $20/mo Developer plan, $0.004/min |
| **RunsOn**     | **Free non-commercial license**; €300/yr commercial; BYOAWS (compute on your AWS bill)                           | `runs-on: runs-on/runner=2cpu-linux-x64`  | 4,268                | ~1.9x                        | MIT-licensed templates            |
| **BuildJet**   | **SHUT DOWN January 2026** ([RunsOn benchmarks](https://runs-on.com/benchmarks/github-actions-cpu-performance/)) | —                                         | —                    | —                            | Removed from market               |
| **Ubicloud**   | Pay-as-you-go from $0.0008/min                                                                                   | `runs-on: ubicloud-standard-2`            | 2,860                | ~1.3x                        | Cheapest, slower silicon          |

**Critical gotcha:** None of these benefit a **public repo** in pure cost terms — `ubuntu-latest` is already free for public repos. The justification is **wall-time only**. A 2x faster runner moves the 220 s storybook job to roughly 110-130 s. For free OSS tier eligibility, **only Blacksmith and RunsOn** offer it without per-project negotiation.

**Risk:** Depot's no-benchmarking clause is a yellow flag; Namespace has no documented free OSS; Buildjet's shutdown shows the segment is volatile.

---

## 4. Self-hosted `ducktors/turborepo-remote-cache` on AWS

**Active:** v2.8.8 released 2026-05-14, 102 releases, OpenSSF Best Practices badge — [GitHub repo](https://github.com/ducktors/turborepo-remote-cache).

**Deploy patterns:** Officially documented for **AWS Lambda + S3** (not Fargate, though nothing prevents it). Two well-maintained community CDK forks exist: [`NimmLor/cdk-turborepo-remote-cache`](https://github.com/NimmLor/cdk-turborepo-remote-cache) and [`EloB/turborepo-remote-cache-lambda`](https://github.com/EloB/turborepo-remote-cache-lambda) (Lambda + S3 + presigned URLs, supports >6 MB artifacts via Turborepo's preflight feature). [`gpdenny/turborepo-s3-cache`](https://github.com/gpdenny/turborepo-s3-cache) is a serverless S3 variant.

**Storage:** S3, GCS, Azure Blob, Cloudflare R2, local FS, MinIO.

**Cost on AWS:** Negligible at this repo's scale — Lambda invocations + a few GB of S3 + minimal egress. Probably <$1/mo on Lambda free tier.

**Recommendation:** **Don't.** The repo already has Vercel free remote cache as a zero-maintenance option. Self-hosting only justifies itself for compliance/latency reasons that don't apply to a public repo.

---

## 5. Storybook 10 test-runner sharding (2026)

`@storybook/test-runner` v**0.24.0** (Oct 2025, current as of May 2026 per [CHANGELOG](https://github.com/storybookjs/test-runner/blob/next/CHANGELOG.md)) — ESM-only, Storybook 10 + Jest 30 support.

**`--shard` is natively supported** (since v0.9.3, January 2023). Syntax: `pnpm test-storybook --shard=${{ matrix.shard }}/${{ strategy.job-total }}`. It's a Jest-style passthrough; coverage requires per-shard file rename + `nyc merge`. Confirmed via [Storybook test-runner docs](https://storybook.js.org/docs/writing-tests/integrations/test-runner) and the test-runner README.

**Important version note (2026):** [Storybook 10's blog post](https://storybook.js.org/blog/storybook-10/) and the [test-runner docs](https://storybook.js.org/docs/writing-tests/integrations/test-runner) flag that **`@storybook/test-runner` is superseded by the Vitest addon (`@storybook/addon-vitest`)** for Vite-powered Storybooks. Vitest browser mode runs the same play-function/interaction tests faster (no Storybook HTTP server, no separate Playwright `test-storybook` host). This repo uses Storybook 10 + Vite (per `CLAUDE.md`). Migration to `addon-vitest` likely produces a larger speedup than sharding.

**Recommendation:** Choose one of:

- **Quick win**: shard the existing test-runner into 2 jobs (`[1, 2]`) — splits 220 s into ~110 s each, total wall ~120 s for the storybook job.
- **Bigger win**: migrate to `@storybook/addon-vitest`. Reuses the existing Vitest infra in `packages/ui` (already configured per `CLAUDE.md` testing section). Eliminates the http-server + concurrently + wait-on dance currently in `ci.yml` lines 199-203.

---

## 6. Playwright 1.60+ sharding (2026)

Confirmed via [Playwright docs](https://playwright.dev/docs/test-sharding). 1.60+ uses `--shard=N/M` + the `blob` reporter, then `npx playwright merge-reports --reporter html ./all-blob-reports`. Standard GH Actions matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]
```

Then a final `merge-reports` job that `needs: [test]`, downloads all blob artifacts, merges, uploads HTML. Use `if: always()` on the merge job.

**Sweet spot:** 3-4 shards per ecosystem consensus. Each shard should run <5 min. For this repo's `apps/web` E2E (`e2e.yml`), 2 shards probably enough now; scale to 4 as the suite grows. Use `fullyParallel: true` in `playwright.config.ts` for test-level (not file-level) distribution.

**Risk:** None — Playwright sharding is mature, no breaking changes since 1.40.

---

## 7. GitHub-hosted larger runners pricing (2026)

Per [official GitHub docs](https://docs.github.com/en/billing/reference/actions-runner-pricing) (May 2026):

| Runner                   | Per-min                            | Free on public?                        |
| ------------------------ | ---------------------------------- | -------------------------------------- |
| `ubuntu-latest` (2-core) | $0.006 (or free in included quota) | **Yes**                                |
| `ubuntu-latest-4-cores`  | $0.012                             | **No — always billed, even on public** |
| `ubuntu-latest-8-cores`  | $0.022                             | **No**                                 |
| `ubuntu-latest-16-cores` | $0.042                             | **No**                                 |
| `ubuntu-latest-32-cores` | $0.082                             | **No**                                 |

GitHub did a ~40% price cut on standard runners effective 2026-01-01 ([GitHub changelog](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/)). **Public-repo free tier remains standard runners only.** Larger runners require GitHub Team/Enterprise.

**Implication for this repo:** Going to 4-/8-core is not free even on public repos. That kills the simplest "throw bigger hardware at it" approach for OSS. **Third-party runners with OSS free tiers (Blacksmith) are the actual free upgrade path.**

---

## 8. Pre-built Docker runner images (pnpm + Node + Playwright + Postgres-client baked)

**No widely-used canonical image.** The closest reference is [`ministryofjustice/browser-testing-github-actions-runner`](https://github.com/ministryofjustice/browser-testing-github-actions-runner) — Playwright deps preinstalled. Microsoft's [`mcr.microsoft.com/playwright`](https://playwright.dev/docs/docker) image is the official baseline (Playwright + Node only).

**Reality check:** Baking custom images for GitHub-hosted runners is **not possible** — you can only do this for self-hosted runners. For GH-hosted runners, the only "image" optimization is the **container** that your action steps run in (via `container:`), but that means losing the GH runner image's preinstalled tooling (which is itself substantial — Postgres client, Node, Bun, etc. are all on `ubuntu-latest`).

The biggest gain in this repo is already implemented: **Playwright browser cache** in `ci.yml` (lines 176-181). The apt system deps install step (~30-45 s on cache hit, install-deps only) is the residual ceiling. Switching to the Playwright Docker image as `container:` skips both, but breaks the rest of the workflow that assumes `ubuntu-latest` tooling.

**Recommendation:** **Don't pursue custom images.** Marginal gain, large maintenance burden. The Playwright cache already captures ~85% of the value.

---

## 9. CodeQL off the PR critical path

[GitHub's official guidance](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning) recommends `on: pull_request` + `on: schedule` + `on: push: branches: [main]`. PR scanning is the most accurate (diff against merge-commit baseline). Removing PR scanning loses the inline annotations and the per-PR alert classification.

**Workaround if PR latency is critical:** Keep CodeQL on PR but **make it non-required**. The PR can merge before CodeQL completes; alerts still post post-merge. The current repo already lists `codeql.yml` as advisory (not required) per `CLAUDE.md` CI section — so it's already off the critical path.

**Recommendation:** Verify CodeQL is genuinely advisory in the branch ruleset (it is, per repo config), then ignore its wall time. Don't bother moving it to scheduled-only — you lose PR-diff accuracy for no real gain.

---

## 10. What major OSS Turborepo projects actually do

Verified via reading their workflow files:

| Project                     | Runner                                                                                          | Cache                                                                                              | Sharding                                                                                                          | Notes                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **vercel/next.js**          | Mostly `ubuntu-latest`; `windows-latest-8-core-oss` for win jobs; some 16-core for heavy builds | Turborepo (via `pnpm dlx turbo`)                                                                   | **10-way shards** on production tests with historical timing data (`test-timings.json`) for balanced distribution | Concurrency cancel-on-PR. Docs-only PRs skip almost everything. React 18 tests gated by label. |
| **shadcn-ui/ui**            | `ubuntu-latest` everywhere                                                                      | pnpm store cache (`actions/cache@v3` — old version!), Node 22, pnpm 9.0.6. **No turborepo cache.** | None                                                                                                              | Simple single-runner pipeline. Workflows: `code-check.yml`, `test.yml`.                        |
| **vercel/turborepo** itself | `ubuntu-latest` primarily                                                                       | Self-uses turbo + their own cache                                                                  | Partial                                                                                                           | Reference for Turborepo idiomatic CI                                                           |

**Key takeaway:** Even Next.js sticks with `ubuntu-latest` and gets to <5 min through **aggressive sharding + skip-when-unchanged + concurrency cancellation**, not bigger runners. shadcn-ui's 1-2 min CI proves you don't need third-party runners or even Turborepo cache when the workload is small and pnpm-cached. Next.js's `test-timings.json` for balanced shards is a pattern this repo could borrow when the Playwright suite grows.

---

## Final Recommendation (ordered)

1. **If doing one thing next: adopt Vercel Remote Cache.** Free, zero-maintenance, fixes the cold-cache problem on new branches/PRs. Add `TURBO_TOKEN` secret + `TURBO_TEAM` var, done. Expected impact: PRs that touch shared inputs but not the affected scope drop ~30-60 s; first-PR-on-branch cold runs drop more.
2. **If doing two: shard the storybook job into 2 jobs.** Wall time 220 s → ~120 s. Pure GitHub-Actions matrix change, no third party. (Alternative: migrate to `@storybook/addon-vitest` — bigger payoff, more work.)
3. **If doing three: shard Playwright E2E to 4 shards + merge-reports.** Stay ahead of suite growth before it bites.
4. **Only after the above: try Blacksmith free OSS tier.** 3,000 min/mo free, one-line `runs-on:` swap, ~2x speedup on the remaining critical-path job. Apply for their OSS program for unlimited minutes.
5. **Do not:** Larger GitHub runners (not free on public), Depot (no free OSS), Namespace (no OSS tier), self-hosted ducktors-cache (Vercel free covers it), custom Docker runner images (not possible on GH-hosted, not worth on self-hosted).

---

## Sources

- [Turborepo Remote Caching docs](https://turborepo.dev/docs/core-concepts/remote-caching) — accessed 2026-05-17
- [Vercel Remote Cache is now free (Turborepo blog)](https://turborepo.dev/blog/free-vercel-remote-cache) — accessed 2026-05-17
- [Vercel Monorepos / Remote Caching](https://vercel.com/docs/monorepos/remote-caching) — accessed 2026-05-17
- [ducktors/turborepo-remote-cache GitHub](https://github.com/ducktors/turborepo-remote-cache) (v2.8.8, 2026-05-14) — accessed 2026-05-17
- [NimmLor/cdk-turborepo-remote-cache](https://github.com/NimmLor/cdk-turborepo-remote-cache) — accessed 2026-05-17
- [EloB/turborepo-remote-cache-lambda](https://github.com/EloB/turborepo-remote-cache-lambda) — accessed 2026-05-17
- [RunsOn 2026 CPU benchmarks](https://runs-on.com/benchmarks/github-actions-cpu-performance/) — accessed 2026-05-17
- [Better Stack runner comparison](https://betterstack.com/community/comparisons/github-actions-runner/) — accessed 2026-05-17
- [Blacksmith pricing](https://www.blacksmith.sh/pricing) — accessed 2026-05-17
- [Depot pricing](https://depot.dev/pricing) — accessed 2026-05-17
- [Namespace runner configuration](https://namespace.so/docs/reference/github-actions/runner-configuration) — accessed 2026-05-17
- [RunsOn pricing](https://runs-on.com/pricing/) — accessed 2026-05-17
- [GitHub Actions runner pricing (official)](https://docs.github.com/en/billing/reference/actions-runner-pricing) — accessed 2026-05-17
- [GitHub changelog: reduced runner pricing 2026-01-01](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/) — accessed 2026-05-17
- [Storybook test-runner CHANGELOG](https://github.com/storybookjs/test-runner/blob/next/CHANGELOG.md) — accessed 2026-05-17
- [Storybook 10 blog](https://storybook.js.org/blog/storybook-10/) — accessed 2026-05-17
- [Storybook test-runner docs](https://storybook.js.org/docs/writing-tests/integrations/test-runner) — accessed 2026-05-17
- [Playwright Sharding docs](https://playwright.dev/docs/test-sharding) — accessed 2026-05-17
- [GitHub CodeQL workflow guidance](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning) — accessed 2026-05-17
- [vercel/next.js build_and_test.yml](https://github.com/vercel/next.js/blob/canary/.github/workflows/build_and_test.yml) — accessed 2026-05-17
- [shadcn-ui/ui workflows directory](https://github.com/shadcn-ui/ui/tree/main/.github/workflows) — accessed 2026-05-17
- [Northflank: GH Actions pricing 2026 + self-hosted alternatives](https://northflank.com/blog/github-pricing-change-self-hosted-alternatives-github-actions) — accessed 2026-05-17
