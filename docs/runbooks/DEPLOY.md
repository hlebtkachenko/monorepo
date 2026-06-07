# Deploy

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

Active. `vars.AWS_BOOTSTRAPPED=true` is set (2026-05-11), so `_deploy-aws.yml` runs. Staging deploys are live; production deploys additionally require approval in the `production` GitHub environment (first prod deploy: v0.2.5, 2026-06-01).

## Trigger matrix

| Trigger                | Behaviour                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag a release `v0.x.x` | `release.yml` builds the `apps/web` tarball + SLSA L3 provenance + CycloneDX SBOM + cosign signature, creates the GitHub Release. **Does NOT deploy to AWS** — deploy is a separate manual step (see `docs/conventions/RELEASES.md` "Tag → deploy order"). |
| Push to `main`         | `ci.yml` runs full check suite. No deploy on plain main pushes — releases gate via tags.                                                                                                                                                                   |
| Manual deploy          | `gh workflow run _deploy-aws.yml -f environment=<staging\|production>` (production requires environment approval). After tagging, deploy is what actually moves AWS to the new version.                                                                    |

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

## Deploy mechanics

`_deploy-aws.yml` performs a single ECS rolling deploy — there is no canary logic. The workflow renders a new ECS task definition, triggers a rolling update (two-task minimum during rollout), watches health checks for ~5 minutes, and auto-aborts with an ECS circuit-breaker rollback on failure. There is no `_rollback.yml` workflow.

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
