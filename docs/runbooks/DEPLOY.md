# Deploy

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

Active. `vars.AWS_BOOTSTRAPPED=true` is set (2026-05-11), so `_deploy-aws.yml` runs. Published releases enter the one-hour automatic CD hold; manual deploy remains available for recovery and operator-directed changes.

## Trigger matrix

| Trigger                | Behaviour                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tag a release `v0.x.x` | `release.yml` builds and publishes the signed GitHub Release, waits one hour, then deploys an eligible stable release to staging and production. Release candidates stop after staging. Add `<!-- cd:skip -->` to the release body to suppress automatic CD. |
| Push to `main`         | `ci.yml` runs full check suite. No deploy on plain main pushes — releases gate via tags.                                                                                                                                                                     |
| Manual deploy          | `gh workflow run _deploy-aws.yml -f environment=<staging\|production>`. A manual deployment started during the one-hour release hold suppresses automatic CD for that release.                                                                               |

## Pre-deploy checklist

- [ ] PR risk fields filled (data sensitivity, blast radius, rollback plan, cost estimate).
- [ ] Cosign attestation verified on the candidate image (`cosign verify-attestation`).
- [ ] Smoke on staging: `/api/version` (Next.js) returns expected `sha`, `version`, `time`; `/api/health` (NestJS) returns `{status: "ok"}`.
- [ ] Synthetic checks green for the last 24h on staging (`https://status.afframe.com`).
- [ ] No SEV1/SEV2 incident open against this surface.

## Pre-deploy data check — migration 0051

Before deploying the release that contains DB migrations 0050–0053, verify data compatibility with `0051_vat_status_filing_period_guard.sql`. That migration runs `VALIDATE CONSTRAINT vat_status_filing_period_regime_check`, which hard-fails the migration (and aborts the deploy) if any `vat_status` row has `vat_regime_code <> 'PAYER'` AND `filing_period IS NOT NULL`. A later migration cannot rescue it — 0051 aborts the batch first.

Run the check below before deploying; it must return `0`.

```sql
SELECT count(*) FROM vat_status WHERE vat_regime_code <> 'PAYER' AND filing_period IS NOT NULL;
```

If the count is non-zero, inspect the offending rows to confirm which orgs carry bad data, then null the stray `filing_period` values and re-run the check:

```sql
UPDATE vat_status SET filing_period = NULL WHERE vat_regime_code <> 'PAYER' AND filing_period IS NOT NULL;
```

## Cosign verify

```bash
IMAGE=ghcr.io/hlebtkachenko/monorepo/web@sha256:<TBD-digest>
cosign verify "$IMAGE" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
cosign verify-attestation --type slsaprovenance "$IMAGE" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Fail = stop. Do not proceed with an unverifiable image.

## Deploy mechanics

`_deploy-aws.yml` warms RDS + the current ECS revision in `deploy-prep` while
images build, then performs a single ECS rolling deploy. There is no canary
logic. The workflow renders a new ECS task definition, triggers a rolling
update, watches health checks for ~5 minutes, and auto-aborts with an ECS
circuit-breaker rollback on failure. There is no `_rollback.yml` workflow.

## Rollback triggers

See `docs/runbooks/ROLLBACK.md`. Roll back if:

- Canary halt condition fires.
- Synthetic checks red for >5 min after promote (`https://status.afframe.com`).
- New SEV1 / SEV2 against the deployed surface.
- Customer-facing regression discovered within 1 hour.

## Post-deploy

- [ ] Release notes auto-published from PR titles (release-please or equivalent — added later).
- [ ] Status page `https://status.afframe.com` updated if customer-visible change — see [STATUS-PAGE.md](STATUS-PAGE.md).
- [ ] Honeycomb dashboard sanity check.
