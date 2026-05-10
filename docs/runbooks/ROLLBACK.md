# Rollback

Two paths, in order of preference.

## 1. Feature flag flip (no deploy)

If the bad change sits behind a flag, flip it in AWS AppConfig.

Pros: fastest, no supply-chain side effects.
Cons: only works for code paths that were flag-gated to begin with. Not all changes qualify.

## 2. Redeploy the previous signed image

**Never push a new "rollback" image** — that breaks the supply-chain audit trail and forces a new signature, attestation, and provenance record. Always redeploy a previously-signed digest.

### Steps

```bash
PREVIOUS_DIGEST=sha256:<TBD-previous-known-good-digest>
ECR_REPO=<TBD-ecr-repo>     # e.g. <acct>.dkr.ecr.eu-central-1.amazonaws.com/web

# 1. Verify the previous image is still cosign-signed and the attestation chain is intact.
cosign verify "$ECR_REPO@$PREVIOUS_DIGEST" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

cosign verify-attestation --type slsaprovenance "$ECR_REPO@$PREVIOUS_DIGEST" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# 2. Trigger the rollback workflow with the explicit digest pinned.
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=App-production \
  -f imageDigest=$PREVIOUS_DIGEST
```

### What it does on AWS

- Renders a new ECS task definition with the pinned image digest.
- Updates the service to the new task definition (rolling, two-task minimum).
- Watches health checks for 5 minutes; auto-aborts if 5xx > 0.1% or healthy task count drops.

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
