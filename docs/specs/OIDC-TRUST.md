# OIDC Trust Policy Specification

GitHub Actions assumes an AWS IAM role via OpenID Connect. This document is the source of truth for the trust policy. Every workload account uses the same template; only the account-specific values change.

## Principles

- **Environment-scoped, not branch-scoped.** Branch claims (`ref:refs/heads/main`) are spoofable from PR forks via the `pull_request_target` event surface and similar paths. Environment claims (`environment:production`) require GitHub's environment gating to succeed, which is enforced server-side by GitHub.
- **One role per environment**, not one role per branch.
- **Audience locked to `sts.amazonaws.com`.**
- **Minimum permissions on the role**, not minimum on the trust policy. Trust gates who can assume; permissions gate what they can do.

## Trust policy template

For each workload account (staging, production), create one role per environment with this trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<TBD-workload-account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:hlebtkachenko/monorepo:environment:<TBD-env>"
        }
      }
    }
  ]
}
```

Replace:

- `<TBD-workload-account-id>` with the account ID where the role lives.
- `<TBD-env>` with `staging` or `production`.

## Provider registration

OIDC provider URL: `https://token.actions.githubusercontent.com`
Audience: `sts.amazonaws.com`
Thumbprint: GitHub publishes; pin in code at registration time.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list <TBD-thumbprint> \
  --profile <TBD-account-profile>
```

Run once per workload account (the OIDC provider is account-scoped, not org-scoped, in IAM).

## Applying via gh CLI (post-bootstrap)

```bash
ENV=staging
ACCT=<TBD-staging-account-id>

cat > /tmp/trust-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCT}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:hlebtkachenko/monorepo:environment:${ENV}"
        }
      }
    }
  ]
}
JSON

aws iam create-role \
  --role-name "GitHubActionsDeploy-${ENV}" \
  --assume-role-policy-document file:///tmp/trust-policy.json \
  --profile "${ENV}"

aws iam attach-role-policy \
  --role-name "GitHubActionsDeploy-${ENV}" \
  --policy-arn "<TBD-deploy-policy-arn>" \
  --profile "${ENV}"
```

## Read-only CI roles (e.g. `secrets-drift`)

The deploy roles above are write-capable and per-environment. Some CI jobs only
need to **read** a few resources and run on a schedule, not a deploy — e.g.
`secrets-drift.yml`, which reads SSM SecureStrings to compare them against Vault.
These get their own least-privilege role, never the deploy role.

Same environment-scoped principle: the job declares a dedicated GitHub
environment (here `secrets-drift`) that carries **no protection rules** (no
required reviewers, no wait timer — otherwise scheduled runs hang awaiting
approval), and the role trusts that environment's subject.

Trust policy (account where the SSM parameters live):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<TBD-account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:hlebtkachenko/monorepo:environment:secrets-drift"
        }
      }
    }
  ]
}
```

Permissions policy — read only, scoped to the six tracked parameters. SSM
SecureStrings use the AWS-managed `alias/aws/ssm` key, so `kms:Decrypt` is on
`*` and gated by that key's own policy (same shape as the `vault-ssm-sync`
writer in `infra/cdk/lib/secrets-stack.ts`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadTrackedSsmParams",
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": [
        "arn:aws:ssm:eu-central-1:<TBD-account-id>:parameter/monorepo/staging/better-auth-secret",
        "arn:aws:ssm:eu-central-1:<TBD-account-id>:parameter/monorepo/staging/resend-api-key",
        "arn:aws:ssm:eu-central-1:<TBD-account-id>:parameter/monorepo/staging/sync-heartbeat",
        "arn:aws:ssm:eu-central-1:<TBD-account-id>:parameter/monorepo/production/better-auth-secret",
        "arn:aws:ssm:eu-central-1:<TBD-account-id>:parameter/monorepo/production/resend-api-key",
        "arn:aws:ssm:eu-central-1:<TBD-account-id>:parameter/monorepo/production/sync-heartbeat"
      ]
    },
    {
      "Sid": "DecryptSsmDefaultKey",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "kms:ViaService": "ssm.eu-central-1.amazonaws.com" }
      }
    }
  ]
}
```

Provisioning checklist (manual — held for operator approval, tracked in DEV-46):

1. Create the GitHub environment `secrets-drift` with **no** protection rules.
2. `aws iam create-role --role-name GitHubActionsSecretsDrift --assume-role-policy-document file://trust.json`, then attach the permissions policy.
3. Set repo secret `AWS_SECRETS_DRIFT_ROLE_ARN` to the new role ARN.
4. Vault side: create the `gha-drift` JWT role (`bound_audiences` =
   `https://secrets-admin.afframe.com`, `bound_subject`/`bound_claims` scoped to
   this repo) + a read-only policy on `platform/data/{staging,production}/{better-auth-secret,resend-api-key}`. See `docs/runbooks/VAULT-OPS.md` § JWT auth.
5. `workflow_dispatch` the workflow; once green, uncomment the `schedule` in
   `.github/workflows/secrets-drift.yml`.

## What this trust policy does NOT permit

- Push from a fork PR (`pull_request` event in fork): GitHub does not issue `environment:` subs for fork PRs; assume-role fails.
- Push from `pull_request_target` on a fork: same — environment claim only issues when the deployment is gated through a GitHub environment, which forks cannot trigger.
- Push from a branch: `ref:` claims are not in this trust; assume-role fails.

## Failure modes and what to check

| Symptom                                                                 | Likely cause                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `AccessDenied: not authorized to perform sts:AssumeRoleWithWebIdentity` | Sub claim mismatch. Verify `repo:hlebtkachenko/monorepo:environment:<env>` exactly. |
| `InvalidIdentityToken`                                                  | OIDC provider not registered, or thumbprint stale.                                  |
| Workflow runs but role session has wrong env                            | Role-name mismatch in `_deploy-aws.yml`'s role resolver.                            |
| Works on `main` push, fails from PR                                     | Expected: PRs do not have environment claims.                                       |

## Cross-references

- `docs/runbooks/AWS-DEPLOY.md` step 2 (OIDC trust + deploy role).
- `docs/specs/SUPPLY-CHAIN.md` (cosign keyless uses the same OIDC token, different audience).
- `.github/workflows/_deploy-aws.yml`.
