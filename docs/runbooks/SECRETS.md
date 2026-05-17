# Secrets and Variables Convention

## Decision matrix

| Value                                                           | Type                  | Where                   | Why                                                                            |
| --------------------------------------------------------------- | --------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `AWS_REGION`                                                    | repo `vars`           | repository              | static, non-sensitive                                                          |
| `AWS_ACCOUNT_ID`                                                | repo `secrets`        | repository              | single-account MVP (ADR-0007); stored as secret to keep account ID out of logs |
| `AWS_DEPLOY_ROLE_ARN_STAGING`, `AWS_DEPLOY_ROLE_ARN_PRODUCTION` | repo `secrets`        | repository              | contain account ID; trust policy gates the actual access                       |
| `AWS_BOOTSTRAPPED`                                              | repo `vars`           | repository              | boolean flag, gates AWS-touching workflows                                     |
| Cosign signing                                                  | none                  | n/a                     | keyless OIDC via Sigstore; no secret stored                                    |
| Sentry DSN                                                      | environment `secrets` | `staging`, `production` | per-env DSN; isolation                                                         |
| Honeycomb API key                                               | environment `secrets` | `staging`, `production` | per-env writer key                                                             |
| Payment processor secret keys (deferred — no payments yet)      | AWS Secrets Manager   | runtime, not GitHub     | rotate quarterly when introduced                                               |
| GitHub App private key (future cross-repo automation)           | org `secrets`         | org-level               | one source for many repos                                                      |

## Forbidden

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — never. OIDC only.
- Classic personal access tokens (PATs) — use a GitHub App with installation-scoped tokens.
- Any `.env` file checked into the repo. `.gitignore` forbids; gitleaks job catches it.
- Secrets baked into Docker images. Never. Build args are visible in the image manifest.

## GitHub environments

Two environments must exist on the repo. Create at start of bootstrap (does not need AWS).

| Environment  | Required reviewers | Wait timer | Branch policy |
| ------------ | ------------------ | ---------- | ------------- |
| `staging`    | 0 (auto-deploy)    | 0          | `main` only   |
| `production` | 1 (Hleb for now)   | 5 minutes  | `main` only   |

```bash
gh api -X PUT repos/hlebtkachenko/monorepo/environments/staging
gh api -X PUT repos/hlebtkachenko/monorepo/environments/production \
  -f wait_timer=300 \
  -F reviewers='[{"type":"User","id":<TBD-numeric-user-id>}]' \
  -F deployment_branch_policy='{"protected_branches":true,"custom_branch_policies":false}'
```

Get your numeric user id with `gh api user --jq .id`.

## Setting repo vars (post-bootstrap)

```bash
gh variable set AWS_REGION                       --body eu-central-1
gh variable set AWS_BOOTSTRAPPED                 --body true
gh secret set AWS_ACCOUNT_ID                     --body <TBD-account-id>
gh secret set AWS_DEPLOY_ROLE_ARN_STAGING        --body <TBD-staging-deploy-role-arn>
gh secret set AWS_DEPLOY_ROLE_ARN_PRODUCTION     --body <TBD-production-deploy-role-arn>
```

## Setting environment secrets

```bash
gh secret set SENTRY_DSN     --env staging --body <TBD-staging-sentry-dsn>
gh secret set SENTRY_DSN     --env production --body <TBD-production-sentry-dsn>
gh secret set HONEYCOMB_KEY  --env staging --body <TBD-staging-honeycomb-key>
gh secret set HONEYCOMB_KEY  --env production --body <TBD-production-honeycomb-key>
```

## Reading vars and secrets in workflows

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN_STAGING }}
    aws-region: ${{ vars.AWS_REGION }}
```

Role ARNs contain the account ID, so they are stored as secrets (single-account MVP; see `docs/runbooks/AWS-DEPLOY.md`).

## Rotation cadence

| Secret class                      | Cadence                                 |
| --------------------------------- | --------------------------------------- |
| Sentry DSN, Honeycomb keys        | annual, or on suspected leak            |
| AWS Secrets Manager runtime creds | 90 days, automated via Lambda           |
| KMS CMKs                          | annual rotation enabled at key creation |
| GitHub App private keys           | 12 months                               |
| Cosign                            | n/a (keyless)                           |

## Break-glass procedure

For emergency access when normal Identity Center login is unavailable (e.g. SAML provider outage, locked-out admin):

1. Sealed envelope in the office safe contains:
   - Root account credentials.
   - Backup MFA codes.
2. Two-person rule when a second human is available.
3. Document use immediately in incident channel `#inc-YYYYMMDD-<slug>`.
4. Replace credentials and rotate MFA within 24 hours of use.

**Solo dev caveat**: Hleb is the sole approver right now. Two-person rule is aspirational until a second admin exists. The risk is documented; mitigation is to keep the envelope physically in a separate location from primary devices.

## SOPS+age for dev / staging shared secrets (decision E.4)

Two tiers in this repo:

| Tier                         | Cadence                | Where                                                                                       |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| Dev + staging shared secrets | edits-as-needed        | SOPS-encrypted YAML in `infra/secrets/` (gitignored plaintext copy; encrypted blob commits) |
| Production runtime secrets   | 90-day rotation lambda | AWS Secrets Manager + SSM Parameter Store                                                   |

SOPS+age fits the dev/staging tier because:

- Free, fits in git, decryptable by any team member holding an authorised age key.
- Per-file rewrap when a new developer joins (`sops updatekeys`).
- The `encrypted_regex` covers only secret-shaped keys; everything else stays plaintext for diff-ability.

Secrets Manager keeps the prod tier because:

- Rotation lambda + KMS at $0.40/secret/mo for prod-grade rotation.
- OIDC-scoped IAM read at runtime; no developer ever sees the plaintext.
- Mixing tiers is INTENTIONAL: do not migrate prod into SOPS — the rotation story is worse and CI deploy through Secrets Manager is the clean path.

### One-time onboarding

```bash
# macOS:
brew install sops age

# Generate your age keypair (stored at ~/.config/sops/age/keys.txt by default).
age-keygen | tee -a ~/.config/sops/age/keys.txt

# Read your PUBLIC key (the line starting with age1).
grep '^# public key' ~/.config/sops/age/keys.txt | cut -d: -f2 | tr -d ' '
```

Send the public key to the admin (Hleb). They append it to
`infra/secrets/.sops.yaml` creation rules and run
`sops updatekeys infra/secrets/secrets.<env>.sops.yaml` so the encrypted
blobs are re-wrapped with your key.

### Daily use

```bash
# Edit + encrypt in place (SOPS never writes plaintext to disk).
sops infra/secrets/secrets.dev.sops.yaml

# Load into the current shell session as env vars.
eval "$(sops -d infra/secrets/secrets.dev.sops.yaml \
  | sed -E 's/^([A-Z_]+): (.*)$/export \1=\2/')"
```

The `infra/secrets/` directory and concrete `.sops.yaml` + template files
are NOT in this branch. The worktree's sensitive-path hook blocks any
write to `secrets/`. Materialise the scaffold (see below) in a follow-up
commit where the hook is intentionally suspended OR by hand outside the
agent loop.

### Materialising the scaffold (follow-up)

Files to create:

- `infra/secrets/.sops.yaml` with `creation_rules` and `encrypted_regex`
  matching: `BETTER_AUTH_SECRET`, `APP_TOKEN_SECRET`, `RESEND_API_KEY`,
  `DATABASE_URL`, `DATABASE_DIRECT_URL`, `OPENFGA_STORE_ID`,
  `OPENFGA_MODEL_ID`, `SENTRY_DSN`, `HONEYCOMB_API_KEY`,
  `CLOUDFLARE_TUNNEL_TOKEN`, `PGBOUNCER_AUTH_PASSWORD`,
  `RDS_MASTER_PASSWORD`. `key_groups[0].age` lists each contributor's age pubkey.
- `infra/secrets/secrets.dev.sops.yaml.example` with placeholder values
  matching `docs/env-vars.md` (REPLACE*WITH*... strings — no gitleaks-triggering shapes).
- `infra/secrets/secrets.staging.sops.yaml.example` with same shape, staging URLs.
- `infra/secrets/README.md` with onboarding + daily-use copy.

Add to `.gitignore`:

```
infra/secrets/secrets.*.sops.yaml
!infra/secrets/secrets.*.sops.yaml.example
```

Then verify the loop end-to-end:

```bash
sops -e -i infra/secrets/secrets.dev.sops.yaml      # encrypts
sops -d infra/secrets/secrets.dev.sops.yaml         # decrypts to stdout
gitleaks detect --source . --no-git                 # no findings
```
