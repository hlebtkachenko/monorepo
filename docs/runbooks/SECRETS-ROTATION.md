# BETTER_AUTH_SECRET / RESEND_API_KEY Rotation Runbook

Rotation cycle for the Vault-backed app secrets.

> **WARNING — rotating `BETTER_AUTH_SECRET` permanently bricks all
> enrolled 2FA.** The Better Auth twoFactor plugin encrypts TOTP secrets
> AND backup codes symmetrically with `BETTER_AUTH_SECRET`. A new secret
> cannot decrypt the existing `two_factor` rows, so every enrolled user
> fails verification forever ("Invalid code") — this is NOT a forced
> re-login, it is a mass MFA lockout. Do not rotate in production with
> 2FA users unless you have either (a) a decrypt-with-old /
> re-encrypt-with-new migration script over the `two_factor` rows, or
> (b) a forced 2FA re-enrollment plan with user comms. Known incident:
> 2FA "Invalid code" for all users after a secret change; the only
> recovery was reset + re-enroll.

For users without 2FA, the impact of a `BETTER_AUTH_SECRET` rotation is
one forced re-login. `RESEND_API_KEY` rotation is zero-impact.

The same procedure applies to any secret under `platform/{env}/*` in
Vault (`better-auth-secret`, `resend-api-key`). Substitute the key name.

---

## Why rotate

`BETTER_AUTH_SECRET` signs all Better Auth session + verification tokens.
A leaked secret lets an attacker forge sessions for any user. `RESEND_API_KEY`
sends mail on the brand's behalf. Rotating on suspected leak (and on a
loose annual cadence) bounds the blast radius.

**Source of truth is Vault** (`platform/{env}/<name>`, KV-v2). A systemd
timer on the VPS (`vault-to-ssm-sync`) mirrors each value to AWS SSM
SecureString (`/monorepo/{env}/<name>`) every 5 minutes; ECS reads SSM at
task start. So rotation = one `vault kv put`, then let the sync + an ECS
rolling restart pick it up. KV-v2 retains prior versions, so rollback is
a `vault kv rollback`, not a re-paste.

---

## Current API limitation (BETTER_AUTH_SECRET only)

Better Auth 1.6.x does not natively accept an array of secrets (primary +
fallback). Sessions signed with the previous secret become invalid on
cutover. Rotate at a low-traffic window (e.g. Sunday 02:00 UTC) so forced
re-logins hit the fewest active sessions. Staging sessions are ephemeral
(CI teardown), so staging rotations are always zero-impact — unless a
staging account has 2FA enrolled (see the warning at the top: TOTP +
backup codes are encrypted with the secret and do not survive rotation
in ANY environment).

`RESEND_API_KEY` has no such constraint — old + new keys both work until
the old one is revoked in the Resend dashboard, so its rotation is
zero-impact in every env.

---

## Prerequisites

- Vault `operator-admin` token in macOS Keychain
  (`afframe-vault-operator-admin-token`), minted at M3.5.
- SSH access to `afframe-vps` (Vault listens on `127.0.0.1:8200`; tunnel
  via `ssh -fN -L 8200:127.0.0.1:8200 afframe-vps`).
- For an end-to-end drill, the helper
  `~/.context/scripts/m10-rotate-resend.sh <env>` automates steps 1–5
  for `RESEND_API_KEY`.

---

## Procedure — step by step

### Step 1 — generate the new value

For `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 48
```

For `RESEND_API_KEY`: create a new key in the
[Resend dashboard](https://resend.com/api-keys). Do NOT revoke the old
one yet.

### Step 2 — snapshot the current value (for rollback)

Open a tunnel + export the operator-admin token, then read the current
value. KV-v2 keeps prior versions, but capture it locally as a belt:

```bash
ssh -fN -L 8200:127.0.0.1:8200 afframe-vps
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=$(security find-generic-password \
  -s afframe-vault-operator-admin-token -a "$USER" -w)

vault kv get -field=value platform/production/better-auth-secret
```

### Step 3 — write the new value to Vault

> **STOP — `BETTER_AUTH_SECRET` only:** this write is the point of no
> return for 2FA. Every enrolled TOTP secret + backup code is encrypted
> with the OLD secret and becomes permanently undecryptable once the new
> value reaches the running tasks. Before proceeding, confirm the 2FA
> migration script has run (or the forced re-enrollment comms are out).
> Rollback via `vault kv rollback` restores 2FA only if no user
> re-enrolled in between.

```bash
printf '%s' "<new-value>" | \
  vault kv put platform/production/better-auth-secret value=-
```

`vault kv put` creates a new KV-v2 version; the prior version is retained
for rollback.

### Step 4 — wait for the sync, then roll the service

The `vault-to-ssm-sync` timer fires every 5 minutes. Confirm SSM picked up
the new value:

```bash
aws ssm get-parameter \
  --name /monorepo/production/better-auth-secret \
  --with-decryption --region eu-central-1 \
  --query 'Parameter.Value' --output text
```

ECS only reads SSM at task start, so force a rolling restart to pick up
the new value (no image rebuild, no full deploy needed):

```bash
aws ecs update-service \
  --cluster monorepo-production \
  --service <App-production service name> \
  --force-new-deployment --region eu-central-1
aws ecs wait services-stable \
  --cluster monorepo-production --services <service> --region eu-central-1
```

### Step 5 — verify at runtime

```bash
aws ecs execute-command --cluster monorepo-production --task <task> \
  --container web --interactive \
  --command "sh -c 'printenv BETTER_AUTH_SECRET | head -c 8'" \
  --region eu-central-1
```

The first 8 chars should match the new value.

### Step 6 — grace window + cleanup

`BETTER_AUTH_SECRET`: monitor `auth.login.failed_password` audit events
(`audit_event` table) + session-not-found errors in the CloudWatch log
groups for 24h. A spike = users on the old secret; advise re-login.

`RESEND_API_KEY`: once Step 5 confirms the new key live, **revoke the old
key in the Resend dashboard** and send a test email to confirm delivery.

No manual discard needed in Vault — the new version is already primary;
prior versions stay in KV-v2 history for rollback only.

### Rotation in staging

Identical, against `platform/staging/<name>` + `monorepo-staging` cluster.
No grace window for `BETTER_AUTH_SECRET` (staging sessions are ephemeral).

---

## Rollback — if a deploy fails mid-cycle

KV-v2 retains prior versions. Roll back to the previous version:

```bash
# inspect versions
vault kv metadata get platform/production/better-auth-secret

# roll back to the version before the bad write
vault kv rollback -version=<N-1> platform/production/better-auth-secret
```

Wait ≤5 min for the sync, then force a rolling restart (Step 4) to
restore the prior value in the running containers. If you captured the
value locally in Step 2, you can instead `vault kv put` it back directly.

---

## Long-term path

Once Better Auth ships native versioned-secret support
(`secrets: [primary, secondary]`), update `packages/auth/src/server.ts`:

```ts
const auth = betterAuth({
  secrets: [readPrimarySecret(), readSecondarySecret()],
  // ...
})
```

At that point the `BETTER_AUTH_SECRET` cutover window drops to zero: old
sessions validate against the secondary for 24h while new sessions use
the primary. Both secrets would be separate Vault keys synced to SSM.

---

## Checklist

- [ ] (BETTER_AUTH) 2FA plan in place: re-encrypt migration ran, or
      re-enrollment comms sent (see warning at top)
- [ ] New value generated (`openssl rand -base64 48` / Resend dashboard)
- [ ] Current value snapshotted locally (Step 2) — discarded after Step 6
- [ ] `vault kv put platform/{env}/<name>` written
- [ ] SSM parameter shows the new value (≤5 min after the write)
- [ ] ECS service force-new-deployment + stable
- [ ] Runtime `printenv` confirms new value in container
- [ ] (BETTER_AUTH) error rate monitored 24h / (RESEND) old key revoked + test mail sent
- [ ] Local snapshot variable unset / clipboard cleared
