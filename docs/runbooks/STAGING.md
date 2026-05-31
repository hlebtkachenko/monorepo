# Staging environment — lifecycle & cost rules

> Why this exists: staging is a **full second copy** of the production stack
> (its own ECS task + RDS instance + secrets + budgets). Run 24/7 it costs about
> the same as production (~$45/mo gross at zero clients). The AFF cost review
> 2026-05-31 found both envs running continuously, which doubled the always-on
> floor and blew the $50/mo target. **Staging is now ephemeral: up only while
> you are actively testing, down the rest of the time.**

All costs below are **real gross usage** (what you pay once AWS credits run
out), never credit-discounted.

## What staging is for

- Dry-running a deploy / migration before production.
- Reproducing a bug against production-like infra.
- Nothing else. It has no clients and no uptime obligation.

## The rule

**Staging defaults to OFF.** Bring it up for a test session, tear it down when
done. Never leave it running overnight. The cost-runaway kill-switch and the
planned auto-stop (below) are backstops for when you forget — not the primary
mechanism. You are.

## Cost of leaving it on

| State                                 | ~Gross $/mo | Notes                               |
| ------------------------------------- | ----------- | ----------------------------------- |
| Fully running (ECS task + RDS)        | ~$45        | same as production                  |
| RDS stopped, ECS at 0 (the OFF state) | ~$2         | stopped-disk storage + backups only |

Stopping RDS removes the ~$16/mo compute line; scaling ECS to 0 removes the
~$19/mo Fargate line + the public-IPv4 line. The residual ~$2 is unavoidable
unless the stack is fully destroyed.

## Bring staging UP (start of a test session)

```bash
export AWS_PROFILE=<your-profile> AWS_REGION=eu-central-1

# 1. Find the staging RDS instance id
SID=$(aws rds describe-db-instances \
  --query "DBInstances[?starts_with(DBInstanceIdentifier,'data-staging')].DBInstanceIdentifier | [0]" \
  --output text)

# 2. Remove the keep-stopped tag, then start RDS (takes a few minutes)
aws rds remove-tags-from-resource \
  --resource-name "arn:aws:rds:${AWS_REGION}:$(aws sts get-caller-identity --query Account --output text):db:${SID}" \
  --tag-keys cost-stop-requested
aws rds start-db-instance --db-instance-identifier "$SID"

# 3. Wait until available
aws rds wait db-instance-available --db-instance-identifier "$SID"

# 4. Bring the Fargate task back (a staging deploy also does this, since the
#    CDK service desiredCount=1; a plain scale-up is enough for an existing
#    image):
aws ecs update-service --cluster monorepo-staging \
  --service "$(aws ecs list-services --cluster monorepo-staging --query 'serviceArns[0]' --output text | xargs basename)" \
  --desired-count 1
```

> The `cost-stop-requested` tag MUST be removed before starting, otherwise the
> RdsRestartWatcher Lambda will immediately re-stop the instance.

## Shut staging DOWN (end of a test session)

```bash
export AWS_PROFILE=<your-profile> AWS_REGION=eu-central-1
SID=$(aws rds describe-db-instances \
  --query "DBInstances[?starts_with(DBInstanceIdentifier,'data-staging')].DBInstanceIdentifier | [0]" \
  --output text)
ACCT=$(aws sts get-caller-identity --query Account --output text)

# 1. Scale the Fargate task to 0
aws ecs update-service --cluster monorepo-staging \
  --service "$(aws ecs list-services --cluster monorepo-staging --query 'serviceArns[0]' --output text | xargs basename)" \
  --desired-count 0

# 2. Tag + stop RDS (tag first so the RdsRestartWatcher keeps it down past
#    AWS's 7-day forced restart)
aws rds add-tags-to-resource \
  --resource-name "arn:aws:rds:${AWS_REGION}:${ACCT}:db:${SID}" \
  --tags Key=cost-stop-requested,Value=true
aws rds stop-db-instance --db-instance-identifier "$SID"
```

## Backstops (for when you forget)

1. **Cost kill-switch.** The staging `Total` budget caps staging spend at $55
   (measured per-env via the `Environment` cost-allocation tag). At 100% it
   stops staging's ECS **and** RDS. This is a runaway cap, not a daily cleanup —
   it fires at month-scale dollars, not after one forgotten night.
2. **RdsRestartWatcher.** AWS force-starts a stopped RDS after ~7 days; the
   watcher re-stops it as long as the `cost-stop-requested=true` tag is present.
3. **Auto-stop after uptime TTL.** A scheduled Lambda
   (`monorepo-staging-staging-autostop`, EventBridge every 30 min) stops staging
   (ECS→0, RDS→stopped, tags for the RdsRestartWatcher) once the running task has
   been up longer than `MAX_UPTIME_HOURS` (default **5h**), and emails the ops
   topic. It is a **max-uptime TTL**, not request-level idle detection: traffic
   terminates at Cloudflare (no ALB), so ECS has no cheap request signal. A
   genuinely-needed long session is just restarted (see "Bring staging UP"). The
   Lambda exists only on the staging env. Takes effect once the staging Security
   stack is deployed.

## Related

- [`COST-INCIDENT-RESPONSE.md`](COST-INCIDENT-RESPONSE.md) — kill-switch + budget
- [`AWS-DEPLOY.md`](AWS-DEPLOY.md) — full deploy procedure
- ADR [`0016-cost-runaway-protection.md`](../adr/0016-cost-runaway-protection.md)
- `.context/aws-cost-investigation.md` — the cost review that motivated this
