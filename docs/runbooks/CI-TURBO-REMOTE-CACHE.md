# CI: Turborepo Remote Cache (Cloudflare R2 + Workers)

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

Operator runbook for the Turborepo Remote Cache deployed on Cloudflare Workers + R2.

- **Architecture decision**: [ADR-0021](../adr/0021-turborepo-remote-cache-cloudflare.md)
- **Worker source (vendored)**: [`infra/cloudflare/`](../../infra/cloudflare/) (vendored from [AdiRishi/turborepo-remote-cache-cloudflare](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare) v4.0.0 — see [SOURCE.md](../../infra/cloudflare/SOURCE.md))
- **Deploy workflow**: [`.github/workflows/_deploy-cloudflare.yml`](../../.github/workflows/_deploy-cloudflare.yml)
- **Consumer composite step**: [`.github/actions/setup/action.yml`](../../.github/actions/setup/action.yml) — "Configure Turbo Remote Cache defaults"
- **Asset inventory**: `CF-WORKER-TURBO`, `CF-R2-TURBO` in [`docs/INVENTORY.md`](../INVENTORY.md)

---

## 1. First-time deploy (done once)

Pre-flight (one-time):

1. Cloudflare dashboard → enable R2 (requires payment method even for free-tier use)
2. Create API token with scopes: `Account Workers Scripts:Edit` + `Account R2 Storage:Edit`. Optionally `Zone DNS:Edit` (only needed if adding custom domain later).
3. GitHub repo Secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `TURBO_TOKEN` (`openssl rand -hex 32`)
   - `TURBO_REMOTE_CACHE_SIGNATURE_KEY` (`openssl rand -hex 32`)

Trigger first deploy:

```bash
gh workflow run deploy-cloudflare.yml
gh run watch
```

The deploy workflow:

1. Idempotently creates the R2 bucket (`turbo-cache-prod`)
2. Runs `wrangler deploy` (creates / updates the Worker)
3. Pipes `TURBO_TOKEN` into `wrangler secret put` (stdin, never logged)
4. Reports the custom-domain URL (`https://cache.afframe.com`) to the run summary
5. Smoke-checks the URL returns HTTP < 500

After successful deploy, set it as a GitHub repo **variable** (not secret):

```bash
gh variable set TURBO_API --body "https://cache.afframe.com"
```

Next CI run on any PR will start using the remote cache. First PR = cold (populates). Second PR onwards = `cache hit (remote)` lines in turbo run summaries.

## 2. Verifying cache hits are happening

Three signals, increasing specificity:

**A. CI step summary** — composite emits one of:

```
turbo remote cache: enabled (api=https://cache.afframe.com)
turbo remote cache: disabled (TURBO_API or TURBO_TOKEN unset)
```

If `disabled` shows, either `vars.TURBO_API` is not set or `secrets.TURBO_TOKEN` is missing on that workflow's environment.

**B. Turbo run output** — every task line has a cache status:

```
@workspace/ui:lint: cache hit (remote)         ← Worker served this
@workspace/ui:test: cache hit, replaying logs  ← local .turbo
@workspace/ui:build: cache miss, executing     ← rebuilt
```

`cache hit (remote)` lines are the only proof PR-D is delivering. Without them, the Worker is reachable but turbo is not actually pulling artifacts (most likely cause: signature mismatch — see § 5).

**C. `wrangler tail` live traffic stream** (run locally):

```bash
cd infra/cloudflare
pnpm exec wrangler tail
```

Shows every Worker invocation in real time. Filter by status: `wrangler tail --status error` for failures only.

**D. R2 bucket inspection**:

```bash
cd infra/cloudflare
pnpm exec wrangler r2 object list turbo-cache-prod --json | jq 'length'
```

Total object count. Should grow over the first few PRs then stabilise around the working-set size of build artifacts (~50-200 objects, ~1-3 GB).

## 3. Rotating TURBO_TOKEN

Quarterly, or immediately on suspected leak. Atomic — both GitHub and Cloudflare must hold the same value before any CI run; otherwise all reads fail signature check temporarily.

```bash
# 1. Generate new token
new_token=$(openssl rand -hex 32)

# 2. Update GitHub repo secret
echo -n "$new_token" | gh secret set TURBO_TOKEN

# 3. Update Worker secret (re-runs wrangler secret put via deploy workflow)
gh workflow run deploy-cloudflare.yml

# 4. Wait for deploy to finish
gh run watch

# 5. Re-run any in-flight CI workflows so they pick up the new GH secret
#    (workflows that started BEFORE the secret change still have the old token in env)
```

Old token is invalid the moment `wrangler secret put` completes. Any CI workflow holding the old token in env will get auth failures from the Worker; the composite's `continue-on-error: true` keeps the build green and turbo falls back to local cache.

## 4. Rotating TURBO_REMOTE_CACHE_SIGNATURE_KEY

This rotation invalidates the entire cache (every existing artifact was signed with the old key). Expect 1-2 PRs of cold cache after.

```bash
new_key=$(openssl rand -hex 32)
echo -n "$new_key" | gh secret set TURBO_REMOTE_CACHE_SIGNATURE_KEY

# Optionally flush R2 to free space immediately (else daily cron prunes via 14d TTL):
cd infra/cloudflare
pnpm exec wrangler r2 object list turbo-cache-prod --json \
  | jq -r '.[].key' \
  | xargs -I{} pnpm exec wrangler r2 object delete turbo-cache-prod {}
```

## 5. Debugging: cache hits not happening

Symptom-driven:

| Symptom                                                  | Likely cause                                                   | Fix                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Composite step summary shows `disabled`                  | `vars.TURBO_API` not set                                       | `gh variable set TURBO_API --body "https://..."`                                                     |
| Composite shows `enabled` but every task is `cache miss` | First run after key rotation, or first run for this input hash | Wait — second PR should hit                                                                          |
| `signature invalid, refetching` in turbo output          | `TURBO_REMOTE_CACHE_SIGNATURE_KEY` mismatch GH ↔ Worker        | Both sides must have same key; re-set both, re-deploy Worker                                         |
| 401/403 from Worker (visible in `wrangler tail`)         | `TURBO_TOKEN` mismatch                                         | Atomic rotation per § 3                                                                              |
| Worker timeout                                           | Cloudflare zone issue or Worker code crash                     | Check `wrangler tail --status error`; check Cloudflare status page                                   |
| R2 full (>10 GiB)                                        | TTL cron broken or burst CI traffic                            | Check cron logs in Cloudflare dashboard; reduce `BUCKET_OBJECT_EXPIRATION_HOURS` in `wrangler.jsonc` |

Verbose turbo output for one-off investigation:

```bash
TURBO_LOG_VERBOSITY=2 pnpm turbo build --filter=web
```

Shows every `POST/GET` to the Worker with HTTP status.

## 6. Worker outage = no action needed

The composite has `continue-on-error: true` on the "Configure Turbo Remote Cache defaults" step, and turbo CLI treats remote-cache network failures as a cache miss (rebuilds locally). A Cloudflare outage at the cache layer:

- Does NOT red the build
- Slows CI on average ~30-60 s per cached job (no remote hits → full rebuild)
- Self-recovers when the Worker comes back

Watch [Cloudflare Status](https://www.cloudflarestatus.com/). No CI-side intervention required.

## 7. Disaster recovery

Cache is non-business data. Tier-3 DR per [INVENTORY](../INVENTORY.md). Rebuild procedure:

```bash
# Worst case: lost the entire R2 bucket + Worker. Re-deploy from scratch.
gh workflow run deploy-cloudflare.yml
gh run watch

# First few CI runs will be cold cache (1-2 min slower than warm). Self-heals.
```

No business data, no customer data, no audit data in this cache. Loss = inconvenience, not incident.

## 8. Cost monitoring

Cloudflare emails when free tier is exceeded. Manual check:

```
Cloudflare dashboard → Workers & Pages → turbo-cache → Metrics
Cloudflare dashboard → R2 → turbo-cache-prod → Metrics
```

Projected: $0/month at solo-dev scale. Headroom analysis:

| Resource                | Free tier      | Projected | Headroom    |
| ----------------------- | -------------- | --------- | ----------- |
| R2 storage              | 10 GB-month    | ~2-5 GB   | 50-80% free |
| R2 Class A ops (writes) | 1M/month       | ~1.8k     | 99.8% free  |
| R2 Class B ops (reads)  | 10M/month      | ~1.8k     | 99.98% free |
| R2 egress               | unlimited free | n/a       | n/a         |
| Workers requests        | 100k/day       | ~1.8k/day | 98% free    |

Overrun triggers: storage > 10 GB → $0.015/GB-month; Workers requests > 100k/day → forces upgrade to $5/month Workers Paid. Neither expected at current scale.

## 9. Upgrading the vendored Worker

See [`infra/cloudflare/SOURCE.md`](../../infra/cloudflare/SOURCE.md) for the full procedure.
