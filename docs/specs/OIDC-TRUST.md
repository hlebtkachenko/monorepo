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

## What this trust policy does NOT permit

- Push from a fork PR (`pull_request` event in fork): GitHub does not issue `environment:` subs for fork PRs; assume-role fails.
- Push from `pull_request_target` on a fork: same — environment claim only issues when the deployment is gated through a GitHub environment, which forks cannot trigger.
- Push from a branch: `ref:` claims are not in this trust; assume-role fails.

## Failure modes and what to check

| Symptom | Likely cause |
|---------|--------------|
| `AccessDenied: not authorized to perform sts:AssumeRoleWithWebIdentity` | Sub claim mismatch. Verify `repo:hlebtkachenko/monorepo:environment:<env>` exactly. |
| `InvalidIdentityToken` | OIDC provider not registered, or thumbprint stale. |
| Workflow runs but role session has wrong env | Role-name mismatch in `_deploy-aws.yml`'s role resolver. |
| Works on `main` push, fails from PR | Expected: PRs do not have environment claims. |

## Cross-references

- `docs/runbooks/AWS-BOOTSTRAP.md` step 8.
- `docs/specs/SUPPLY-CHAIN.md` (cosign keyless uses the same OIDC token, different audience).
- `.github/workflows/_deploy-aws.yml`.
