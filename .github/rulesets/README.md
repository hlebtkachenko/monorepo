# Rulesets

Branch protection as code. Apply via `gh api`.

**Live ruleset ID: `16205433`** (deployed 2026-05-11).

## Apply (first time)

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/hlebtkachenko/monorepo/rulesets \
  --input .github/rulesets/main.json
```

The response includes `id`. Save it for subsequent updates.

## Update existing

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/hlebtkachenko/monorepo/rulesets/16205433 \
  --input .github/rulesets/main.json
```

## List + verify

```bash
gh api /repos/hlebtkachenko/monorepo/rulesets
gh api /repos/hlebtkachenko/monorepo/rulesets/16205433 | jq .
```

## Drift detection

```bash
gh api /repos/hlebtkachenko/monorepo/rulesets/16205433 > /tmp/live.json
diff <(jq -S . .github/rulesets/main.json) <(jq -S . /tmp/live.json)
```

## Rollback

```bash
gh api --method DELETE /repos/hlebtkachenko/monorepo/rulesets/16205433
```

## Notes

- `target: branch` + `ref_name.include: refs/heads/main`. Default branch is `main`.
- `required_status_checks` references the **per-job context strings** (GitHub Rulesets resolution rule), not workflow names. The 10 listed match what runs on every PR (verified via `gh pr view <n> --json statusCheckRollup`). Excluded: `CodeQL` and `osv-scanner` advisory app status (no PR-time workflow attribution; can disappear).
- `file_path_restriction` is NOT included: requires GitHub Pro/Enterprise tier (returns 422 on free). Secret-file leak guard handled by `gitleaks` workflow + `.gitignore` + `scripts/check-client-secrets.mjs` instead.
- `bypass_actors: []` — no exceptions. Owner can bypass via repo admin if needed in emergency.

## Why JSON in repo

Manual UI clicks for branch protection lose track of what's enforced as advisory checks queue for promotion. JSON in repo + `gh api` deploy = drift detectable, auditable, version-controlled.
