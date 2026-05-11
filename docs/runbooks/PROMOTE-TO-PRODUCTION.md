# Promote to production

How to move from "staging-only, internal access" to "production live at `app.afframe.com`, public access."

Current state (before promotion):
- `staging.afframe.com` is the only running environment (~$50/mo).
- `production` exists only as CDK code + Cloudflare Tunnel `windhoek-production` (status `inactive`) + IAM role `windhoek-deploy-production` + secrets. No AWS resources running.
- SES is in sandbox (200/day to verified addresses) unless production access already granted.

After promotion:
- `app.afframe.com` is the public production URL.
- `staging.afframe.com` either stays as a preview env (cost +~$45/mo) or gets torn down ($0).
- Total cost: ~$50/mo (prod only) or ~$95/mo (both envs).

---

## Decision matrix: what to do with staging after promotion

| Option | Cost/mo | When it fits |
|---|---|---|
| **Keep staging running** | ~$95 | Need a sandbox for testing risky changes against real-like infra without touching prod. Raises hard-cap to $120. |
| **Tear down staging** | ~$50 | Solo dev. Tests run locally + on PR CI. Production IS the only env. Saves money. Recommended unless you specifically want a staging env. |
| **Staging on demand** | ~$50 + ad-hoc | Staging stack stays in CDK but RDS is stopped + ECS desiredCount=0 by default. Spin up when needed via a script. |

Pick before starting.

---

## Pre-flight checklist

Run all of these before promoting. Most are read-only.

### 1. SES production access approved

```bash
aws sesv2 get-account --region eu-central-1 --query 'ProductionAccessEnabled' --output text
```

Expected: `True`. If `False`, the production access request from earlier is still pending. Check the support case in AWS Console → Support Center. Until approved, the app uses Resend for outbound mail (3K/mo free). Acceptable to launch with Resend if SES isn't approved yet — switch later.

### 2. Cloudflare production tunnel + DNS ready

```bash
source _junk/cloudflare.env
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel?is_deleted=false" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result | map({name, status})'
```

Expected: `windhoek-production` entry, status `inactive` (means tunnel exists but no connector running — that's normal pre-deploy). After production deploy, status flips to `healthy`.

DNS record check:
```bash
dig +short app.afframe.com
```

Expected: 1-2 Cloudflare edge IPs (`104.x` or `172.67.x`). If empty, the tunnel hostname needs reconfiguration via Cloudflare API.

### 3. AWS hard-cap raised (if keeping both envs)

If staging stays running (Option "Keep staging"), the existing $50/mo hard-cap will fire mid-month. Raise to $120 BEFORE deploying production:

```bash
aws budgets update-budget --account-id 637560253662 --new-budget '{
  "BudgetName":"windhoek-hard-cap-50",
  "BudgetLimit":{"Amount":"120","Unit":"USD"},
  "TimeUnit":"MONTHLY",
  "BudgetType":"COST"
}'
```

Skip this step if tearing down staging.

### 4. Repo secrets + variables present

```bash
gh secret list --repo hlebtkachenko/monorepo | grep -E 'AWS_ACCOUNT_ID|AWS_DEPLOY_ROLE_ARN_PRODUCTION|CLOUDFLARE_TUNNEL_TOKEN_PRODUCTION|RESEND_API_KEY|EMAIL_FORWARD_TO'
gh variable list --repo hlebtkachenko/monorepo | grep -E 'AWS_REGION|AWS_BOOTSTRAPPED|APP_DOMAIN_PRODUCTION'
```

All listed values must exist. `AWS_BOOTSTRAPPED` must be `true`. `APP_DOMAIN_PRODUCTION` must be `app.afframe.com`.

### 5. Confirm latest main builds clean

```bash
git fetch origin --quiet
git checkout main
git pull
pnpm install --frozen-lockfile
pnpm typecheck
```

All workspaces should pass typecheck. If anything fails, fix on a PR first.

---

## Promotion procedure

### Step 1: Trigger production deploy

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=all \
  --repo hlebtkachenko/monorepo \
  --ref main
```

Capture the run ID:
```bash
RUN_ID=$(gh run list --workflow=_deploy-aws.yml --repo hlebtkachenko/monorepo --limit 1 --json databaseId --jq '.[0].databaseId')
echo "RUN_ID=$RUN_ID"
```

Watch in real time:
```bash
gh run watch "$RUN_ID" --repo hlebtkachenko/monorepo
```

Expected duration: 15-25 minutes. RDS creation is the long pole (~10-12 min).

### Step 2: Verify each layer after the run completes

**ECS service:**
```bash
SVC=$(aws ecs list-services --cluster windhoek-production --region eu-central-1 --query 'serviceArns[0]' --output text | awk -F/ '{print $NF}')
aws ecs describe-services --cluster windhoek-production --services "$SVC" --region eu-central-1 \
  --query 'services[0].[serviceName,desiredCount,runningCount,deployments[0].rolloutState]' --output table
```

Expected: `desiredCount=1, runningCount=1, rolloutState=COMPLETED`.

**Cloudflare production tunnel:**
```bash
source _junk/cloudflare.env
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel?is_deleted=false" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[] | select(.name=="windhoek-production") | .status'
```

Expected: `healthy`. Connector inside the production Fargate task is talking to Cloudflare edge.

**End-to-end HTTP:**
```bash
curl -sw 'HTTP %{http_code} in %{time_total}s\n' -o /dev/null https://app.afframe.com/
curl -s https://app.afframe.com/api/health | jq '.'
```

Expected: web returns 200, api returns `{status: "ok", buildSha, buildVersion, uptimeSeconds}`.

**RDS reachability from production task:**
The api `/api/health` doesn't currently exercise the DB. When you add a real DB-touching endpoint, hit it and verify 200 + correct payload.

### Step 3: Update outbound email sender (if SES production approved)

If SES is now `ProductionAccessEnabled=True`, switch `packages/email` default sender from Resend to SES. One-line config change in your email service layer. Open a normal PR for it.

If SES still pending, keep using Resend. App will work; cap is 3K/mo. Switch when AWS approves.

### Step 4: Communicate the launch

The site is live at `https://app.afframe.com`. Anyone with the URL can access. There's no auth wall on the marketing pages yet.

If launch-readiness includes:
- A signup wall → confirm auth is wired before publicizing the URL.
- A waitlist / closed beta → set Cloudflare Access policy on the tunnel hostname to require email allowlist (free Cloudflare Zero Trust feature).

---

## Post-promotion: staging decision

### Option A — keep staging running

No action. Both `staging.afframe.com` and `app.afframe.com` continue serving. Cost: ~$95/mo. Hard-cap should be at $120.

### Option B — tear down staging

Destroy the staging stacks to drop cost back to ~$50/mo:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=eu-central-1
export APP_DOMAIN=staging.afframe.com

cd infra/cdk
pnpm exec cdk destroy App-staging Data-staging Network-staging --context env=staging --force
```

Notes:
- CDK asks for confirmation per stack unless `--force` is passed. Read carefully before confirming — destroy is irreversible without snapshot.
- `Data-staging` deletion behavior follows the CDK `removalPolicy`. For staging it's `DESTROY` + `autoDeleteObjects: true` on S3, so the bucket and its contents go too. RDS will snapshot first if `deletionProtection` is on (it isn't for staging in CDK).
- Delete the Cloudflare staging tunnel + DNS:
  ```bash
  source _junk/cloudflare.env
  ZONE_ID=$(cat _junk/cloudflare-zone-id.txt)
  STAGING_TUNNEL_ID=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel?name=windhoek-staging" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].id')
  curl -sS -X DELETE "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$STAGING_TUNNEL_ID" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.'
  STAGING_DNS_ID=$(curl -sS "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=staging.afframe.com" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].id')
  curl -sS -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$STAGING_DNS_ID" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.'
  ```
- Delete `CLOUDFLARE_TUNNEL_TOKEN_STAGING` secret + `AWS_DEPLOY_ROLE_ARN_STAGING` secret + `APP_DOMAIN_STAGING` variable. Optional: keeps the credentials available if you ever want to spin staging back up.

### Option C — staging on demand

Keep CDK code + Cloudflare tunnel intact but stop the running compute:

```bash
SVC=$(aws ecs list-services --cluster windhoek-staging --region eu-central-1 --query 'serviceArns[0]' --output text | awk -F/ '{print $NF}')
aws ecs update-service --cluster windhoek-staging --service "$SVC" --desired-count 0 --region eu-central-1
aws rds stop-db-instance --db-instance-identifier <staging-rds-id> --region eu-central-1
```

Restart later via `desired-count 1` + `start-db-instance`. RDS stays stopped for up to 7 days at a time (AWS auto-restarts after 7 days; you can stop again). Cost: ~$15-20/mo for stopped storage + ENIs vs $45/mo running.

---

## Rollback

Production goes wrong post-deploy → roll back via one of three paths.

### Fast: ECS service automatic rollback

ECS circuit breaker is configured (`circuitBreaker: { rollback: true }`). If new tasks fail health checks during a deploy, ECS reverts to the previous task definition automatically. Watch the rollout state — if it shows `ROLLBACK_IN_PROGRESS` or `ROLLED_BACK`, the system already self-recovered.

### Medium: re-deploy a known-good SHA

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=app-only \
  --repo hlebtkachenko/monorepo \
  --ref <previous-good-commit-sha>
```

Pins the deploy to the previous commit. Image tag becomes `sha-<that-commit>` which still exists in ECR (lifecycle keeps last 10).

### Hard: revert main + redeploy

```bash
git revert <bad-commit-sha>
git push origin main
gh workflow run _deploy-aws.yml -f environment=production -f stack=app-only --repo hlebtkachenko/monorepo --ref main
```

### Nuclear: hard-cap kill switch

If a deploy somehow blew through the budget cap, the hard-cap fires automatically: RDS stops, ECS scales to 0, IAM deny applied. Recover by:
1. Log into AWS Console as your personal IAM user (NOT `claude-cli`).
2. Detach `windhoek-cap-deny` policy from `claude-cli`.
3. `aws rds start-db-instance --db-instance-identifier <prod-rds-id>`.
4. `aws ecs update-service --cluster windhoek-production --service <svc> --desired-count 1`.

---

## What to check 7 days post-launch

- **AWS Cost Explorer** — daily run-rate matches forecast. Click around the Service breakdown.
- **AWS Budgets** — current spend vs the $120 (or $50) cap.
- **CloudWatch alarms** — none in `ALARM` state. Check `windhoek-rds-cpu-high`, `windhoek-rds-connections-high`, `windhoek-rds-storage-low`, `windhoek-ecs-task-down`.
- **Cloudflare Tunnel** — production tunnel still `healthy`, no flapping in connector logs.
- **Cost Anomaly Detection** — no anomaly alerts fired.
- **Sentry** — no surge in error volume.
- **RDS automated snapshots** — last successful snapshot within 24h. Check RDS console → Maintenance & backups.

If everything looks clean after 7 days, mark the launch successful in `.context/SESSION-STATUS-*.md`.

---

## Tip-of-the-iceberg: what's still missing for a "real" launch

Items deliberately deferred from MVP that might matter once you have users:

| Item | Trigger to enable | Cost |
|---|---|---|
| RDS Multi-AZ | First paying customer with SLA | +$16/mo |
| GuardDuty Foundational | First paying customer or attack signal | +$5-15/mo (30-day free trial available) |
| AWS WAF on Cloudflare path | Skip — Cloudflare WAF already free | $0 |
| Drizzle migration ECS task | `packages/db` ships a schema | $0 |
| RDS snapshot copy to second region (DR) | DORA / SOC 2 audit | +$1-3/mo |
| CloudWatch Logs Infrequent Access tier | App log ingest > 5 GB/mo | -50% of log cost |
| Cloudflare Access on `app.afframe.com` | Closed beta launch | $0 free tier |

Don't enable preemptively. Each adds ops surface or cost.

---

## References

- `docs/adr/0007-mvp-single-account-cdk-only.md` — single-account decision
- `docs/adr/0008-cloudflare-tunnel-and-email.md` — Cloudflare Tunnel front door
- `docs/runbooks/AWS-DEPLOY.md` — base deploy procedure (`staging` flow is identical to `production` flow with the environment arg swapped)
- `.context/attachments/aws-products-review.md` — service-by-service rationale
