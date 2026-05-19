#!/usr/bin/env bash
# One-shot bootstrap for the deploy-statuspage.yml workflow.
#
# Performs every step in infra/openstatus/deploy/README.md "One-time setup"
# in one idempotent run:
#   1. Generate a deploy-only SSH keypair (skip if a key file already exists).
#   2. Install the public key on the VPS administrators_authorized_keys file.
#   3. Capture the VPS host key for known_hosts pinning.
#   4. Push OVH_* secrets + variables to GitHub Actions.
#   5. Push the five OPENSTATUS_* stack secrets to GitHub Actions, either from
#      values you export ahead of time OR by pulling them out of the live
#      /opt/openstatus/.env.docker on the VPS (--pull-from-vps).
#
# This script does NOT trigger a deployment. After it succeeds, run:
#   gh workflow run deploy-statuspage.yml
# to verify the full path end-to-end.
#
# Required env (caller exports before running):
#   VPS_HOST      VPS hostname or IP. Behind Cloudflare Tunnel — keep secret.
#   VPS_PORT      SSH port on the VPS (non-standard).
#   VPS_USER      Windows account name on the VPS (case-sensitive).
#   VPS_SSH_ALIAS Optional. Existing ~/.ssh/config Host alias for the dev key
#                 used to bootstrap. Default: ovh-vps.
#
# Required env when not using --pull-from-vps:
#   OPENSTATUS_RESEND_API_KEY
#   OPENSTATUS_TUNNEL_TOKEN
#   OPENSTATUS_PROBE_KEY
#   OPENSTATUS_DB_AUTH_TOKEN  (may be empty)
#
# Optional env:
#   KEY_PATH                  Where to write the deploy keypair.
#                             Default: $HOME/.ssh/openstatus-deploy
#   OPENSTATUS_AUTH_SECRET    Override the auto-generated value.

set -euo pipefail

PULL_FROM_VPS=0
for arg in "$@"; do
    case "$arg" in
    --pull-from-vps) PULL_FROM_VPS=1 ;;
    --help | -h)
        sed -n '2,40p' "$0"
        exit 0
        ;;
    *)
        echo "unknown arg: $arg" >&2
        exit 2
        ;;
    esac
done

: "${VPS_HOST:?set VPS_HOST}"
: "${VPS_PORT:?set VPS_PORT}"
: "${VPS_USER:?set VPS_USER}"
VPS_SSH_ALIAS="${VPS_SSH_ALIAS:-ovh-vps}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/openstatus-deploy}"

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "missing tool: $1" >&2
        exit 1
    }
}
need gh
need ssh
need ssh-keygen
need ssh-keyscan
need openssl

gh auth status >/dev/null

echo "[1/5] deploy keypair @ $KEY_PATH"
if [ -f "$KEY_PATH" ]; then
    echo "    exists — reusing"
else
    ssh-keygen -t ed25519 -N "" -f "$KEY_PATH" -C "openstatus-deploy@gha"
fi
chmod 600 "$KEY_PATH" "$KEY_PATH.pub"

echo "[2/5] install pubkey on VPS (over existing $VPS_SSH_ALIAS access)"
PUBKEY=$(cat "$KEY_PATH.pub")
# Add only if not already present. Windows-OpenSSH stores the admin key file
# under C:\ProgramData\ssh; we let PowerShell resolve the exact filename so
# the script does not hardcode the path in the public repo.
ssh "$VPS_SSH_ALIAS" "powershell -NoProfile -Command \"
    \$keyfile = Join-Path \$env:ProgramData 'ssh\\administrators_authorized_keys';
    if (-not (Test-Path \$keyfile)) { New-Item -ItemType File -Force -Path \$keyfile | Out-Null }
    \$line = '$PUBKEY';
    if (-not (Select-String -Path \$keyfile -SimpleMatch \$line -Quiet)) {
        Add-Content -Path \$keyfile -Value \$line
        icacls \$keyfile /inheritance:r /grant 'SYSTEM:(R)' /grant 'BUILTIN\\Administrators:(R)' | Out-Null
        Write-Output 'pubkey installed'
    } else {
        Write-Output 'pubkey already present'
    }
\""

echo "[3/5] capture VPS host key for known_hosts pinning"
HOST_KEY=$(ssh-keyscan -p "$VPS_PORT" "$VPS_HOST" 2>/dev/null)
if [ -z "$HOST_KEY" ]; then
    echo "ssh-keyscan returned empty output for $VPS_HOST:$VPS_PORT" >&2
    exit 1
fi

echo "[4/5] push SSH secrets + VPS coordinate vars"
gh secret set OVH_VPS_SSH_KEY <"$KEY_PATH"
printf '%s\n' "$HOST_KEY" | gh secret set OVH_VPS_HOST_KEY
gh variable set OVH_VPS_HOST --body "$VPS_HOST"
gh variable set OVH_VPS_PORT --body "$VPS_PORT"
gh variable set OVH_VPS_USER --body "$VPS_USER"

echo "[5/5] push OPENSTATUS_* stack secrets"
if [ "$PULL_FROM_VPS" = 1 ]; then
    echo "    --pull-from-vps: reading /opt/openstatus/.env.docker"
    ENV_BLOB=$(ssh -i "$KEY_PATH" -p "$VPS_PORT" \
        -o StrictHostKeyChecking=accept-new \
        -o BatchMode=yes \
        "$VPS_USER@$VPS_HOST" \
        "powershell -NoProfile -Command \"wsl -d openstatus -u root -- bash -lc 'cat /opt/openstatus/.env.docker'\"")
    pick() {
        printf '%s\n' "$ENV_BLOB" | awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print; exit}'
    }
    OPENSTATUS_AUTH_SECRET="${OPENSTATUS_AUTH_SECRET:-$(pick AUTH_SECRET)}"
    OPENSTATUS_RESEND_API_KEY=$(pick RESEND_API_KEY)
    OPENSTATUS_TUNNEL_TOKEN=$(pick TUNNEL_TOKEN)
    OPENSTATUS_PROBE_KEY=$(pick OPENSTATUS_KEY)
    OPENSTATUS_DB_AUTH_TOKEN=$(pick DATABASE_AUTH_TOKEN)
else
    : "${OPENSTATUS_RESEND_API_KEY:?set OPENSTATUS_RESEND_API_KEY or pass --pull-from-vps}"
    : "${OPENSTATUS_TUNNEL_TOKEN:?set OPENSTATUS_TUNNEL_TOKEN or pass --pull-from-vps}"
    : "${OPENSTATUS_PROBE_KEY:?set OPENSTATUS_PROBE_KEY or pass --pull-from-vps}"
    OPENSTATUS_DB_AUTH_TOKEN="${OPENSTATUS_DB_AUTH_TOKEN:-}"
    OPENSTATUS_AUTH_SECRET="${OPENSTATUS_AUTH_SECRET:-$(openssl rand -base64 32)}"
fi

for k in OPENSTATUS_AUTH_SECRET OPENSTATUS_RESEND_API_KEY OPENSTATUS_TUNNEL_TOKEN OPENSTATUS_PROBE_KEY OPENSTATUS_DB_AUTH_TOKEN; do
    v="${!k}"
    if [ -z "$v" ] && [ "$k" != "OPENSTATUS_DB_AUTH_TOKEN" ]; then
        echo "    $k is empty — refusing to push" >&2
        exit 1
    fi
    printf '%s' "$v" | gh secret set "$k"
done

cat <<EOF

Bootstrap complete.

Verify in the GitHub UI: Settings -> Secrets and variables -> Actions
  Secrets:   OVH_VPS_SSH_KEY, OVH_VPS_HOST_KEY,
             OPENSTATUS_AUTH_SECRET, OPENSTATUS_RESEND_API_KEY,
             OPENSTATUS_TUNNEL_TOKEN, OPENSTATUS_PROBE_KEY,
             OPENSTATUS_DB_AUTH_TOKEN
  Variables: OVH_VPS_HOST, OVH_VPS_PORT, OVH_VPS_USER

To trigger the first deploy:
  gh workflow run deploy-statuspage.yml

The workflow gates on the 'production' GitHub environment (5-minute wait +
required reviewer). Approve in the Actions UI, then watch the smoke check
hit https://status.afframe.com/.

The deploy keypair stays at $KEY_PATH. Keep it; rotating it requires
re-running this script and updating the VPS admin keys file.
EOF
