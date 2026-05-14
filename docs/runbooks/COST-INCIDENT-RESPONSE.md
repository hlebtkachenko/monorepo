# Cost Incident Response

What to do when an alarm fires, the kill-switch stops the service, or a Budget breach hits.

See [ADR 0016](../adr/0016-cost-runaway-protection.md) for the defense layering and rationale.

## 1. Kill-switch fired (ECS service stopped)

Symptoms: app returns 502 / no response, `aws ecs describe-services` shows `desiredCount: 0`, an email landed naming a `monorepo-*-critical` or attack-vector alarm.

### 1.1 Identify what fired

```bash
ENV=staging  # or production
aws logs tail /aws/lambda/monorepo-$ENV-cost-killswitch --since 1h --format short
```

The Lambda logs structured JSON: `event=service-stopped` lines name the alarm.

Cross-check in CloudTrail (console: CloudTrail -> Event history -> filter by `Event name: UpdateService`).

### 1.2 Investigate root cause

Inspect CloudWatch for the metric the alarm fires on:

| Alarm | Metric | What to look at |
|---|---|---|
| `*-fargate-network-out-high` | `ECS/ContainerInsights NetworkTxBytes` | Who is the task talking to? Check VPC Flow Logs (if enabled) and Cloudflare Tunnel access logs |
| `*-s3-put-rate-high` | `AWS/S3 PutRequests` | `aws s3 ls s3://monorepo-$ENV-app-* --recursive --human-readable --summarize` |
| `*-s3-bucket-size-high` | `AWS/S3 BucketSizeBytes` | Same as above; look for unexpected prefixes |
| `*-cwlogs-ingest-high` | `AWS/Logs IncomingBytes` | `aws logs filter-log-events --log-group-name /ecs/monorepo-$ENV/<container> --start-time ...` |
| `*-fargate-cpu-critical` | `AWS/ECS CPUUtilization` | Crypto-miner? Inspect last container image; rebuild from known-good SHA |
| `*-fargate-memory-critical` | `AWS/ECS MemoryUtilization` | Same |

### 1.3 Re-enable the service (when safe)

```bash
aws ecs update-service \
  --cluster monorepo-$ENV \
  --service <service-name> \
  --desired-count 1
```

(Get the service name from the most recent CloudFormation output or `aws ecs list-services --cluster monorepo-$ENV`.)

The task takes ~2 min to come up. Watch the health check at the cloudflared domain.

### 1.4 If a budget breach triggered the stop

Inspect AWS Console -> Billing -> Budgets. The breached budget will be > 100%. Wait 8-12h for budget tracking to catch up before re-enabling, OR raise the budget temporarily for the rest of the month.

## 2. Budget exceeded (notification only, no auto-action)

Symptoms: email named `monorepo-*-monthlytotal` (or another service line). Service still running because either the 100% threshold has not been crossed yet or the kill-switch failed.

### 2.1 Confirm whether ECS is still running

```bash
aws ecs describe-services --cluster monorepo-$ENV --services <service-name> --query 'services[0].desiredCount'
```

If `1`, the 100% threshold has not yet been crossed. Wait or pre-empt by manually stopping (`update-service --desired-count 0`).

### 2.2 Identify which service is over

AWS Console -> Cost Explorer -> Group by Service -> filter to current month -> sort by Unblended Cost.

### 2.3 Decide: stop or scale

- **Stop:** `aws ecs update-service --desired-count 0`. Cheapest. App is down.
- **Scale down:** lower memory/cpu on TaskDef and redeploy. Requires `cdk deploy App-$ENV` after edit.
- **Raise the budget:** intentional cost overrun (load test, migration). Edit `infra/cdk/lib/security-stack.ts` -> bump `limitUsd` on the affected budget -> commit -> redeploy.

## 3. RDS auto-restart watcher fired

Symptoms: an email or CloudWatch Logs entry from `/aws/lambda/monorepo-$ENV-rds-restart-watcher` showing `event=db-stopped`.

This is expected after AWS forcibly starts a stopped DB (~7-day clock). The watcher only re-stops when the DB has tag `cost-stop-requested=true`.

To allow AWS to keep the DB running:

```bash
aws rds remove-tags-from-resource \
  --resource-name arn:aws:rds:eu-central-1:<account>:db:<instance-id> \
  --tag-keys cost-stop-requested
```

Then manually start the DB:

```bash
aws rds start-db-instance --db-instance-identifier <instance-id>
```

## 4. Email noise (silence false-positive alarms)

If a specific alarm is false-positiving (e.g., a planned bulk-load triggers `s3-put-rate-high`):

### 4.1 Temporary silence (CLI)

```bash
aws cloudwatch disable-alarm-actions --alarm-names monorepo-$ENV-<alarm-name>
```

Re-enable after the planned event:

```bash
aws cloudwatch enable-alarm-actions --alarm-names monorepo-$ENV-<alarm-name>
```

### 4.2 Permanent threshold change

Edit `infra/cdk/lib/observability-stack.ts`, adjust threshold, commit, `cdk deploy Observability-$ENV`.

## 5. Re-enable after manual stop of RDS

If you manually stopped the DB (not via the killswitch) and want it stopped permanently:

```bash
aws rds add-tags-to-resource \
  --resource-name arn:aws:rds:eu-central-1:<account>:db:<instance-id> \
  --tags Key=cost-stop-requested,Value=true
aws rds stop-db-instance --db-instance-identifier <instance-id>
```

After the AWS-forced 7-day restart, the watcher Lambda will re-stop the instance automatically.

## 6. Worst case: account lockout

The killswitch and AWS Budgets in this stack do NOT attach IAM-deny policies, so they cannot lock the operator (`claude-cli` user or any human) out of the AWS console or CLI. If a future change adds Budget Actions of type `APPLY_IAM_POLICY`:

1. Use the root account credentials from 1Password.
2. AWS Console -> IAM -> Users -> `claude-cli` (or affected principal) -> Detach the deny policy.
3. Open an incident and ADR follow-up.

## Pre-deploy checklist

Before merging changes to `infra/cdk/lib/security-stack.ts` or `observability-stack.ts`:

- [ ] `pnpm --filter @workspace/cdk test` passes
- [ ] `cdk diff` reviewed line by line (especially for IAM policy changes)
- [ ] Email subscription confirmation: after first deploy, click the AWS confirmation link in the alert inbox. Subscription stays `PendingConfirmation` until clicked
- [ ] Smoke-test alarm fire: `aws cloudwatch set-alarm-state --alarm-name monorepo-$ENV-fargate-network-out-high --state-value ALARM --state-reason "manual test"` -> confirm desiredCount=0 within 2 min -> restore desired count
