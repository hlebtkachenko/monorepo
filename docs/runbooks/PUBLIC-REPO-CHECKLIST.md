# Public Repo Hardening Checklist

Things you (Hleb) must do in the GitHub UI, on your Mac, or via `gh` CLI to complete the public-repo hardening that PR #8 begins. Code-side changes are done; these are owner-only operations.

Walk this top-to-bottom. Each section says **why**, gives a **direct deep link**, and shows the **exact values** to set + a **gh CLI** equivalent where one exists.

Repo: `hlebtkachenko/monorepo` (replace if you fork/rename).

---

## 1. Actions security defaults

**Why**: Default-deny token, fork-PR approval, no rogue PR creation by Actions.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/actions>

Set these values:

| Setting | Value | Reason |
|---|---|---|
| Actions permissions | "Allow all actions and reusable workflows" | All your actions are SHA-pinned, so this is safe. Tighter "Allow select" is over-engineering at solo scale. |
| Fork pull request workflows from outside collaborators | **Require approval for all outside collaborators** | Default is "first-time contributor". Stricter is correct for a public fintech repo. |
| Workflow permissions → Default GITHUB_TOKEN permissions | **Read repository contents and packages permissions** | Default-deny. Each workflow grants explicit `permissions:` per-job; this turns off the bypass. |
| Allow GitHub Actions to create and approve pull requests | **OFF** | You don't want Actions self-approving Dependabot PRs. |

gh CLI equivalent (one-liner):
```sh
gh api -X PUT /repos/hlebtkachenko/monorepo/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
```

For the Fork PR setting (no API as of May 2026; UI only).

---

## 2. Code security & analysis

**Why**: Enable push-time secret detection, private vulnerability reporting, Dependabot security updates.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/security_analysis>

Set these (all free for public repos):

| Feature | Action | Reason |
|---|---|---|
| Private vulnerability reporting | **Enable** | Researchers can report privately via the GitHub UI. Adds an "Advisories" tab. |
| Dependabot alerts | **Enable** (auto-on for public) | Confirm. |
| Dependabot security updates | **Enable** | Auto-PRs for security CVEs. |
| Dependabot version updates | (already configured via `.github/dependabot.yml`) | Verify status = green. |
| Secret scanning | **Enable** (auto-on for public) | Confirm. |
| Push protection (secret scanning) | **Enable** | Blocks pushes that contain detected secrets. Critical for a public repo. |
| Push protection alerts | **Enable** | Notifies you when push protection fires. |
| Code scanning (CodeQL) → Default setup | **Enable** | But also keep your `codeql.yml` workflow — it's "Advanced setup". When prompted, choose **Switch to advanced** to keep the workflow and avoid duplicate runs. |
| Code scanning → Tools → Notify in pull requests | **Enable** | Adds CodeQL findings as PR comments. |

gh CLI:
```sh
gh api -X PATCH /repos/hlebtkachenko/monorepo \
  -F security_and_analysis[secret_scanning][status]=enabled \
  -F security_and_analysis[secret_scanning_push_protection][status]=enabled \
  -F security_and_analysis[private_vulnerability_reporting][status]=enabled \
  -F security_and_analysis[dependabot_security_updates][status]=enabled
```

---

## 3. Branch protection on `main`

**Why**: Stop direct pushes to main. Require PR + status checks + signed commits.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/branches>

Click **Add classic branch protection rule** (or **Add ruleset** — use ruleset for new repos; classic protection is fine for a single rule). Branch name pattern: `main`.

Settings:

| Setting | Value | Reason |
|---|---|---|
| Require a pull request before merging | **ON** | No direct pushes to main. |
| Required approvals | **0** today, **1** when 2nd reviewer exists | Solo dev — one approver = author rule blocks merges. |
| Dismiss stale pull request approvals when new commits are pushed | **ON** | Prevents approve-and-sneak. |
| Require review from Code Owners | **ON** | Honours `.github/CODEOWNERS`. |
| Require approval of the most recent reviewable push | **OFF** today (solo) | Re-enable when ≥ 2 reviewers. |
| Require status checks to pass before merging | **ON** | Block merges on failing CI. |
| Status checks (required) | Start with: `ci`, `gitleaks`. **Add the new advisories after a green PR cycle.** | The new advisory checks in PR #8 must run successfully on a real PR before flipping them to required (otherwise required-but-never-triggered = stuck PRs). |
| Require branches to be up to date | **ON** | Catches stale-branch breakage. |
| Require conversation resolution before merging | **ON** | No unresolved review threads merging. |
| Require signed commits | **ON** *(after you set up signing in section 5)* | Audit trail integrity. |
| Require linear history | **ON** | No merge commits; squash or rebase only. |
| Require deployments to succeed before merging | OFF (no deployments yet) | Re-enable when staging deploy lands. |
| Lock branch | **OFF** | Need to merge PRs. |
| Do not allow bypassing the above settings | **ON** | Including admins. Even you. |
| Restrict who can push to matching branches | (leave empty) | Anyone with PR access can merge once gates pass. |
| Allow force pushes | **OFF** | Never on main. |
| Allow deletions | **OFF** | Never on main. |

gh CLI to apply most of this (signed commits requires UI for now):
```sh
gh api -X PUT /repos/hlebtkachenko/monorepo/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci", "gitleaks"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

After signing key is set up (section 5), enable signed commits requirement via UI OR:
```sh
gh api -X POST /repos/hlebtkachenko/monorepo/branches/main/protection/required_signatures
```

Once a PR cycle proves the new advisory checks pass, add them to the required list:
```sh
gh api -X PATCH /repos/hlebtkachenko/monorepo/branches/main/protection/required_status_checks \
  -F 'contexts[]=ci' -F 'contexts[]=gitleaks' \
  -F 'contexts[]=workflow-lint' -F 'contexts[]=codeql' \
  -F 'contexts[]=dependency-review' -F 'contexts[]=commitlint' \
  -F 'contexts[]=size-limit' -F 'contexts[]=osv-scanner-pr' \
  -F 'contexts[]=container-scan' -F 'contexts[]=analysis'
```

---

## 4. Tag protection (release safety)

**Why**: Tags trigger `release.yml` (signs + publishes). Tag forgery = signed-release forgery.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/tag_protection>

Add tag pattern `v*` with **Require signed tags = ON** (if your plan supports it; on Free public repos the rule is less granular — at minimum prevent deletion).

Free-plan equivalent: keep main branch protection's "Require signed commits" on, and only push tags from a workstation with a signing key configured.

---

## 5. SSH commit signing setup (Mac local)

**Why**: Required by branch protection + executor brief. SSH signing is simpler than GPG and works with the same key you already use to push.

References:
- GitHub guide: <https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification>
- SSH signing specifics: <https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification#ssh-commit-signature-verification>

### 5.1 Verify which SSH key you push with

```sh
gh auth status
# look for: "✓ Git operations protocol: ssh"
ssh-add -L
# this prints all loaded SSH public keys
```

If you don't have an `id_ed25519` already, create one:
```sh
ssh-keygen -t ed25519 -C "g1053015@icloud.com"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

### 5.2 Configure git to sign commits with that key

```sh
KEY=$(awk '{print $1, $2}' ~/.ssh/id_ed25519.pub)
git config --global gpg.format ssh
git config --global user.signingkey "$KEY"
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# Tell git which keys to TRUST as valid signers (yourself):
mkdir -p ~/.config/git
echo "g1053015@icloud.com $KEY" > ~/.config/git/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
```

### 5.3 Upload the key as a SIGNING key (different from your push/auth key listing)

GitHub treats the same SSH key once for auth and once for signing. Add it as a signing key:

**Open**: <https://github.com/settings/ssh/new>

- Title: `MacBook Pro M5 — signing`
- Key type: **Signing Key**
- Key: paste the contents of `~/.ssh/id_ed25519.pub`

OR via gh:
```sh
gh ssh-key add ~/.ssh/id_ed25519.pub --title "MacBook Pro M5 — signing" --type signing
```

### 5.4 Verify a signed commit shows up green on GitHub

```sh
git commit --allow-empty -m "test: signing test" -S
git push
gh pr view 8 --web   # check the commits tab; latest commit shows "Verified" badge
```

If "Verified" doesn't appear, ssh signing isn't set up. Most common causes:
- Key uploaded as Authentication key, not Signing key (re-upload as Signing).
- `commit.gpgsign` not set globally.
- Different signing key in `user.signingkey` vs uploaded key.

After it works, re-sign the unsigned commits in PR #8:

```sh
git checkout hlebtkachenko/aws-cicd-plan
git rebase -i origin/main
# in the editor, change every "pick" to "reword" (or just "pick" — git resigns on rewrite)
# save+exit; git resigns each commit with current SSH signing key
git push --force-with-lease
```

After this, enable **Require signed commits** in branch protection (section 3).

---

## 6. GitHub Environments — staging + production

**Why**: Required by `_deploy-aws.yml`. Each env enforces approval gates + branch policy + secrets scope.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/environments>

Click **New environment**. Create two:

### `staging`

| Setting | Value |
|---|---|
| Required reviewers | (leave empty for now; auto-deploy on main) |
| Wait timer | 0 |
| Deployment branches | **Selected branches only** → `main` |
| Allow administrators to bypass configured protection rules | OFF |

### `production`

| Setting | Value |
|---|---|
| Required reviewers | **Hleb Tkachenko** (you can self-approve solo; brief notes 2-reviewer rule deferred until headcount) |
| Wait timer | **5** (minutes) — gives you a chance to abort if you misclick |
| Deployment branches | **Selected branches only** → `main` |
| Allow administrators to bypass configured protection rules | OFF |

gh CLI:
```sh
# staging
gh api -X PUT /repos/hlebtkachenko/monorepo/environments/staging \
  -F deployment_branch_policy[protected_branches]=true \
  -F deployment_branch_policy[custom_branch_policies]=false

# production (set required reviewer ID first)
HLEB_ID=$(gh api /users/hlebtkachenko --jq .id)
gh api -X PUT /repos/hlebtkachenko/monorepo/environments/production \
  -F wait_timer=5 \
  -F "reviewers[][type]=User" -F "reviewers[][id]=$HLEB_ID" \
  -F deployment_branch_policy[protected_branches]=true \
  -F deployment_branch_policy[custom_branch_policies]=false
```

---

## 7. Repository variables (non-sensitive AWS bootstrap config)

**Why**: `_deploy-aws.yml` reads these. They are non-sensitive (account IDs, role ARNs, regions) so they live in `vars`, NOT `secrets`.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/variables/actions>

Add (leave blank until AWS bootstrap is complete; the `guard` job in `_deploy-aws.yml` short-circuits when `AWS_BOOTSTRAPPED != "true"`):

| Variable | Scope | Value (eventual) |
|---|---|---|
| `AWS_BOOTSTRAPPED` | Repository | `false` (today) → `true` after AWS-BOOTSTRAP runbook complete |
| `AWS_REGION` | Repository | `eu-central-1` |
| `AWS_ACCOUNT_ID_MGMT` | Repository | `<TBD>` |
| `AWS_ACCOUNT_ID_LOG` | Repository | `<TBD>` |
| `AWS_ACCOUNT_ID_AUDIT` | Repository | `<TBD>` |
| `AWS_ACCOUNT_ID_SHARED` | Repository | `<TBD>` |
| `AWS_ACCOUNT_ID_STAGING` | Environment: staging | `<TBD>` |
| `AWS_ACCOUNT_ID_PRODUCTION` | Environment: production | `<TBD>` |
| `AWS_DEPLOY_ROLE_ARN_STAGING` | Environment: staging | `arn:aws:iam::<TBD>:role/gh-actions-deploy-staging` |
| `AWS_DEPLOY_ROLE_ARN_PRODUCTION` | Environment: production | `arn:aws:iam::<TBD>:role/gh-actions-deploy-production` |

gh CLI (today, with placeholders):
```sh
gh variable set AWS_BOOTSTRAPPED --body "false"
gh variable set AWS_REGION --body "eu-central-1"
```

---

## 8. Repository secrets (sensitive)

**Why**: Things that ARE sensitive go here. None today — cosign keyless = no signing keys, OIDC = no AWS keys.

**Open**: <https://github.com/hlebtkachenko/monorepo/settings/secrets/actions>

Today: **leave empty.**

When future tooling demands a secret:
- Sentry DSN → environment-scoped secret per env (`SENTRY_DSN`)
- Honeycomb API key → environment-scoped secret per env (`HONEYCOMB_WRITE_KEY`)

**NEVER** put any of these here:
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (use OIDC)
- Classic personal access tokens (use GitHub Apps if cross-repo automation needed)
- Long-lived API keys without rotation

---

## 9. License confirmation

`LICENSE` was added as **MIT** (default for public-while-pre-release).

If you need proprietary terms:
- Public repo with proprietary license is unusual but legal — expect researcher confusion. Use a custom license file with a clear "All Rights Reserved" notice.
- Or: flip the repo private (Settings → General → Danger Zone → Change visibility) and let the executor brief's public→private transition kick in.

If MIT is fine: nothing to do.

---

## 10. Scorecard publication (optional, public-only)

`scorecard.yml` already runs weekly + on push to main. Results auto-publish to <https://scorecard.dev/viewer/?uri=github.com/hlebtkachenko/monorepo> for public repos — no token needed.

After the workflow runs once, add the Scorecard badge to `README.md`:

```markdown
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hlebtkachenko/monorepo/badge)](https://scorecard.dev/viewer/?uri=github.com/hlebtkachenko/monorepo)
```

When the repo flips private, Scorecard publishing requires `SCORECARD_TOKEN` (a fine-grained PAT) and `publish_results: true` then becomes paid-only. Drop the publish step from the workflow at that time.

---

## 11. Verify everything (after sections 1–9)

```sh
# Branch protection summary
gh api /repos/hlebtkachenko/monorepo/branches/main/protection --jq '{
  enforce_admins: .enforce_admins.enabled,
  required_status_checks: .required_status_checks.contexts,
  required_signatures: .required_signatures.enabled,
  required_linear_history: .required_linear_history.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled
}'

# Security features
gh api /repos/hlebtkachenko/monorepo --jq .security_and_analysis

# Environments
gh api /repos/hlebtkachenko/monorepo/environments --jq '.environments[].name'

# Workflow permissions
gh api /repos/hlebtkachenko/monorepo/actions/permissions/workflow

# Vars
gh variable list

# Signing self-test
git log --show-signature -1 main
```

Expected outcomes:
- `enforce_admins: true`
- `required_signatures.enabled: true` (after section 5)
- `required_linear_history: true`
- `allow_force_pushes: false`
- `secret_scanning_push_protection.status: "enabled"`
- `private_vulnerability_reporting.status: "enabled"`
- Environments `staging`, `production` exist
- `default_workflow_permissions: "read"`
- Latest commit on main shows `Good "git" signature for...`

If any of these are off, return to the section that owns it.

---

## 12. After AWS bootstraps

This checklist covers the GitHub side. The AWS side is in `docs/runbooks/AWS-BOOTSTRAP.md`.

Order: complete sections 1–11 here first → walk AWS-BOOTSTRAP → set `vars.AWS_BOOTSTRAPPED=true` → first deploy.

---

## Appendix: handy direct links

| Page | URL |
|---|---|
| Repo settings (top) | <https://github.com/hlebtkachenko/monorepo/settings> |
| Actions settings | <https://github.com/hlebtkachenko/monorepo/settings/actions> |
| Code security | <https://github.com/hlebtkachenko/monorepo/settings/security_analysis> |
| Branch protection | <https://github.com/hlebtkachenko/monorepo/settings/branches> |
| Tag protection | <https://github.com/hlebtkachenko/monorepo/settings/tag_protection> |
| Environments | <https://github.com/hlebtkachenko/monorepo/settings/environments> |
| Variables | <https://github.com/hlebtkachenko/monorepo/settings/variables/actions> |
| Secrets | <https://github.com/hlebtkachenko/monorepo/settings/secrets/actions> |
| SSH/Signing keys (your account) | <https://github.com/settings/keys> |
| Scorecard public viewer | <https://scorecard.dev/viewer/?uri=github.com/hlebtkachenko/monorepo> |
| GitHub Security tab (this repo) | <https://github.com/hlebtkachenko/monorepo/security> |
