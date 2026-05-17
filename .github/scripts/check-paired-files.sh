#!/usr/bin/env bash
#
# check-paired-files.sh
#
# Enforces paired-file rules declared in .github/related-files.yml.
#
# For each rule: if the current PR changes any file matching `when_changed`
# but no file matching `require_one_of`, a violation is reported. Violations
# with severity `block` make the script exit non-zero; severity `warn`
# violations are printed but the script still exits 0 (advisory).
#
# Usage:
#   GH_TOKEN=<token> .github/scripts/check-paired-files.sh
#
# Requirements:
#   - yq (mikefarah/yq v4) — preinstalled on GitHub ubuntu runners.
#   - gh CLI with GH_TOKEN set — preinstalled on GitHub ubuntu runners.
#   - Run inside a `pull_request` event so `gh pr diff` resolves the PR.

set -euo pipefail

RULES_FILE=".github/related-files.yml"

if [[ ! -f "${RULES_FILE}" ]]; then
  echo "error: ${RULES_FILE} not found" >&2
  exit 1
fi

# Collect the PR's changed files, one path per line. In CI, actions/checkout
# leaves a detached HEAD, so `gh pr diff` cannot infer the PR from the branch
# — the workflow passes the PR number explicitly via PR_NUMBER.
if [[ -n "${PR_NUMBER:-}" ]]; then
  changed_files="$(gh pr diff "${PR_NUMBER}" --name-only)"
else
  changed_files="$(gh pr diff --name-only)"
fi

if [[ -z "${changed_files}" ]]; then
  echo "No changed files detected in this PR; nothing to check."
  exit 0
fi

echo "Changed files in this PR:"
echo "${changed_files}" | sed 's/^/  /'
echo

# Return 0 if any line in $changed_files matches the glob in $1.
matches_glob() {
  local glob="$1"
  local file
  while IFS= read -r file; do
    [[ -z "${file}" ]] && continue
    # shellcheck disable=SC2053 — intentional glob match, not literal.
    if [[ "${file}" == ${glob} ]]; then
      return 0
    fi
  done <<< "${changed_files}"
  return 1
}

# Enable `**` to span directory separators in glob matches.
shopt -s globstar extglob

rule_count="$(yq '.pairs | length' "${RULES_FILE}")"
if [[ "${rule_count}" == "0" || "${rule_count}" == "null" ]]; then
  echo "No pairs defined in ${RULES_FILE}; nothing to check."
  exit 0
fi

violations=0
blocking_violations=0

for ((i = 0; i < rule_count; i++)); do
  id="$(yq ".pairs[${i}].id" "${RULES_FILE}")"
  when_changed="$(yq ".pairs[${i}].when_changed" "${RULES_FILE}")"
  require_one_of="$(yq ".pairs[${i}].require_one_of" "${RULES_FILE}")"
  severity="$(yq ".pairs[${i}].severity" "${RULES_FILE}")"
  reason="$(yq ".pairs[${i}].reason" "${RULES_FILE}")"

  echo "Rule '${id}': when '${when_changed}' changes, require '${require_one_of}'."

  if ! matches_glob "${when_changed}"; then
    echo "  ok — no files matching '${when_changed}' changed."
    echo
    continue
  fi

  if matches_glob "${require_one_of}"; then
    echo "  ok — paired file matching '${require_one_of}' is present."
    echo
    continue
  fi

  violations=$((violations + 1))
  echo "  VIOLATION [${severity}] — files matching '${when_changed}' changed,"
  echo "    but no file matching '${require_one_of}' is in the PR diff."
  echo "    Reason: ${reason}"
  if [[ "${severity}" == "block" ]]; then
    blocking_violations=$((blocking_violations + 1))
  fi
  echo
done

if [[ "${violations}" -eq 0 ]]; then
  echo "All paired-file rules satisfied."
  exit 0
fi

echo "${violations} paired-file rule(s) violated (${blocking_violations} blocking)."

if [[ "${blocking_violations}" -gt 0 ]]; then
  exit 1
fi

echo "Only advisory (warn) violations found — exiting 0."
exit 0
