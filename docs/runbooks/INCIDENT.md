# Incident Response (DORA-aligned)

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

DORA Article 19 reporting timeline:

- T+4h initial classification + report.
- T+72h interim report.
- T+1 month final report.

## Severity matrix

| SEV  | Definition                                                                                        | Ack target        | Reg report                                 |
| ---- | ------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------ |
| SEV1 | Customer money or data at risk; auth down; data integrity loss; cardholder data exposure          | <5 min            | Yes (per DORA Art. 19): T+4h, T+72h, T+1mo |
| SEV2 | Degraded service, no data loss; significant feature unavailable; performance degradation past SLO | <15 min           | Yes if regulator-relevant; document        |
| SEV3 | Internal / cosmetic / partial degradation with workaround                                         | next business day | None                                       |

## How incidents reach a human (detection, as deployed)

There is no Sentry, no Honeycomb, no AWS Incident Manager, and no
ntfy.sh. The real paths today:

1. **CloudWatch alarm → SNS → email + Telegram.** The CDK alarms
   (CPU/memory/RDS/storage/cost — see
   `infra/cdk/lib/observability-stack.ts`) publish to the per-env SNS
   topics (BillingTopic, KillSwitchTopic, KillSwitchOpsTopic). Production
   topics fan out to the operator email (repo secret `EMAIL_FORWARD_TO`,
   deliberately never committed) and an HTTPS subscription
   to the Telegram bot (`bot.afframe.com/sns`) which pings Telegram.
2. **App error → Telegram + Linear.** Unhandled api `/v1` errors
   (`DomainExceptionFilter`) and browser-side web errors
   (`/api/client-error`) POST to the bot, which creates/dedupes a Linear
   issue and pings Telegram. (Web server-side, admin, and non-`/v1` api
   errors are NOT yet covered.)
3. **Customer report / own observation** (status page, smoke check).

Paging = the Telegram bot to Hleb's phone. No paid pager service today
(no PagerDuty / OpsGenie). Revisit when team >= 2.

## Workflow

1. Detection via one of the three paths above.
2. Ack: respond in Telegram / note the alarm. Solo rota: Hleb is
   Incident Commander by default.
3. Classify SEV1 / 2 / 3 within 30 minutes.
4. Open a Linear issue (team `DEV`, label `incident`) titled
   `inc-YYYYMMDD-<slug>` as the audit trail — the bot may already have
   created one from the error path; use it. Live notes there: timeline,
   hypothesis, action.
5. Status page `https://status.afframe.com` updated within 15 minutes
   for SEV1/2 — see [STATUS-PAGE.md](STATUS-PAGE.md). (The status page
   runs on the OVH VPS, a separate failure domain from AWS.)
6. Mitigate (see first-15-minutes commands below; rollback procedure:
   [ROLLBACK.md](ROLLBACK.md)), then resolve.
7. PIR (Post-Incident Review) within 5 business days.

## First 15 minutes — commands

All commands assume `--region eu-central-1`; substitute `staging` for
`production` as needed.

Is the service running?

```bash
aws ecs list-services --cluster monorepo-production --region eu-central-1
aws ecs describe-services --cluster monorepo-production \
  --services <service-arn-from-above> --region eu-central-1 \
  --query 'services[0].{desired:desiredCount,running:runningCount,events:events[0:5].message}'
```

Is it the sleeping/cold-pause state rather than an outage? Both envs can
be auto-cold-paused (ECS 0 + RDS stopped) — check
[ENV-POWER.md](ENV-POWER.md) before treating a 503 "Afframe is asleep"
page as an incident.

What do the public endpoints say?

```bash
curl -si https://app.afframe.com/api/version | head -5
curl -si https://api.afframe.com/api/health | head -5
curl -si https://admin.afframe.com/api/health | head -5
```

Recent app logs (one log group per container):

```bash
aws logs tail /ecs/monorepo-production/web --since 30m --region eu-central-1
aws logs tail /ecs/monorepo-production/api --since 30m --region eu-central-1
```

Search for errors across a window (Logs Insights):

```bash
aws logs start-query --log-group-name /ecs/monorepo-production/api \
  --start-time $(date -v-1H +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /Error|error|500/ | sort @timestamp desc | limit 50' \
  --region eu-central-1
aws logs get-query-results --query-id <id-from-above> --region eu-central-1
```

Database reachable / in the right state?

```bash
aws rds describe-db-instances --region eu-central-1 \
  --query 'DBInstances[*].{id:DBInstanceIdentifier,status:DBInstanceStatus}'
```

Bad deploy suspected → [ROLLBACK.md](ROLLBACK.md) (SSM
`/monorepo/<env>/last-deploy/*` has the last-good tag; redeploy via
`gh workflow run _deploy-aws.yml ... -f image_tag_override=<tag>`).

Cost-runaway / kill-switch fired →
[COST-INCIDENT.md](COST-INCIDENT.md).

## Vendor outage triage

Hard dependencies that can degrade or fail us: GitHub (CI, code, packages), npm registry, Cloudflare (DNS, Tunnel, Workers — including the Telegram bot), AWS, Resend (email), Anthropic API. Triage path:

1. Confirm vendor status via their public status page (link in postmortem).
2. Classify as SEV based on user impact, not vendor severity. A GitHub Actions outage is SEV3 if no deploys are in flight; SEV2 if release is blocked.
3. Workaround if cheap (e.g., npm down → switch to a registry mirror; AI provider down → graceful 503 with retry-after).
4. No mitigation work that creates new debt during the outage. Wait it out, document, resume.
5. Postmortem only if user impact occurred or if the vendor outage exposed a missing fallback we should add.

Note: if Cloudflare or the bot Worker is down, BOTH alert paths
(SNS→Telegram, app-error→Telegram) are dark — fall back to email + the
AWS console.

## On-call rota (solo dev caveat)

Today: solo dev. Primary contact: Hleb. Channels: Telegram (via the
bot) and the operator email (repo secret `EMAIL_FORWARD_TO`; SNS
subscriptions). Escalation: email to break-glass contact (break-glass
record: offline dual-custody escrow, off-repo).

This is **not adequate** for a regulated production launch with paying customers. Before that:

- Add a second on-call (contractor or co-founder).
- Set up runbook coverage so a non-author can mitigate common failures.
- Document hand-off procedure.

## Regulator targets (Czech Republic)

- NÚKIB: NIS2 reporting for material cyber-incidents.
- CNB: financial sector incident reporting if licensing requires it.

Templates `templates/incident-{initial,interim,final}.md` to be added with the first SEV1.

## Communication templates

Posted to the public status page `https://status.afframe.com` (OpenStatus) — see [STATUS-PAGE.md](STATUS-PAGE.md) for how to open and update a status report.

Status page (SEV1):

> We are investigating an issue affecting <surface>. Customer impact: <impact>. Next update at <T+30min>.

Status page (resolved):

> The issue affecting <surface> from <start> to <end> is resolved. Root cause: <one-line>. We are running a postmortem and will publish findings.

## Postmortem template

`templates/postmortem.md` (added with first SEV1). Required sections:

- Summary (3 sentences).
- Timeline (UTC, with sources).
- Detection.
- Impact (customers, money, data).
- Root cause (5 whys, no individual blame).
- What went well.
- What did not.
- Action items with owners + deadlines, tracked as Issues.
