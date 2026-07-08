# Rulesets

Repository rulesets as code. Each JSON file mirrors a live GitHub ruleset and is
applied via `gh api`. Keeping them in the repo makes enforcement auditable,
version-controlled, and drift-detectable.

## Live rulesets

| File                | Ruleset        | ID         | Target                    |
| ------------------- | -------------- | ---------- | ------------------------- |
| `main.json`         | `main`         | `16193807` | `branch` (default branch) |
| `release-tags.json` | `release-tags` | `16199683` | `tag` (`refs/tags/v*`)    |

Both are `active`. The JSON files are stored in apply-input shape — the live
API responses additionally carry `id`, `source_type`, and `source`, which are
server-side metadata and intentionally absent here.

## `main.json` — default-branch protection

Rules: `deletion`, `non_fast_forward`, `required_linear_history`,
`code_scanning` (CodeQL, medium-or-higher security alerts), `pull_request`
(PR required, 0 approvals), and `required_status_checks`: 14 contexts that
must pass before merge:

`ci`, `gitleaks`, `lint`, `Analyze (javascript-typescript)`, `review`,
`scan-pr / osv-scan`, `knip`, `check`, `boundaries`, `conv-title`, `size-cap`,
`shellcheck`, `cdk-synth-strict (staging)`, `cdk-synth-strict (production)`.

`bypass_actors`: repository Admin role (`actor_id: 5`), bypass `always`.

## `release-tags.json` — release-tag protection

Protects `v*` tags (`release.yml` triggers on `push: tags v*`).
Rules: `deletion` (no tag deletes), `non_fast_forward` (tags immutable once
pushed), `required_signatures` (release tags must be signed).
No bypass actors.

## Apply (first time)

```bash
gh api --method POST -H "Accept: application/vnd.github+json" \
  /repos/hlebtkachenko/monorepo/rulesets --input .github/rulesets/main.json
```

The response includes `id`; record it in the table above.

## Update existing

```bash
# main ruleset
gh api --method PUT -H "Accept: application/vnd.github+json" \
  /repos/hlebtkachenko/monorepo/rulesets/16193807 --input .github/rulesets/main.json

# release-tags ruleset
gh api --method PUT -H "Accept: application/vnd.github+json" \
  /repos/hlebtkachenko/monorepo/rulesets/16199683 --input .github/rulesets/release-tags.json
```

## List + verify

```bash
gh api /repos/hlebtkachenko/monorepo/rulesets
gh api /repos/hlebtkachenko/monorepo/rulesets/16193807 | jq .
gh api /repos/hlebtkachenko/monorepo/rulesets/16199683 | jq .
```

## Drift detection

```bash
gh api /repos/hlebtkachenko/monorepo/rulesets/16193807 > /tmp/live-main.json
diff <(jq -S 'del(.id,.source_type,.source,.created_at,.updated_at,._links,.current_user_can_bypass,.node_id)' /tmp/live-main.json) \
     <(jq -S . .github/rulesets/main.json)
```

The `jq del(...)` strips server-side metadata so only real policy drift shows.

## Rollback

```bash
gh api --method DELETE /repos/hlebtkachenko/monorepo/rulesets/16193807
gh api --method DELETE /repos/hlebtkachenko/monorepo/rulesets/16199683
```

## Notes

- `main.json` targets `~DEFAULT_BRANCH` (resolves to `main`).
- `required_status_checks` lists per-job **context strings**, not workflow
  names (GitHub Rulesets resolution rule). Each is pinned to the GitHub Actions
  app via `integration_id: 15368`. CodeQL is enforced both as the
  `Analyze (javascript-typescript)` status check and the `code_scanning` rule.
- `code_quality` is deliberately not enabled in this ruleset. GitHub requires
  Code Quality to be enabled and reporting a `CodeQL - Code Quality` check
  before adding a ruleset threshold; this repo currently relies on local CI
  quality gates instead.
- `osv-scanner` standalone app status and other advisory checks are not
  required — they have no reliable PR-time workflow attribution.
- `file_path_restriction` is not used: it needs GitHub Pro/Enterprise (422 on
  free tier). Secret-leak protection is handled by the `gitleaks` workflow,
  `.gitignore`, and `scripts/check-client-secrets.mjs`.
- Advisory CI workflows are promoted to required by adding their context to
  `main.json` `required_status_checks` and re-applying with the PUT command.
