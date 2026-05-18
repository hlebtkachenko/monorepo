# DR Drill (Quarterly)

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

DORA expects quarterly evidence of disaster-recovery capability. This drill produces that evidence.

Objectives:

- RTO ≤ 4 hours (time to restored service).
- RPO ≤ 15 minutes (acceptable data loss).
- All telemetry and observability green on the restored stack.

## Schedule

- One full drill per quarter, scheduled in the first week.
- One tabletop exercise per quarter, scheduled mid-quarter.
- Calendar event auto-created from the GitHub workflow `_dr-drill.yml` (added with this runbook).

## Procedure

1. **Provision a fresh sandbox account** in the Sandbox OU (clean state, no production data).
2. **Trigger** `gh workflow run _dr-restore.yml -f source=production -f target=<sandbox-account-id>`.
3. **Restore** from latest AWS Backup snapshots:
   - RDS Postgres (point-in-time within RPO window).
   - S3 buckets via cross-region replication source.
   - DynamoDB tables (where used).
   - Secrets Manager secret values (re-rotate after restore).
4. **Smoke** with `k6 run scripts/dr-smoke.js` against the restored ALB endpoint.
5. **Verify**:
   - App boots, health check green.
   - `/api/version` returns the expected SHA.
   - RDS data integrity sample queries pass.
   - Secrets Manager rotation Lambda executes successfully.
   - OTel traces appear in Honeycomb (drill-tagged dataset).
6. **Teardown** the sandbox account at end of drill.
7. **Archive evidence** to `s3://<TBD-audit-bucket>/dr-drills/<yyyy-qq>/`:
   - Workflow run URL.
   - Start / restore / smoke timestamps.
   - k6 summary JSON.
   - Screenshots of Honeycomb dashboard.
   - Pass / fail decision.

## Pass criteria

- Wall-clock time from `_dr-restore` start to all checks green: < 4 hours.
- RPO measured by comparing restored DB latest write timestamp vs production latest write at workflow start: ≤ 15 minutes.
- All synthetic checks green within 5 minutes of restore complete (`https://status.afframe.com`).

## Failure handling

A failed drill is treated as a SEV1 against the DR system itself:

- Open SEV1 incident on the DR surface.
- Postmortem within 5 business days.
- Action items tracked; next drill cannot be marked passing until previous failures have remediation merged.

## Tabletop exercise (between full drills)

- IC walks through a hypothetical scenario (region failure, ransomware, accidental delete).
- Each on-call participates verbally; no actual systems touched.
- Outputs: runbook gaps, decision-rights gaps.
- Documented in `docs/runbooks/tabletop/<yyyy-qq>.md` (created with first exercise).
