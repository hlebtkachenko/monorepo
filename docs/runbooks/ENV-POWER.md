# Env Power — on/off without a redeploy

Park an idle environment to cut cost, bring it back in minutes. **On/off is NOT
a redeploy** — it's plain AWS API calls (ECS `desiredCount` + RDS start/stop). No
image build, no ECR scan, no CDK. It reuses whatever is already deployed.

All costs below are **real gross usage** (what you pay once credits run out).

## Three actions

| Action       | What it does                                               | Idle cost (prod) | Resume time (measured)                 |
| ------------ | ---------------------------------------------------------- | ---------------- | -------------------------------------- |
| `resume`     | start RDS if stopped → ECS `desiredCount=1` → wait healthy | —                | —                                      |
| `warm-pause` | ECS `desiredCount=0`, **RDS left running**                 | ~$20/mo          | **~1.5 min** (ECS boot only)           |
| `cold-pause` | ECS `desiredCount=0` **+ stop RDS** (+ keep-stopped tag)   | ~$5/mo           | **~8 min** (RDS start ~6.5 min + boot) |

Measured 2026-05-31 on staging: RDS stopped→available **6m 33s**; ECS scale
0→task HEALTHY **≤1m 35s**. The whole cold gap is the RDS start — keep RDS up
(warm) and resume is ~1.5 min.

## Manual switch — the `power.yml` workflow

`.github/workflows/power.yml` ("Env Power") calls
`_power-environment.yml` once per selected environment. OIDC auth only: no
static keys and no secrets printed. Power actions and AWS deploys share one
per-environment concurrency group, preventing a pause/resume from racing CDK,
ECS, or RDS work.

**From the Actions tab:** Env Power → Run workflow → pick `environment`
(`staging` | `production` | `all`) + `action` → Run. Production is gated by the
`production` GitHub environment.

**`environment: all`** fans out to BOTH envs as a matrix — each leg runs as its
own job with its own GitHub environment + OIDC role (the deploy-role trust
policy is exact-match per env, so a single job can't assume both). GitHub
`workflow_dispatch` has no multi-select checkbox input, so `all` is the
idiomatic "both".

**From the CLI (one line):**

```bash
gh workflow run power.yml -f environment=production -f action=resume
gh workflow run power.yml -f environment=production -f action=warm-pause
gh workflow run power.yml -f environment=production -f action=cold-pause
gh workflow run power.yml -f environment=staging    -f action=resume
gh workflow run power.yml -f environment=all        -f action=cold-pause
```

`resume` runs two jobs in parallel. The database lane removes the
`cost-stop-requested` tag, starts RDS, and waits for `available`. The application
lane prepares independently and starts ECS during RDS's final
`configuring-enhanced-monitoring` phase when the deployed `db-migrate`
container advertises bounded connection-wait support. Older task definitions
fall back to starting ECS only after RDS is available. The application lane
waits for both `services-stable` and task health `HEALTHY` before removing the
sleeping page. Failure before readiness scales ECS back to 0.

## Automatic — auto-cold-pause after 5h (uptime TTL)

A 30-min EventBridge schedule (`monorepo-<env>-autostop`, in `SecurityStack`)
**cold-pauses** an env once its oldest running task has been up past
`MAX_UPTIME_HOURS` (**5h**). It stops ECS + RDS, tags `cost-stop-requested`,
and emails the ops topic. Runs on **staging and (pre-v1) production**.

It is a **max-uptime TTL, not idle detection** — traffic terminates at
Cloudflare (no ALB), so ECS has no cheap per-request signal. The clock is the
task's `startedAt`, not "last user request". A still-needed session is just
resumed via `power.yml`.

Gated by `AUTO_STOP_ENVS = ["staging", "production"]` in
`infra/cdk/lib/security-stack.ts`.

Production auto-stop is temporarily deferred from 2026-07-12 through
2026-07-26. `AUTO_STOP_NOT_BEFORE=2026-07-26T22:00:00Z` makes scheduled checks
no-op until 2026-07-27 00:00 Europe/Prague, then the 5h TTL resumes
automatically. Staging remains on its normal 5h TTL. Manual power actions and
cost-runaway kill-switches remain active for both environments.

The production Security stack was deployed on 2026-07-12, the guard returned
`temporarily-disabled` in a live invocation, and the
`monorepo-production-autostop` EventBridge rule was re-enabled. It invokes the
guarded Lambda during the window and resumes normal enforcement when the window
expires. Verify the expected live state with:

```bash
aws events describe-rule --name monorepo-production-autostop --region eu-central-1 --query State --output text
```

Expected state: `ENABLED`. Re-enabling is safe during the window: the Lambda
returns `temporarily-disabled` without reading or changing ECS or RDS.

## Production after v1 — REMOVE prod from auto-stop

The prod auto-cold-pause is a **pre-v1 cost control only**. It is safe today
because prod has **0 paying users**. It is NOT safe once v1 ships and real
users onboard: a 5h-uptime cold-pause would drop the service mid-use and the
next user eats an ~8 min cold start.

**When v1 ships and users onboard:**

1. Remove `"production"` from `AUTO_STOP_ENVS` in `security-stack.ts`, deploy.
2. Run production **24/7**, OR on **pre-scheduled closed windows** only — a
   fixed-hours EventBridge cron (e.g. stop 02:00, resume 06:00 UTC), never an
   uptime TTL that can fire during business hours.

Staging keeps the 5h auto-cold-pause indefinitely (no uptime obligation).

## Related

- [`STAGING.md`](STAGING.md) — staging lifecycle specifics
- [`COST-INCIDENT.md`](COST-INCIDENT.md) — kill-switch + budgets
- `.context/aws-cost-investigation.md` — the cost review that motivated this
