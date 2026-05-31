#!/usr/bin/env bash
#
# Bind / unbind the afframe-sleeping Worker on the public hosts.
#
#   routes.sh on  [staging|production|all]   bind   → show the sleeping page
#   routes.sh off [staging|production|all]   unbind → traffic flows to origin
#   routes.sh status                         list bound sleeping routes
#
# Env arg defaults to "all". Toggle is a couple of Cloudflare API calls (~1s),
# never an app redeploy. While unbound, the Worker receives zero traffic.
#
# Wired into docs/runbooks/ENV-POWER.md via .github/workflows/power.yml:
#   cold-pause / warm-pause → routes.sh on  <env>   (after ECS scales to 0)
#   resume                  → routes.sh off <env>   (after the env is healthy,
#                                                    so users never hit a
#                                                    still-booting origin)
#
# Requires: CLOUDFLARE_API_TOKEN with Zone:Read + Zone:Workers Routes:Edit.
set -euo pipefail

ZONE_NAME="afframe.com"
SCRIPT_NAME="afframe-sleeping"
API="https://api.cloudflare.com/client/v4"

STAGING_HOSTS=(
  "app-staging.afframe.com/*"
  "api-staging.afframe.com/*"
  "admin-staging.afframe.com/*"
)
PROD_HOSTS=(
  "app.afframe.com/*"
  "api.afframe.com/*"
  "admin.afframe.com/*"
)

cmd="${1:-status}"
scope="${2:-all}"
case "${scope}" in
  staging)    HOSTS=("${STAGING_HOSTS[@]}") ;;
  production) HOSTS=("${PROD_HOSTS[@]}") ;;
  all)        HOSTS=("${STAGING_HOSTS[@]}" "${PROD_HOSTS[@]}") ;;
  *) echo "unknown scope: ${scope} (use staging|production|all)" >&2; exit 2 ;;
esac

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Zone:Read + Workers Routes:Edit)}"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")

zone_id="$(curl -fsS "${AUTH[@]}" "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')"
[ -n "${zone_id}" ] || { echo "error: zone ${ZONE_NAME} not found / token lacks access" >&2; exit 1; }

# Is $1 present in the selected HOSTS set?
in_scope() {
  local needle="$1" h
  for h in "${HOSTS[@]}"; do [ "${h}" = "${needle}" ] && return 0; done
  return 1
}

case "${cmd}" in
  on)
    for pat in "${HOSTS[@]}"; do
      resp="$(curl -sS "${AUTH[@]}" -X POST "${API}/zones/${zone_id}/workers/routes" \
        -H "Content-Type: application/json" \
        --data "{\"pattern\":\"${pat}\",\"script\":\"${SCRIPT_NAME}\"}")"
      if echo "${resp}" | jq -e '.success == true' >/dev/null; then
        echo "bound   ${pat}"
      elif echo "${resp}" | grep -q 'duplicate'; then
        echo "exists  ${pat}"
      else
        echo "FAILED  ${pat}: ${resp}" >&2; exit 1
      fi
    done
    echo "Sleeping page ON for: ${scope}"
    ;;
  off)
    curl -fsS "${AUTH[@]}" "${API}/zones/${zone_id}/workers/routes" \
      | jq -r --arg s "${SCRIPT_NAME}" '.result[] | select(.script == $s) | "\(.id)\t\(.pattern)"' \
      | while IFS=$'\t' read -r id pattern; do
          [ -n "${id}" ] || continue
          in_scope "${pattern}" || continue
          curl -fsS "${AUTH[@]}" -X DELETE "${API}/zones/${zone_id}/workers/routes/${id}" >/dev/null
          echo "removed ${pattern}"
        done
    echo "Sleeping page OFF for: ${scope}"
    ;;
  status)
    curl -fsS "${AUTH[@]}" "${API}/zones/${zone_id}/workers/routes" \
      | jq -r --arg s "${SCRIPT_NAME}" '.result[] | select(.script == $s) | "bound: \(.pattern)"'
    ;;
  *)
    echo "usage: routes.sh on|off|status [staging|production|all]" >&2; exit 2 ;;
esac
