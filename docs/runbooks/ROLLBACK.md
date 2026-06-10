# Rollback

Application rollback = **redeploy a previously-signed image by tag**.
There is no feature-flag service (no AWS AppConfig in this infra) — if a
bad change shipped, you redeploy the last good image.

**Never push a new "rollback" image** — that breaks the supply-chain
audit trail and forces a new signature, attestation, and provenance
record. Always redeploy a previously-built tag that already exists in ECR.

Fastest path: the Telegram bot's `/rollback <env> <tag>` command
(confirm-gated; it fires the same `workflow_dispatch` as below). The
manual procedure:

## 1. Find the previous good image tag

The deploy workflow records every successful deploy in SSM
(`_deploy-aws.yml`, end of the deploy job):

- `/monorepo/<env>/last-deploy/image-tag` — image tag (e.g. `sha-abcdef`)
- `/monorepo/<env>/last-deploy/git-sha` — full git SHA
- `/monorepo/<env>/last-deploy/task-def-arn` — task definition ARN
- `/monorepo/<env>/last-deploy/image-tag-<svc>` — per-service tags (web/api/admin)

```bash
aws ssm get-parameter \
  --name /monorepo/production/last-deploy/image-tag \
  --region eu-central-1 --query 'Parameter.Value' --output text
```

Careful which value you need:

- **The bad deploy FAILED mid-rollout**: the ECS deployment circuit
  breaker already rolled the service back automatically — the SSM value
  above is still the last GOOD tag (the failed run never wrote it).
  Often no manual action is needed; verify with step 4.
- **The bad deploy SUCCEEDED and the bad code is live**: the SSM value
  IS the bad tag. Get the previous one from SSM parameter history:

```bash
aws ssm get-parameter-history \
  --name /monorepo/production/last-deploy/image-tag \
  --region eu-central-1 \
  --query 'Parameters[*].[LastModifiedDate,Value]' --output text
```

Pick the value before the bad deploy. Cross-check against the deploy run
list if unsure: `gh run list --workflow=_deploy-aws.yml --limit 10`.

## 2. Verify the previous image is signed (digest check)

Map the tag to its digest, then verify signature + provenance:

```bash
PREVIOUS_TAG=sha-abcdef
ECR_REPO=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.eu-central-1.amazonaws.com/monorepo-production-web

DIGEST=$(aws ecr describe-images \
  --repository-name monorepo-production-web \
  --image-ids imageTag=$PREVIOUS_TAG \
  --region eu-central-1 \
  --query 'imageDetails[0].imageDigest' --output text)

cosign verify "$ECR_REPO@$DIGEST" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

cosign verify-attestation --type slsaprovenance "$ECR_REPO@$DIGEST" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

(Repeat for `monorepo-production-api` / `-admin`. Tags can diverge per
service: the deploy workflow builds only changed services, and skipped
services keep their per-service last-deploy tags. Cross-check the
`/monorepo/<env>/last-deploy/image-tag-<svc>` history or
`aws ecr describe-images` to confirm the chosen tag exists in **all
three** repos before dispatching — `image_tag_override` pins all three
services to one tag, and a missing image fails the task at pull time.)

## 3. Redeploy the previous tag

`_deploy-aws.yml` has a `workflow_dispatch` trigger with an
`image_tag_override` input — it takes an existing ECR **tag**, skips the
image build, and re-renders the task definition with that tag:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=app-only \
  -f image_tag_override=$PREVIOUS_TAG
```

Watch it: `gh run watch $(gh run list --workflow=_deploy-aws.yml --limit 1 --json databaseId -q '.[0].databaseId')`

## 4. What it does on AWS (and what it does NOT)

- Renders a new ECS task definition pinned to the tag and updates the
  single service (one Fargate task, `desiredCount: 1`,
  `minHealthyPercent: 100` / `maxHealthyPercent: 200` — the replacement
  task starts alongside the old one before the old one stops).
- The ECS **deployment circuit breaker** (`rollback: true`) aborts and
  reverts automatically if the new task fails container health checks.
- There is **no** 5xx-rate auto-abort and no two-task minimum — health
  checks are the only automatic gate.

Verify after rollout: `curl -s https://app.afframe.com/api/version`
should show the rolled-back build version.

## Database rollback

Database changes are forward-only. Reverse-migration is allowed only when:

1. The schema change shipped behind an expand-contract pattern (additive, not destructive), AND
2. A dual-write / dual-read window was in place, AND
3. A rollback-tested reverse migration script exists and was rehearsed.

Otherwise: forward-fix. Reverting a destructive migration without a rehearsed reverse is the path to data loss.

## Postmortem

Every rollback triggers a postmortem within 5 business days. Template lives at `templates/postmortem.md` (added with first SEV1). Required sections:

- Timeline.
- What broke.
- Why the safeguards did not catch it.
- Action items with owners and deadlines.
- Update to this runbook if the procedure missed a step.

No-blame; focus on systems.
