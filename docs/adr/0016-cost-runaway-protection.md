# 16. AWS cost-runaway protection

- Status: Accepted
- Date: 2026-05-14
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The single-account MVP stack (ADR 0007) is in dev mode: 5 test orgs, no real launch, ~$28/mo baseline. CloudWatch alarms were configured at default 80%/95% with no email subscription (silent). No AWS Budgets, no auto-shutdown.

Cost-runaway attack vectors are practical: dump 1 TB to S3, exfiltrate 10 TB through egress, peg CPU with a crypto-miner. AWS bills accumulate fast and the account is not yet partitioned away from a personal credit card.

## Decision

Layer three independent defenses, each cheap on its own:

1. **CloudWatch alarms with email at 70% warning + attack-vector thresholds**, and kill-switch SNS at 95% critical.
2. **Lambda kill-switch** (`SecurityStack`) that stops the ECS service (`desiredCount=0`) on receipt of an SNS message from one of the 5 wired alarms or any Budget breach.
3. **5 AWS Budgets** ($40 total, $10 data transfer, $5 S3, $20 RDS, $25 ECS) with 80%/100% notifications. 100% breach publishes to the kill-switch SNS topic so the dollar cap and the metric cap converge on the same Lambda action.

Fargate task hardening (capDrop ALL on all 3 containers, readonlyRoot on api + cloudflared, tmpfs at /tmp) blocks most crypto-miner payloads at the task level.

CloudTrail single-region management-events trail (free tier) provides forensics. RDS auto-restart watcher Lambda re-stops the DB after AWS's ~7-day forced restart when the DB is tagged `cost-stop-requested=true`.

## Consequences

Positive:

- Monthly worst-case spend capped at ~$50 (Budget lag 8-12h means the dollar limits overshoot ~15-25%).
- Email visibility at 70% utilization gives lead time before the kill-switch fires.
- Kill-switch is one Lambda, narrowly scoped IAM (ecs:DescribeServices + ecs:UpdateService on a single service ARN). No SCP, no IAM-deny lockout risk for the human operator.
- Budget Actions are intentionally NOT used; the SNS->Lambda path is shared between alarms and budgets so there is one code path to operate.

Negative / trade-offs:

- Kill-switch can false-positive on a real legitimate traffic burst. Mitigated by 70% email warning + 2x5min sustained window on critical CPU/Memory thresholds.
- Stopping ECS does not stop in-flight RDS queries; the rds-network-out alarm is alarm-only for that reason.
- AWS Budgets carry an 8-12h data lag; they are a dollar-cap backstop, not the primary cost signal. The CloudWatch+Lambda path fires within minutes.
- Web container keeps writable root because Next.js standalone writes to `/app/.next/cache`. A follow-up custom `cacheHandler` PR can flip it.
- 4 of the 6 budgets are paid ($0.02/day each = ~$2.40/mo).

Follow-up work required:

- Confirm SNS email subscription from the AWS link after first deploy (the address starts in "Pending" state).
- Custom Next.js cacheHandler that writes to `/tmp/.next-cache` so the web container can also enable readonlyRootFilesystem.
- AWS Budgets Actions (RUN_SSM_DOCUMENTS or APPLY_IAM_POLICY) for stronger dollar caps. Deferred because budget execution roles have high blast radius and the 7-day requiresApproval mode is operational overhead. The SNS->Lambda path is the dollar-cap safety net for now.

## Amendment (2026-05-17): BillingAlarmsStack removed

`BillingAlarmsStack` — two CloudWatch alarms on the `AWS/Billing` `EstimatedCharges` metric ($40 warning, $80 critical) plus an email-only SNS topic — has been deleted.

Reason: the project consolidated to a single region (eu-central-1). `EstimatedCharges` is published by AWS only in us-east-1, so the stack forced a second region and a second CDK bootstrap for no enforcement value. The two alarms were email-only and never wired to the kill-switch (`KILL_SWITCH_ALARM_NAMES` lists only the five ECS/S3/log alarms); they duplicated the `MonthlyTotal` $40 Budget's own email notifications, and `EstimatedCharges` refreshes only every ~6h, so they were no faster than the Budget.

Dollar-cap enforcement is now solely the `MonthlyTotal` $40 Budget at 100% -> kill-switch SNS -> ECS stop (defense 3 above), unchanged. There is no dollar trigger above $40; that is accepted and consistent with the ~$50 worst-case ceiling stated in Consequences. The attack-vector CloudWatch alarms and the kill-switch are untouched.

## Amendment (2026-05-17): KillSwitchFn concurrency reservation removed

`KillSwitchFn` previously set `reservedConcurrentExecutions: 1` as defense against a flapping-alarm + budget concurrent-fire race on `ecs:UpdateService`. Removed because new AWS accounts cap the unreserved-concurrency pool at AWS's 10-execution floor; any reservation > 0 blocks `CREATE_COMPLETE` on `Security-staging` with `"Specified ReservedConcurrentExecutions for function decreases account's UnreservedConcurrentExecution below its minimum value of [10]"`.

Correctness still holds without the reservation: the handler is idempotent (`UpdateService desiredCount=0` is a no-op the second time), the SNS subscription has a DLQ (`KillSwitchDlq`), and `KillSwitchErrorsAlarm` pages via `KillSwitchOpsTopic` on any invocation failure. ADR-0016's "three independent defenses" never named concurrency reservation as one of them; the protection was a belt on top of suspenders.

Restore the reservation if and when an AWS service-quota increase for "Concurrent executions" is granted on this account and a measured race justifies re-pinning concurrency.

## Amendment (2026-05-19): HardCap50 budget added

A sixth budget `monorepo-${env}-hardcap50` ($50 monthly actual spend, 100% threshold) has been added alongside `MonthlyTotal` ($40). Its 100% notification subscribers are identical to MonthlyTotal: alert email + `KillSwitchTopic` SNS.

Reason: defense-in-depth. `MonthlyTotal` is the primary $40 trip-wire; if it misfires (subscription `PendingConfirmation`, kill-switch Lambda failure not cleared by DLQ, operator suppressing the alarm), HardCap50 fires the same path again at $50. The two budgets are independent at the AWS Budgets layer; both have to fail for cost to keep climbing.

The earlier "~$50 worst-case ceiling" in Consequences was an estimate derived from MonthlyTotal $40 + budget propagation lag (~6h on a small Fargate task). HardCap50 now codifies that ceiling as an explicit second budget rather than relying on the implicit lag bound. Cost overhead: +$0.60/mo (one additional paid budget beyond the 2 free per account).

Pre-existing manual budget `monorepo-staging-hard-cap-50` (created via CLI 2026-05-19 before this amendment landed) must be deleted before the CDK-managed `monorepo-${env}-hardcap50` deploys, otherwise the two coexist with identical wiring.

## Alternatives considered

- **GuardDuty + WAF.** $5-15/mo, detection-only. Doesn't auto-stop. Cloudflare WAF is already in front; AWS WAF would duplicate. Revisit at first paying customer.
- **AWS Budgets Actions only.** Native IAM-deny on user / RDS stop / SCP apply. Higher blast radius (could lock the operator out of the account), 7-day approval mode adds operational lift, action types are limited (no direct Lambda invocation). The SNS notification path is more flexible.
- **No automatic kill-switch.** Email-only at 70% + 95% plus AWS Budgets at 80% + 100%. Relies on human response inside the 8-12h budget lag. Rejected because the attacker may dump terabytes in minutes.

## See also

- [ADR 0007 - Single-account MVP](0007-mvp-single-account-cdk-only.md)
- [ADR 0008 - Cloudflare Tunnel](0008-cloudflare-tunnel-and-email.md)
- [docs/runbooks/COST-INCIDENT-RESPONSE.md](../runbooks/COST-INCIDENT-RESPONSE.md)
- `infra/cdk/lib/security-stack.ts` - kill-switch Lambda + Budgets + CloudTrail + RDS watcher
- `infra/cdk/lib/observability-stack.ts` - 6 attack-vector alarms + 2 critical alarms
- `infra/cdk/lib/app-stack.ts` - Fargate task hardening (capDrop, tmpfs, readonlyRoot)
