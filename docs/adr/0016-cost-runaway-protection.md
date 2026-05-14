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
- 3 of the 5 budgets are paid ($0.02/day each = ~$1.80/mo).

Follow-up work required:

- Confirm SNS email subscription from the AWS link after first deploy (the address starts in "Pending" state).
- Custom Next.js cacheHandler that writes to `/tmp/.next-cache` so the web container can also enable readonlyRootFilesystem.
- AWS Budgets Actions (RUN_SSM_DOCUMENTS or APPLY_IAM_POLICY) for stronger dollar caps. Deferred because budget execution roles have high blast radius and the 7-day requiresApproval mode is operational overhead. The SNS->Lambda path is the dollar-cap safety net for now.

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
- `infra/cdk/lib/billing-alarms-stack.ts` - us-east-1 EstimatedCharges alarms
- `infra/cdk/lib/app-stack.ts` - Fargate task hardening (capDrop, tmpfs, readonlyRoot)
