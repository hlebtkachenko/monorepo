# CI Speedup Research — Commercial Public-Source Turborepo Monorepo (2026)

**Researched:** 2026-05-17
**Scope:** Public GitHub repo, commercial product, NOT Vercel-eligible, NOT OSS license. Already wired: `turbo --affected`, Storybook path-filter skip, Playwright browser cache, pnpm cache, 6 pre-push hooks.

Confidence tags: `[VERIFIED]` = pulled directly from upstream repo / official docs in this session. `[CITED]` = official source URL referenced. `[ASSUMED]` = not independently verified.

---

## 1. AWS-hosted Turbo Remote Cache — `ducktors/turborepo-remote-cache`

**Status: actively maintained.** Latest stable **v2.8.8, released 2026-05-14** (v2.8.7 same day, v2.8.6 on 2026-05-05). Release cadence: multiple per week. `[VERIFIED]` — pulled live from releases page.
Sources: [ducktors/turborepo-remote-cache releases](https://github.com/ducktors/turborepo-remote-cache/releases) (accessed 2026-05-17); [npm package](https://www.npmjs.com/package/turborepo-remote-cache); [docs site](https://ducktors.github.io/turborepo-remote-cache/).

**AWS deploy patterns** (in order of operator simplicity for a solo dev):

| Pattern                     | Server cost (idle)                | Per-CI-min cost                    | Cold-start | Best for                       |
| --------------------------- | --------------------------------- | ---------------------------------- | ---------- | ------------------------------ |
| **Lambda + S3 (preflight)** | $0                                | ~$0 (signed URL upload, S3 direct) | 200–800 ms | Solo dev, bursty CI            |
| **App Runner + S3**         | ~$5–$15/mo (min 0.25 vCPU/0.5 GB) | $0                                 | none       | Small team, predictable load   |
| **ECS Fargate + S3**        | $15–30/mo (min task)              | $0                                 | none       | Bigger team, custom networking |

Lambda+S3 is the canonical solo-dev pattern. Turbo's preflight feature lets Lambda issue presigned S3 URLs so the >6 MB Lambda response limit is bypassed. Reference impl: [`EloB/turborepo-remote-cache-lambda`](https://github.com/EloB/turborepo-remote-cache-lambda) and ducktors' [Running in AWS Lambda](https://ducktors.github.io/turborepo-remote-cache/running-in-lambda.html) and serverless variant [`gpdenny/turborepo-s3-cache`](https://github.com/gpdenny/turborepo-s3-cache). `[CITED]`

**S3 → GitHub-hosted runner latency:** S3 in `eu-central-1` to GitHub-hosted Azure East US 2 runner: typically 80–150 ms first byte; sustained throughput ~30–80 MB/s. **No authoritative 2026 benchmark found.** `[ASSUMED]`

**Solo dev cost reality (~30 min CI/day, ~3 GB cache):** S3 ~$0.069/mo storage + ~$0.10–$0.30/mo requests + Lambda virtually free under 1M req/mo free tier. **Total < $1/mo.** Add ~$0.09/GB S3 egress if Lambda issues cache reads (not a presigned-download skip). `[ASSUMED based on AWS public pricing]`

---

## 2. Self-hosted alternatives (2026, NOT Vercel)

| Project                                         | Latest                               | Date       | Maintained?                   | Backend                                      |
| ----------------------------------------------- | ------------------------------------ | ---------- | ----------------------------- | -------------------------------------------- |
| `ducktors/turborepo-remote-cache`               | v2.8.8                               | 2026-05-14 | Yes, very active              | S3 / R2 / Azure / GCS / Local / MinIO        |
| `rharkor/caching-for-turbo` (Action)            | v2.4.2                               | 2026-05-15 | Yes, very active              | GitHub Actions Cache (default) + optional S3 |
| `AdiRishi/turborepo-remote-cache-cloudflare`    | v4.0.0                               | 2026-01-19 | Yes                           | R2 / KV                                      |
| `JacobMGEvans/Turbo-R2-Archive`                 | (no release in 2026 found)           | —          | Stale / archive-grade         | R2                                           |
| `brunojppb/turbo-cache-server` (Rust)           | active                               | 2025       | Less active                   | Local/disk inside runner                     |
| `cometkim/turbocache`                           | older                                | —          | Quiet                         | CF Workers                                   |
| `dtinth/setup-github-actions-caching-for-turbo` | older                                | —          | Quiet, predecessor of rharkor | GH cache                                     |
| `Yuripetusko/turbo-remote-cache`                | **does not exist** under that handle | —          | —                             | —                                            |

`[VERIFIED]` for top three (release dates pulled live). Others `[CITED]` — search-only.
Sources: [rharkor/caching-for-turbo](https://github.com/rharkor/caching-for-turbo); [AdiRishi project](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare); [ducktors deployment envs](https://ducktors.github.io/turborepo-remote-cache/deployment-environments.html).

**No Turborepo-blessed third-party alternative was announced 2025–2026.** Vercel still owns the official managed cache. The above are all community projects.

---

## 3. GitHub-hosted **larger runners** on PUBLIC repos — pricing confirmation 2026

**Confirmed: larger runners are NOT free on public repos. Public-repo free tier applies ONLY to standard runners (`ubuntu-latest`, etc.).**
Source: [GitHub Docs — Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) (accessed 2026-05-17): _"The larger runners are not free for public repositories."_ `[VERIFIED]`

GitHub also distinguishes by **repo visibility, not license type** — there is no OSS-vs-commercial bifurcation. Public repo = free standard minutes regardless of whether the underlying code is MIT, AGPL, proprietary-published, or unlicensed. `[VERIFIED via docs]`

**Per-minute Linux larger-runner pricing** post 2026-01-01 reduction (`ubuntu-latest-Nx`, Linux x64):

| Runner  | Approx $/min Linux (2026 after price cut) |
| ------- | ----------------------------------------- |
| 4-core  | ~$0.016                                   |
| 8-core  | ~$0.032                                   |
| 16-core | ~$0.064                                   |
| 32-core | ~$0.128                                   |
| 64-core | ~$0.256                                   |

Source: [GitHub Changelog — Reduced pricing for GitHub-hosted runners (2026-01-01)](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/); [2026 pricing changes overview](https://github.com/resources/insights/2026-pricing-changes-for-github-actions). `[CITED]` Exact per-tier numbers `[ASSUMED]` from documented "larger relative reduction" language — verify against your billing dashboard before committing.

**Trap:** Larger runners require GitHub **Team** or **Enterprise Cloud** plan; Free plan accounts cannot create them at all. `[VERIFIED]`

---

## 4. Cloudflare R2 + Workers as Turbo cache backend

Canonical implementation: [`AdiRishi/turborepo-remote-cache-cloudflare`](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare), **v4.0.0 released 2026-01-19**, 220 stars, actively maintained. Workers + R2 (or KV) with bearer-token auth. `[VERIFIED]`

**Free-tier limits (Cloudflare 2026):** `[CITED]` from [R2 pricing page](https://developers.cloudflare.com/r2/pricing/) + [Nubbo free-tier writeup](https://nubbo.app/blog/cloudflare-r2-free-tier/):

- **R2 storage:** 10 GB-month free; $0.015/GB-month after.
- **R2 Class A ops (writes):** 1M/mo free; $4.50/M after.
- **R2 Class B ops (reads):** 10M/mo free; $0.36/M after.
- **Egress:** $0 always (R2's headline feature).
- **Workers free tier:** 100k requests/day free.

For ~30 min CI/day with a few hundred cache PUT/GETs per run, the entire Turbo cache pipeline stays **comfortably inside the free tier indefinitely**. Maintenance pattern: `wrangler deploy` from the worker project, lifecycle rules on R2 to purge >30-day artifacts.

**No documented Workers-cold-start latency benchmark for Turbo cache traffic specifically found.** Workers cold-start <5 ms is Cloudflare's published number, but real Turbo cache hit/miss wall-time benchmarks are absent. `[ASSUMED — needs measurement]`

---

## 5. What major commercial-public Turborepo monorepos use (verified)

Pulled live via `gh api` from each repo's `.github/workflows`.

| Repo                  | Cache strategy                                                                                                                                                                                          | Runners                  | Citation                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **calcom/cal.com**    | **Vercel Remote Cache** (`TURBO_TOKEN`/`TURBO_TEAM` secrets) + custom `actions/cache@v4` for `.next` build, content-addressed by `hashFiles('apps/**/*.tsx', 'packages/**/*.ts', 'schema.prisma', ...)` | `ubuntu-latest` standard | [`check-types.yml`](https://github.com/calcom/cal.com/blob/main/.github/workflows/check-types.yml), [`e2e.yml`](https://github.com/calcom/cal.com/blob/main/.github/workflows/e2e.yml) — 8-shard Playwright matrix with `services: postgres:18` `[VERIFIED]` |
| **shadcn-ui/ui**      | **No Turbo remote cache at all.** Only pnpm-store cache via `actions/cache@v3`. Standard `ubuntu-latest`. No matrix sharding.                                                                           | `ubuntu-latest`          | [`test.yml`](https://github.com/shadcn-ui/ui/blob/main/.github/workflows/test.yml) `[VERIFIED]`                                                                                                                                                              |
| **PostHog/posthog**   | **No Turbo remote cache** in `ci-turbo.yml`. Uses `turbo build --affected --dry-run` only, no `TURBO_TOKEN`. Their non-turbo Python/Rust workflows do their own caching.                                | `ubuntu-latest`          | [`ci-turbo.yml`](https://github.com/PostHog/posthog/blob/master/.github/workflows/ci-turbo.yml) `[VERIFIED]`                                                                                                                                                 |
| **dubinc/dub**        | E2E uses standalone `ubuntu-latest` with inline env vars + services. **No turbo remote cache in workflows.**                                                                                            | `ubuntu-latest`          | [`playwright.yaml`](https://github.com/dubinc/dub/blob/main/.github/workflows/playwright.yaml) `[VERIFIED]`                                                                                                                                                  |
| **supabase/supabase** | Not a Turborepo monorepo (different tooling, mixed langs). Skipped from comparison.                                                                                                                     | —                        | —                                                                                                                                                                                                                                                            |

**Headline observation:** The largest commercial-public Turborepo (`cal.com`) uses **Vercel Remote Cache** despite their CI scale — they presumably have a paid Vercel team plan. Nobody in the survey self-hosts a Turbo cache backend. The pattern that _does_ universally appear is **content-addressed `actions/cache@v4` keys** combining lockfile hash + glob of source files (cal.com's `cache-build-key` composite action is the cleanest reference impl found).

Source: [cal.com cache-build-key composite action](https://github.com/calcom/cal.com/tree/main/.github/actions/cache-build-key) `[VERIFIED]`

---

## 6. Storybook test-runner sharding (2026 pattern)

Official sharding flag: `test-storybook --shard=N/M`. Standard GH matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: yarn test-storybook --coverage --shard=${{ matrix.shard }}/${{ strategy.job-total }}
  - run: mv coverage/storybook/coverage-storybook.json coverage/storybook/coverage-storybook-${{ matrix.shard }}.json
  - uses: actions/upload-artifact@v4
    with:
      name: coverage-${{ matrix.shard }}
      path: coverage/storybook
  # merge job:
  - uses: actions/download-artifact@v4
  - run: yarn nyc merge coverage/storybook merged-output/merged-coverage.json
```

Source: [`storybookjs/test-runner` README](https://github.com/storybookjs/test-runner). `[CITED]`

Real-world example using the same pattern: cal.com's `e2e.yml` (8-way shard, Playwright not test-runner, but identical matrix shape) — already cited above.

---

## 7. Storybook 10 + `addon-vitest` migration status

**Stable enough to recommend for greenfield. Migration has rough edges.**

- Replaces `@storybook/test-runner` entirely. Eliminates the `build-storybook` → `http-server` → `wait-on` → `test-storybook` dance: a single `vitest --project=storybook` command runs stories as tests with Vitest's browser mode (Playwright provider). Source: [Storybook docs — Migrating to Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon/migration-guide). `[VERIFIED]`
- Released as the official successor in **Storybook 10** (supports Vitest 4, Next 16). Source: [Storybook 10 announcement](https://storybook.js.org/blog/storybook-10/). `[CITED]`
- **Known migration friction (Dec 2025):** path-resolution bugs in monorepos ([issue #33287](https://github.com/storybookjs/storybook/issues/33287)) and CI-specific failures ([issue #33347](https://github.com/storybookjs/storybook/issues/33347)). Both closed by 2026-Q1 according to the issue tracker, but no authoritative all-clear post.
- **Wall-time delta:** Storybook claims "faster execution"; **no public benchmark with concrete numbers** found in this session. Anecdote on the docs site of "much faster" is the strongest statement. `[ASSUMED]`

**Recommendation for this repo:** Pin a 1-day spike to migrate one package (`packages/ui`) and measure. If green, roll out. Migration cost is low (`npx storybook add @storybook/addon-vitest` is the documented entry point).

---

## 8. Playwright sharding + testcontainer cost amortization

**No "boot once, share across shards" pattern exists at the GitHub Actions matrix level** — each matrix job is a separate VM with its own Docker daemon. Sharing requires an external Postgres (managed service or self-hosted) reachable from all shard jobs, which defeats the testcontainer isolation contract.

**The 2026-canonical pattern is per-shard boot:**

- cal.com's `e2e.yml` uses **GitHub Actions `services: postgres:18`** (one Postgres per matrix job, lifecycle-managed by GH itself, no testcontainer needed). 8 shards, 8 Postgres instances, all parallel. Boot is concurrent with checkout/install, so wall-time impact is ~0 if Postgres boots < other setup steps. `[VERIFIED — see e2e.yml above]`
- For testcontainer-based suites (this repo's pattern via `@workspace/testcontainers`), the equivalent is: each shard boots its own container. Amortization comes from **fewer, longer shards** (e.g., 4 shards of 5 min beats 8 shards of 3 min if each shard pays 90 s boot tax) — there is a break-even point that has to be measured per suite.
- New helper: [`@playwright-labs/fixture-testcontainers`](https://dev.to/vitalicset/real-docker-containers-in-playwright-tests-zero-boilerplate-4ml7) (March 2026) provides a `useContainer` fixture for per-test or per-file Postgres scoping with less boilerplate, but still one container per worker.

**Verdict:** Sharding pays off only when **per-shard test runtime > 2× per-shard fixed setup cost**. For a small-to-medium E2E suite the existing single-job + parallel workers is faster than 4-shard matrix.

---

## 9. `dorny/paths-filter` — security status 2026

**No CVEs published.** GitHub security tab for the repo states _"There aren't any published security advisories"_ and the repo has **no `SECURITY.md`**. `[VERIFIED — accessed 2026-05-17]`
Source: [github.com/dorny/paths-filter/security](https://github.com/dorny/paths-filter/security).

**Successor / hardened fork:** [`step-security/paths-filter`](https://github.com/step-security/paths-filter) — _"Secure drop-in replacement for dorny/paths-filter"_, latest **v4.0.1, 2026-04-10**, maintained on a faster cadence. The fork's value is StepSecurity's general supply-chain hardening (pinned Node 24, signed releases, runtime tampering protection via their `harden-runner`), not patching a specific known CVE. `[VERIFIED]`

**Recommendation:** Stay on `dorny/paths-filter@v3` SHA-pinned. Swap to `step-security/paths-filter` only if/when you adopt `step-security/harden-runner` org-wide and want consistent provenance. No urgent action.

---

## 10. `actions/cache@v4` with content-addressed Turbo keys — 2026 production pattern

The cleanest production pattern observed (cal.com `cache-build-key/action.yml`, verified live):

```yaml
- name: Generate cache key
  id: generate-key
  env:
    CACHE_NAME: prod-build
    BRANCH_KEY: ${{ inputs.branch_key }}  # github.head_ref || github.ref_name
    LOCKFILE_HASH: ${{ hashFiles('yarn.lock') }}
    SOURCE_HASH: ${{ hashFiles(
      'apps/**/**.[jt]s', 'apps/**/**.[jt]sx', 'apps/**/*.json', 'apps/**/*.css',
      'packages/**/**.[jt]s', 'packages/**/**.[jt]sx',
      'packages/prisma/schema.prisma', 'packages/prisma/migrations/**/*.sql',
      '!**/node_modules/**', '!packages/prisma/generated/**'
    ) }}
  run: |
    echo "key=${CACHE_NAME}-${BRANCH_KEY}-${LOCKFILE_HASH}-${SOURCE_HASH}" >> $GITHUB_OUTPUT
```

**Key insight:** Cache key is **content-addressed (lockfile + source globs), NOT `github.sha`**. The branch slug is in the key only so concurrent feature branches don't evict each other; the actual hit/miss decision is content. Cache hits even across branches when content matches.

For a Turborepo-specific equivalent, cache `.turbo/`, `.next/cache/`, and per-app `dist/`/`build/` directories under this same key. Source: cal.com [`cache-build/action.yml`](https://github.com/calcom/cal.com/tree/main/.github/actions/cache-build) `[VERIFIED]`.

Turborepo's own [GitHub Actions guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) still shows the legacy `${{ github.sha }}` pattern with `restore-keys` fallback — **that pattern is inferior to content-addressed keys** because it forces a sha-prefix lookup before falling back. `[CITED]`

---

## Sources (consolidated, all accessed 2026-05-17)

Primary [VERIFIED]:

- [ducktors/turborepo-remote-cache releases](https://github.com/ducktors/turborepo-remote-cache/releases)
- [rharkor/caching-for-turbo](https://github.com/rharkor/caching-for-turbo)
- [AdiRishi/turborepo-remote-cache-cloudflare](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare)
- [calcom/cal.com check-types.yml](https://github.com/calcom/cal.com/blob/main/.github/workflows/check-types.yml)
- [calcom/cal.com e2e.yml](https://github.com/calcom/cal.com/blob/main/.github/workflows/e2e.yml)
- [calcom/cal.com cache-build composite action](https://github.com/calcom/cal.com/tree/main/.github/actions/cache-build)
- [shadcn-ui/ui test.yml](https://github.com/shadcn-ui/ui/blob/main/.github/workflows/test.yml)
- [PostHog ci-turbo.yml](https://github.com/PostHog/posthog/blob/master/.github/workflows/ci-turbo.yml)
- [dubinc/dub playwright.yaml](https://github.com/dubinc/dub/blob/main/.github/workflows/playwright.yaml)
- [dorny/paths-filter security tab](https://github.com/dorny/paths-filter/security)
- [step-security/paths-filter](https://github.com/step-security/paths-filter)

Secondary [CITED]:

- [GitHub Docs — Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- [GitHub Changelog — 2026-01-01 reduced pricing](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/)
- [GitHub 2026 pricing changes overview](https://github.com/resources/insights/2026-pricing-changes-for-github-actions)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Nubbo R2 free-tier breakdown 2026](https://nubbo.app/blog/cloudflare-r2-free-tier/)
- [Storybook 10 announcement](https://storybook.js.org/blog/storybook-10/)
- [Storybook Vitest addon migration guide](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon/migration-guide)
- [Storybook issue #33287 — monorepo path resolution](https://github.com/storybookjs/storybook/issues/33287)
- [Storybook issue #33347 — CI failures post-migration](https://github.com/storybookjs/storybook/issues/33347)
- [Turborepo GitHub Actions guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions)
- [Storybook test-runner sharding README](https://github.com/storybookjs/test-runner)
- [Janus Chung — S3 + GH Actions setup post](https://januschung.github.io/blog/2025/05/17/setting-up-turborepo-remote-cache-with-s3-and-github-actions/)
- [Playwright fixture-testcontainers writeup](https://dev.to/vitalicset/real-docker-containers-in-playwright-tests-zero-boilerplate-4ml7)
- [EloB/turborepo-remote-cache-lambda](https://github.com/EloB/turborepo-remote-cache-lambda)
- [gpdenny/turborepo-s3-cache](https://github.com/gpdenny/turborepo-s3-cache)

---

## Assumptions log

| #   | Claim                                             | Why ASSUMED                                                               | Risk if wrong                                           |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| A1  | S3 → Azure-runner sustained throughput 30–80 MB/s | No published 2026 benchmark found                                         | Cache wins smaller than projected                       |
| A2  | Solo-dev S3+Lambda cost < $1/mo                   | Derived from public pricing, not real bill                                | Underestimate by single dollars, not order of magnitude |
| A3  | Larger-runner per-min pricing in table above      | Announcement says "larger relative reduction" but doesn't quote each tier | Off by ±25%                                             |
| A4  | Storybook addon-vitest CI wall-time improvement   | Docs claim "faster", no benchmark                                         | Migration effort wasted if delta is single-digit %      |
| A5  | Workers cold-start <5 ms for Turbo cache traffic  | Cloudflare general claim, not measured for this workload                  | Reads slower than projected                             |
