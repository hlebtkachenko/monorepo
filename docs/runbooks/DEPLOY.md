# Deploy

Active. `vars.AWS_BOOTSTRAPPED=true` is set (2026-05-11), so `_deploy-aws.yml` runs. Staging deploys are live; production deploys additionally require approval in the `production` GitHub environment and have not been run yet.

## Trigger matrix

| Trigger                | Behaviour                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Tag a release `v0.x.x` | `release.yml` builds + signs the image, uploads SBOM, then calls `_deploy-aws.yml env=staging`                     |
| Push to `main`         | `ci.yml` runs full check suite. No deploy on plain main pushes — releases gate via tags.                           |
| Manual prod            | `gh workflow run _deploy-aws.yml -f environment=production -f stack=App-production`, approve in GitHub environment |

## Pre-deploy checklist

- [ ] PR risk fields filled (data sensitivity, blast radius, rollback plan, cost estimate).
- [ ] Cosign attestation verified on the candidate image (`cosign verify-attestation`).
- [ ] Smoke on staging: `/api/version` (Next.js) returns expected `sha`, `version`, `time`; `/api/health` (NestJS) returns `{status: "ok"}`.
- [ ] Synthetic checks green for the last 24h on staging (`https://status.afframe.com`).
- [ ] No SEV1/SEV2 incident open against this surface.

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

## Canary stages

`_deploy-aws.yml` (production path) runs canary stages:

1. 5% of traffic for 10 minutes. Watch error rate, p95 latency, business KPIs.
2. 25% of traffic for 10 minutes. Same watch.
3. 100%.

Halt conditions (auto-rollback):

- Error rate > baseline + 1pp.
- p95 latency > baseline x 1.5.
- 5xx rate > 0.1%.
- Manual halt at any stage via `gh workflow run _rollback.yml`.

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
