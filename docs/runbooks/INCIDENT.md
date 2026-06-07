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

## Workflow

1. Detection (Sentry, Honeycomb alarm, customer report, internal observation).
2. AWS Incident Manager response plan triggers SNS topic `incidents-prod` -> email + ntfy.sh push.
3. On-call ack via SSM Incident Manager web console within target time.
4. Classification: SEV1 / 2 / 3 within 30 minutes.
5. Open `#inc-YYYYMMDD-<slug>` channel. Even solo: dedicated channel = audit trail.
6. Incident Commander assigned. Solo dev rota: Hleb is IC by default.
7. Status page `https://status.afframe.com` updated within 15 minutes for SEV1 / 2 — see [STATUS-PAGE.md](STATUS-PAGE.md).
8. Live notes in the channel: timeline, hypothesis, action.
9. Mitigation, then resolution.
10. PIR (Post-Incident Review) within 5 business days.

## Vendor outage triage

Hard dependencies that can degrade or fail us: GitHub (CI, code, packages), npm registry, Cloudflare (DNS, CDN), Anthropic API, AWS (when wired), Honeycomb. Triage path:

1. Confirm vendor status via their public status page (link in postmortem).
2. Classify as SEV based on user impact, not vendor severity. A GitHub Actions outage is SEV3 if no deploys are in flight; SEV2 if release is blocked.
3. Workaround if cheap (e.g., npm down → switch to a registry mirror; AI provider down → graceful 503 with retry-after).
4. No mitigation work that creates new debt during the outage. Wait it out, document, resume.
5. Postmortem only if user impact occurred or if the vendor outage exposed a missing fallback we should add.

## On-call rota (solo dev caveat)

Today: solo dev. AWS Incident Manager response plan with single contact + free notification fan-out.

- Primary contact: Hleb. Channels: email (`<TBD>` work address) + ntfy.sh topic `monorepo-incidents-<TBD>` for iOS push.
- ntfy.sh is OSS; default to public ntfy.sh (free) or self-host on the OVH VPS for full control.
- Escalation: email to break-glass contact (break-glass record: sealed envelope, office safe).
- No paid pager service today (no PagerDuty / OpsGenie / Splunk On-Call). Revisit when team >= 2.

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
