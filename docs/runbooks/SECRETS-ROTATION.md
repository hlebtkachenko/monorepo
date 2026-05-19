# BETTER_AUTH_SECRET Rotation Runbook

90-day rotation cycle for `BETTER_AUTH_SECRET`. No data is lost during rotation;
users experience at most one forced re-login.

---

## Why rotate

`BETTER_AUTH_SECRET` signs all Better Auth session tokens and verification tokens.
A leaked secret allows an attacker to forge sessions for any user. Rotating every
90 days limits the blast radius of an undetected leak to a bounded window.

AWS Secrets Manager stores the runtime value. Rotation is a manual operator action
until a Lambda rotation function is wired in. See the cadence table in
`docs/runbooks/SECRETS.md` for where this sits next to other secret classes.

---

## Current API limitation

Better Auth 1.6.x does not natively accept an array of secrets (primary + fallback).
Sessions signed with the previous secret become invalid immediately on cutover unless
a workaround is in place.

Two options:

**Option A (recommended today) — `secondaryStorage` re-sign trick**

Wrap the BA `database` adapter with a thin storage shim that, on every `getSession`
call, re-signs the session row with the new primary secret if it was signed with the
secondary. This keeps existing sessions alive through the 24-hour grace window.
Implementation is non-trivial; defer to a follow-up hardening ticket.

**Option B (wait for BA versioned-secret API)**

Better Auth's roadmap includes a first-class `secrets: [primary, secondary]`
configuration. Once released, the procedure below becomes a single config change
with no custom shim needed. Track the BA release notes for this feature.

**Current procedure uses Option B's wait posture**: rotate at a low-traffic window
(e.g. Sunday 02:00 UTC) so forced re-logins affect the fewest active sessions.
All staging sessions are ephemeral (CI teardown); staging rotations are always
zero-impact.

---

## Procedure — step by step

### Step 1 — generate a new secret

```bash
openssl rand -base64 48
```

Copy the output. It must be at least 32 bytes after UTF-8 encoding (a 48-byte
base64 output is 64 characters, well above the threshold).

### Step 2 — record the current secret as the secondary

Retrieve the current value from Secrets Manager:

```bash
aws secretsmanager get-secret-value \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET" \
  --query SecretString \
  --output text
```

Store it in a local variable for the update call:

```bash
OLD_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET" \
  --query SecretString \
  --output text)
```

### Step 3 — set the new secret as the primary value

```bash
NEW_SECRET="<paste the openssl output from Step 1>"

aws secretsmanager update-secret \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET" \
  --secret-string "${NEW_SECRET}"
```

Confirm the update was accepted:

```bash
aws secretsmanager describe-secret \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET" \
  --query 'LastChangedDate'
```

### Step 4 — deploy to production

Trigger a production deploy so the running containers pick up the new secret:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f image_tag=latest
```

Wait for the deploy workflow to complete and confirm the health check is green.

### Step 5 — 24-hour grace window

Monitor the error rate in Honeycomb/Sentry for the next 24 hours. A spike in
`auth.login.failed_password` or session-not-found errors indicates users whose
sessions were signed with the old secret. Advise affected users to log in again.

If the error rate is acceptable (below your defined SLO), continue to Step 6.

### Step 6 — discard the secondary (old secret)

The old secret is no longer referenced in any active configuration. No further
action is required in Secrets Manager — the current value is already the new
primary. The `OLD_SECRET` local variable from Step 2 should be discarded (close
the terminal session or unset the variable).

```bash
unset OLD_SECRET
```

If you stored the old value anywhere temporarily (a notes app, clipboard), clear it.

### Rotation in staging

The staging secret is stored separately:

```bash
aws secretsmanager update-secret \
  --secret-id "/afframe/staging/BETTER_AUTH_SECRET" \
  --secret-string "$(openssl rand -base64 48)"
```

Staging has no persistent user sessions (CI teardown clears state), so no grace
window is needed.

---

## Rollback — if a deploy fails mid-cycle

If the deploy in Step 4 fails and you need to restore the previous secret:

```bash
aws secretsmanager update-secret \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET" \
  --secret-string "${OLD_SECRET}"
```

Then re-deploy with the reverted value:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f image_tag=latest
```

If `OLD_SECRET` was already unset, retrieve the previous version from Secrets
Manager version history:

```bash
aws secretsmanager list-secret-version-ids \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET"

aws secretsmanager get-secret-value \
  --secret-id "/afframe/production/BETTER_AUTH_SECRET" \
  --version-id "<previous-version-id>" \
  --query SecretString \
  --output text
```

AWS Secrets Manager retains the three most recent versions by default.

---

## Long-term path

Once Better Auth ships native versioned-secret support (`secrets: [primary, secondary]`),
update `packages/auth/src/server.ts` to:

```ts
const auth = betterAuth({
  secrets: [readPrimarySecret(), readSecondarySecret()],
  // ...
})
```

At that point, the cutover window drops to zero: old sessions keep validating
against the secondary for 24 hours while new sessions use the primary.

---

## Checklist

- [ ] New secret generated with `openssl rand -base64 48`
- [ ] Old secret recorded locally (temporary, discarded after Step 6)
- [ ] Secrets Manager updated with new value
- [ ] Production deploy completed and health check green
- [ ] Error rate monitored for 24 hours
- [ ] Old secret variable unset / clipboard cleared
- [ ] Next rotation date calendared (+90 days)
