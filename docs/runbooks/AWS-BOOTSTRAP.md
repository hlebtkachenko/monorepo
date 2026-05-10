# AWS Bootstrap

One-time manual setup before any IaC apply. After step 10, set repo var `AWS_BOOTSTRAPPED=true` and the deploy workflows activate.

> Recovery contact, billing email, break-glass MFA codes live in 1Password vault `aws-bootstrap`, **not here**.
>
> Every `<TBD>` is a placeholder you will replace in-place during execution. Do not commit the replacements without removing this note.

---

## 0. Preconditions

- [ ] Google Workspace user `hleb@<TBD-domain>`
- [ ] 1Password vault `aws-bootstrap` shared with break-glass contact
- [ ] YubiKey on hand
- [ ] `gh`, `aws`, `granted`, `tofu`, `cdk` installed locally (see `mise.toml`)

---

## 1. Create the management account and verify billing

> Approval gate: confirm billing email and corporate / personal account distinction before clicking Create.

1. Create root account at https://aws.amazon.com.
2. Root email: `aws-root+management@<TBD-domain>`.
3. Set strong password, enable MFA on root (YubiKey + backup TOTP), then **never use root again**.
4. Verify billing address, add tax ID if applicable.
5. Record account ID: `<TBD-management-account-id>` (also store in 1Password).

```bash
# After creating, confirm from a Granted profile (set up later):
aws sts get-caller-identity --profile management
```

---

## 2. Enable AWS Organizations

```bash
aws organizations create-organization --feature-set ALL --profile management
```

Confirm:

```bash
aws organizations describe-organization --profile management
```

---

## 3. Run AWS Control Tower setup (2026 default landing zone)

> Approval gate: governed regions list is locked at this step. Adding regions later requires landing-zone update.

1. Console -> AWS Control Tower -> Setup landing zone.
2. Home region: `eu-central-1`.
3. Governed regions: add `eu-west-1`, `us-east-1` (us-east-1 is mandatory for some global services).
4. Log Archive account email: `aws-root+log-archive@<TBD-domain>`.
5. Audit account email: `aws-root+audit@<TBD-domain>`.
6. Wait for landing-zone deploy (~60 min).

Record account IDs:
- Log Archive: `<TBD-log-archive-account-id>`
- Audit: `<TBD-audit-account-id>`

---

## 4. Create OUs

```bash
ROOT_ID=$(aws organizations list-roots --profile management --query 'Roots[0].Id' --output text)

for OU in Security Infrastructure Workloads Sandbox Suspended; do
  aws organizations create-organizational-unit \
    --parent-id "$ROOT_ID" \
    --name "$OU" \
    --profile management
done

# Sub-OUs under Workloads
WORKLOADS_OU=$(aws organizations list-organizational-units-for-parent \
  --parent-id "$ROOT_ID" \
  --profile management \
  --query "OrganizationalUnits[?Name=='Workloads'].Id" \
  --output text)

for SUB in Prod Non-Prod; do
  aws organizations create-organizational-unit \
    --parent-id "$WORKLOADS_OU" \
    --name "$SUB" \
    --profile management
done
```

---

## 5. Apply SCPs

> Approval gate: `DenyNonEURegions` is irreversible without a maintenance window. Confirm region list.

Create and attach:
- `DenyNonEURegions` (allow `eu-central-1`, `eu-west-1`, `us-east-1` only).
- `DenyIAMUserCreate` (deny `iam:CreateUser`, `iam:CreateAccessKey`).
- `DenyDisableCloudTrail`.
- `DenyDisableConfig`.
- `DenyDisableGuardDuty`.
- `DenyS3PublicAccess`.
- `DenyKMSImmediateDelete` (deny `kms:ScheduleKeyDeletion` with `PendingWindowInDays` < 30).

(SCP JSON definitions live in `infra/tofu/modules/scp/` — populate at this step.)

---

## 6. Identity Center + Google Workspace SAML

> Approval gate: SAML setup is per-tenant. Hleb's email becomes the only break-glass admin until further notice.

1. Console -> IAM Identity Center -> Settings -> Identity source -> External identity provider.
2. Upload Google Workspace SAML metadata XML.
3. Map attribute `email` to AWS `subject`.
4. Create permission sets:
   - `AdministratorAccess` (break-glass, MFA + 1h session).
   - `PowerUserAccess` (PT4H session).
   - `ReadOnlyAccess`.
   - `BillingViewer`.
5. Assign `hleb@<TBD-domain>` to all four sets, all accounts.
6. Test login flow.

Granted profile bootstrap:

```bash
granted sso populate --start-url https://<TBD>.awsapps.com/start --region eu-central-1
assume # picks an account interactively
```

---

## 7. Log Archive bucket + Object Lock + Org CloudTrail

> Approval gate: Object Lock COMPLIANCE mode is irreversible. Confirm 7-year retention before applying.

In the Log Archive account:

```bash
BUCKET=<TBD-audit-bucket-name>
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1 \
  --object-lock-enabled-for-bucket \
  --profile log-archive

aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled --profile log-archive

aws s3api put-object-lock-configuration --bucket "$BUCKET" \
  --object-lock-configuration '{
    "ObjectLockEnabled":"Enabled",
    "Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":2555}}
  }' --profile log-archive
```

Enable MFA Delete (root principal action; document procedure in 1Password).

Then enable org-wide CloudTrail in the management account and target this bucket.

---

## 8. GitHub OIDC provider per workload account

For each workload account (staging, production):

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list <TBD-thumbprint> \
  --profile <account-profile>
```

Then create the deploy role with this trust policy (see `docs/specs/OIDC-TRUST.md` for the exact JSON):

- Sub claim: `repo:hlebtkachenko/monorepo:environment:<env>` — environment-scoped, NOT branch-scoped (branch claims spoofable from PR forks).
- Audience: `sts.amazonaws.com`.

Record:
- Staging deploy role ARN: `<TBD-staging-deploy-role-arn>`
- Production deploy role ARN: `<TBD-production-deploy-role-arn>`

---

## 9. `tofu init` + `cdk bootstrap` per account

Tofu state backend (in management account):

```bash
aws s3api create-bucket --bucket <TBD-tofu-state-bucket> --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1 --profile management
aws s3api put-bucket-versioning --bucket <TBD-tofu-state-bucket> \
  --versioning-configuration Status=Enabled --profile management
aws dynamodb create-table --table-name <TBD-tofu-lock-table> \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --profile management
```

Replace the `<TBD>` markers in `infra/tofu/main.tf`, then:

```bash
cd infra
make plan-tofu
make apply-tofu
```

CDK bootstrap per workload account:

```bash
make bootstrap-cdk ACCOUNT=<TBD-staging-account-id> REGION=eu-central-1
make bootstrap-cdk ACCOUNT=<TBD-production-account-id> REGION=eu-central-1
```

---

## 10. Set `AWS_BOOTSTRAPPED=true` repo var

```bash
gh variable set AWS_REGION --body eu-central-1
gh variable set AWS_ACCOUNT_ID_STAGING --body <TBD-staging-account-id>
gh variable set AWS_ACCOUNT_ID_PRODUCTION --body <TBD-production-account-id>
gh variable set AWS_DEPLOY_ROLE_ARN_STAGING --body <TBD-staging-deploy-role-arn>
gh variable set AWS_DEPLOY_ROLE_ARN_PRODUCTION --body <TBD-production-deploy-role-arn>
gh variable set AWS_BOOTSTRAPPED --body true
```

Smoke:

```bash
gh workflow run _deploy-aws.yml -f environment=staging -f stack=tofu
```

Pass = bootstrap complete. Move to `docs/runbooks/DEPLOY.md`.
