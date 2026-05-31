# Secrets: add / change / delete / scope — fresh-start entrypoint

One page so a new contributor (or a fresh AI agent) does not have to
reverse-engineer the secrets stack. Start here, then jump to the deep doc
for the exact commands.

## 30-second mental model

- **Vault** (Hostinger KVM 2 VPS, `secrets-admin.afframe.com`) is the
  **source of truth** for app-runtime secrets, stored at
  `platform/{staging,production}/<name>` (KV-v2).
- A systemd timer (`vault-to-ssm-sync`, every 5 min) mirrors each value to
  **AWS SSM SecureString** `/monorepo/{env}/<name>` — the runtime cache.
- **ECS** reads SSM at task start via `EcsSecret.fromSsmParameter`.
- You almost never touch SSM by hand. You write Vault; the sync + a
  deploy/restart carry it to the app.

Full picture + tiers: [`SECRETS.md`](SECRETS.md). Vault ops + exact
commands: [`VAULT-OPS.md`](VAULT-OPS.md).

## "Where does my new value go?" — decision tree

```
Is it an app-runtime secret the web/api/admin containers read?
│
├─ YES → Vault platform/{env}/<name> → SSM → ECS.
│        Follow "Add an app secret" below.
│
├─ Is it an RDS / database credential?
│   └─ It already lives in AWS Secrets Manager (DbSecret / AppUserSecret),
│      RDS-managed. Do NOT move it to Vault. (Dynamic DB secrets: AFF-243.)
│
├─ Is it a CI/CD value a GitHub workflow needs at build/deploy time?
│   ├─ Identity/bootstrap (AWS role ARN, CF tunnel token, account id):
│   │   → GitHub repo secret (`gh secret set …`). Stays in GitHub.
│   └─ A shared app credential a workflow reads (like LINEAR_API_KEY):
│       → Vault platform/shared/<name>, fetched via GitHub OIDC → Vault JWT.
│          See VAULT-OPS.md § "GitHub Actions JWT auth".
│
└─ Is it an email address / non-secret config?
    └─ GitHub repo variable (`gh variable set …`) — not a secret.
```

## Add an app secret

(Full steps + `pnpm verify` gate: [`VAULT-OPS.md`](VAULT-OPS.md) §
"Adding a new secret".)

1. `vault kv put platform/{env}/<name> value=<v>` (both envs).
2. Add the `(env, name)` tuple to
   `infra/vault/vps-overlay/usr/local/sbin/vault-to-ssm-sync`.
3. Wire `EcsSecret.fromSsmParameter` for the new SSM path in
   `infra/cdk/lib/app-stack.ts`.
4. Document the var in [`../env-vars.md`](../env-vars.md).
5. `pnpm verify` → PR → deploy.

## Change / rotate a secret

`vault kv put platform/{env}/<name> value=<new>` → wait ≤5 min for the
sync → `aws ecs update-service --force-new-deployment` to pick it up.
Full recipe (incl. BETTER_AUTH_SECRET re-login caveat + `vault kv
rollback`): [`SECRETS-ROTATION.md`](SECRETS-ROTATION.md).

## Delete a secret

Order matters (consumer first, value last). Steps:
[`VAULT-OPS.md`](VAULT-OPS.md) § "Deleting a secret".

## Give a teammate scoped access

You do NOT hand out the admin token. Enable `userpass` (or OIDC) and bind
the person to `read-staging-secrets` / `read-production-secrets`. Recipe +
scope cheat-sheet: [`VAULT-OPS.md`](VAULT-OPS.md) § "Human operator
access". Revoke: `vault delete auth/userpass/users/<name>`.

## Before you commit anything

- Never paste a real secret value into a tracked file. gitleaks +
  infisical run pre-commit + in CI; a `hvs.`/`afkey-`/`affk_` token in a
  diff is blocked.
- Real `.env` files are gitignored. Templates end in `.template` /
  `.example` with placeholders only.
- If you must reference a secret in a doc, use an obvious placeholder
  (`<your-value>`, `hvs.XXXX`) — never a real one.

## If something breaks

- Secret stale in the app / SSM not updating → check the sync timer:
  `ssh afframe-vps "sudo systemctl status vault-to-ssm-sync.timer"` +
  `journalctl -u vault-to-ssm-sync`. Alarm table: [`VAULT-OPS.md`](VAULT-OPS.md)
  § "Common alarms + responses".
- Deploy fails on a missing secret → the deploy workflow's "Verify
  Vault-backed secrets resolve in SSM" step prints which param is
  missing/empty.
- Daily Vault↔SSM divergence is caught by `.github/workflows/secrets-drift.yml`.
- Vault sealed / root lost / restore → [`VAULT-OPS.md`](VAULT-OPS.md) §
  "Recovery key procedures".
