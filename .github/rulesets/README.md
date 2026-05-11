# Rulesets

Branch protection as code. Apply via `gh api`.

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
  /repos/hlebtkachenko/monorepo/rulesets/<id> \
  --input .github/rulesets/main.json
```

## List + verify

```bash
gh api /repos/hlebtkachenko/monorepo/rulesets
gh api /repos/hlebtkachenko/monorepo/rulesets/<id> | jq .
```

## Drift detection

```bash
gh api /repos/hlebtkachenko/monorepo/rulesets/<id> > /tmp/live.json
diff <(jq -S . .github/rulesets/main.json) <(jq -S . /tmp/live.json)
```

## Rollback

```bash
gh api --method DELETE /repos/hlebtkachenko/monorepo/rulesets/<id>
```

## Notes

- `target: branch` + `ref_name.include: refs/heads/main`. Default branch is `main`.
- `required_status_checks` references the **per-job context strings** (GitHub Rulesets resolution rule), not workflow names. The 10 listed match what runs on every PR (verified via `gh pr view <n> --json statusCheckRollup`). Excluded: `CodeQL` and `osv-scanner` advisory app status (no PR-time workflow attribution; can disappear).
- `file_path_restriction` blocks `.env*`, `*.key`, `*.pem`, `*.enc`, `client_secret*.json`, `userlist.txt`. Aligns with `.gitignore` and `scripts/check-client-secrets.mjs`.
- `bypass_actors: []` — no exceptions. Owner can bypass via repo admin if needed in emergency.

## Why JSON in repo

Manual UI clicks for branch protection lose track of what's enforced as advisory checks queue for promotion. JSON in repo + `gh api` deploy = drift detectable, auditable, version-controlled.
