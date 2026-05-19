# infra/openstatus/deploy

Operational artifacts for redeploying the OpenStatus stack on the OVH VPS from
a clean state. Companion to [`docs/runbooks/STATUS-PAGE.md`](../../../docs/runbooks/STATUS-PAGE.md)
and [ADR-0019](../../../docs/adr/0019-status-page-and-uptime-monitoring.md).

Before this directory existed, the patched compose file, the email-rewrite
script, the Caddyfile, and `.env.docker` lived only on the VPS. A VPS loss
meant rebuilding all of it by hand from the runbook in a few hours. With these
artifacts plus the GitHub Actions secrets listed below, a fresh VPS can be
brought back to serving `status.afframe.com` by running
[`.github/workflows/deploy-statuspage.yml`](../../../.github/workflows/deploy-statuspage.yml)
after a one-time bootstrap.

> Not in scope for this directory: nightly libsql backup to R2 (the gap that
> causes loss of monitor configs + status-page slug + custom-domain SQL state
> on VPS death). Tracked separately.

## Files

| File                                  | Role                                                                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.github-packages.yaml` | Patched compose. All images digest-pinned. Mounts `patch-emails.sh` and `caddy/Caddyfile` from this dir.                                                                                             |
| `patch-emails.sh`                     | In-place sed wrapper for the `dashboard` + `status-page` containers — rewrites hardcoded openstatus.dev senders to `notifications@afframe.com`. See pre-flight 9 in STATUS-PAGE.md.                  |
| `caddy/Caddyfile`                     | Slug-prefix reverse proxy that maps `status.afframe.com/*` to the in-libsql page slug `afframe-status`. Works around upstream issue [#1968](https://github.com/openstatusHQ/openstatus/issues/1968). |
| `keepalive.sh`                        | Holds the `openstatus` WSL2 distro open so the tunnel does not die on idle. Run by the Windows Task `OpenStatusKeepAlive`.                                                                           |
| `windows-task.ps1`                    | Idempotent Windows Scheduled Task registration. Run once on a fresh VPS.                                                                                                                             |
| `env.docker.template`                 | `envsubst`-rendered to `/opt/openstatus/.env.docker` by the deploy workflow. Five placeholders pull from GH secrets.                                                                                 |

## Required GitHub Actions configuration

Set once on the repo, then never again until rotation.

### Secrets

| Secret                      | Value                                                                                          | Source                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `OPENSTATUS_AUTH_SECRET`    | NextAuth signing key                                                                           | `openssl rand -base64 32`                                                                                              |
| `OPENSTATUS_RESEND_API_KEY` | Resend API key for `notifications@afframe.com`                                                 | <https://resend.com/api-keys>                                                                                          |
| `OPENSTATUS_TUNNEL_TOKEN`   | Cloudflare Tunnel connector token (~238 chars JWT)                                             | Returned by `POST /accounts/.../cfd_tunnel`                                                                            |
| `OPENSTATUS_PROBE_KEY`      | Token generated when the `OVH EU` Private Location is created in the dashboard                 | Dashboard → Private Locations → Create                                                                                 |
| `OPENSTATUS_DB_AUTH_TOKEN`  | libsql auth token. Self-host typically leaves it empty (set to empty string).                  | n/a (empty string)                                                                                                     |
| `OVH_VPS_SSH_KEY`           | Private SSH key for the deploy user. **Distinct from the developer key** — keep deploy-scoped. | `ssh-keygen -t ed25519 -f openstatus-deploy` (commit pubkey to the Windows-OpenSSH administrators key file on the VPS) |
| `OVH_VPS_HOST_KEY`          | VPS host key in known_hosts format (verifies the deploy target)                                | `ssh-keyscan -p <ssh-port> <vps-host>`                                                                                 |

### Variables (non-secret to operators, not committed)

The VPS hostname, SSH port, and login user are set as GitHub repo
variables and are deliberately **not committed** to this repo. The
Cloudflare Tunnel hides the origin; committing the origin coordinates
would defeat that protection. Pull values from your password manager / 1Password vault.

| Variable       | Description                                      |
| -------------- | ------------------------------------------------ |
| `OVH_VPS_HOST` | VPS hostname or IP (origin behind CF tunnel)     |
| `OVH_VPS_PORT` | SSH port on the VPS (non-standard)               |
| `OVH_VPS_USER` | Windows account name on the VPS (case-sensitive) |

### One-time setup

All five setup steps below are automated by
[`bootstrap.sh`](./bootstrap.sh). Run it once from any machine with `gh`
authenticated and existing SSH access to the VPS (e.g. via the
`ovh-vps` config alias):

```bash
# From the repo root.
# --pull-from-vps reads the five stack secrets out of the live
# /opt/openstatus/.env.docker so you do not have to copy them by hand.
VPS_HOST=<vps-host> \
VPS_PORT=<ssh-port> \
VPS_USER=<windows-user> \
  infra/openstatus/deploy/bootstrap.sh --pull-from-vps
```

If the VPS is fresh (no `.env.docker` to read), drop `--pull-from-vps` and
export each `OPENSTATUS_*` value explicitly:

```bash
VPS_HOST=<vps-host> VPS_PORT=<ssh-port> VPS_USER=<windows-user> \
OPENSTATUS_RESEND_API_KEY="re_..." \
OPENSTATUS_TUNNEL_TOKEN="eyJ..." \
OPENSTATUS_PROBE_KEY="08a460a1-..." \
OPENSTATUS_DB_AUTH_TOKEN="" \
  infra/openstatus/deploy/bootstrap.sh
```

What the script does, idempotently:

1. Generate a deploy-only SSH keypair (skip if one already exists at
   `$KEY_PATH`, default `~/.ssh/openstatus-deploy`).
2. Append the pubkey to the Windows-OpenSSH administrators key file on the
   VPS (skip if already present).
3. `ssh-keyscan` the VPS and store the result as `OVH_VPS_HOST_KEY` for
   known_hosts pinning.
4. `gh secret set` + `gh variable set` for SSH + coordinate values.
5. `gh secret set` for the five stack secrets, either from env or pulled
   from `/opt/openstatus/.env.docker`.

The script does NOT trigger a deploy. Trigger the first deploy with:

```bash
gh workflow run deploy-statuspage.yml
```

Once configured, the workflow runs:

- Automatically on push to `main` when anything under `infra/openstatus/deploy/`
  or the workflow itself changes.
- Manually via `gh workflow run deploy-statuspage.yml` or the Actions UI.

Both paths gate on the `production` GitHub environment (5-minute wait timer +
one required reviewer per `docs/runbooks/SECRETS.md`).

## Rotation

Any of the five `OPENSTATUS_*` secrets can be rotated by `gh secret set …` and
then re-running the workflow. The `Install + recompose` step backs up the prior
`.env.docker` to `.env.docker.prev` on the VPS before overwriting, so a bad
rotation is recoverable by SSH + `mv` without re-running CI.

`OPENSTATUS_AUTH_SECRET` rotation invalidates every active dashboard session —
expected, no user impact (admin re-logs in via the magic-link flow).

`OPENSTATUS_TUNNEL_TOKEN` is regenerated by deleting + recreating the
Cloudflare Tunnel; this also invalidates the tunnel UUID, which means the two
DNS CNAMEs (`status` + `monitoring`) need re-pointing. Avoid unless the token
is actually compromised.

## Disaster recovery — fresh VPS

1. Provision a new Windows Server 2025 VPS at OVH and SSH-bootstrap your dev
   key (one-shot, out of band).
2. Follow [`STATUS-PAGE.md`](../../../docs/runbooks/STATUS-PAGE.md) Phase 1
   steps 1–4 + Phase 2 step 9 (Cloudflare Tunnel create). These steps cover
   the WSL2 distro setup and the tunnel registration — neither is automated
   by this workflow.
3. Add the deploy pubkey to the new VPS, update repo `OVH_VPS_HOST` /
   `OVH_VPS_HOST_KEY` if the IP changed.
4. Run `gh workflow run deploy-statuspage.yml`. The workflow ships the
   compose + scripts + `.env.docker` and starts the stack.
5. Run `infra/openstatus/deploy/windows-task.ps1` on the VPS once over SSH to
   re-register the keep-alive task.
6. Restore libsql state from backup (workspace, monitors, page slug,
   subscribers). Until the nightly-backup-to-R2 work lands, this step is
   manual: dashboard re-onboarding + the SQL UPDATEs in STATUS-PAGE.md Phase 1
   step 8 + Phase 3 step 5 (`plan='team'`, `limits` JSON, `custom_domain=''`).

## Not in this directory

- Cloudflare Tunnel + DNS records — managed via the Cloudflare API in
  Phase 2 of STATUS-PAGE.md; not yet IaC-managed.
- Monitor configurations — live in
  [`infra/openstatus/openstatus.yaml`](../openstatus.yaml) as
  operator-authored intent; the upstream CLI does not target self-host
  (pre-flight 4 in STATUS-PAGE.md).
- libsql + Tinybird historical data — no nightly backup yet. Listed as the
  next DR follow-up.
