# Doc Sync & Drift Runbook

Two jobs:

- **Part A — every agent, before you push:** map your code change to the docs it forces you to update, so docs never silently rot.
- **Part B — cleanup/sweep agents:** do _delta_, not a full re-research. The method, the source-of-truth map, the known traps, and the last-sweep state are captured here.

For the forward "I'm adding a new package / app / host / env var / ADR" path, use [`ADDING-X-TO-MONOREPO.md`](ADDING-X-TO-MONOREPO.md). This runbook covers _change/remove/status_ drift, which that one doesn't.

---

## Part A — Pre-push doc-sync matrix

Run `git diff --name-only origin/main...HEAD`, then for each change check the docs below. CI/lefthook enforces the rows marked **(gated)**; the rest are on you.

| You changed…                                                           | Check / update                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/remove an `apps/*` or `packages/*`                                 | `ARCHITECTURE.md` (Monorepo Layout), `README.md` (Project Structure); add to `AGENTS.md` only if it's a subsystem with its own rules (e.g. the bot).                                                  |
| A CDK stack/resource, or an asset went live/retired                    | `docs/INVENTORY.md` (DORA register — Status + Owner), `ARCHITECTURE.md` if topology changed.                                                                                                          |
| Prod/staging **deploy status**                                         | `ARCHITECTURE.md` (Deployment Targets), `docs/INVENTORY.md`, runbooks `DEPLOY.md` / `AWS-DEPLOY.md` / `PROMOTE-TO-PRODUCTION.md`. If it flips an ADR's stated status, **amend** that ADR (see below). |
| A public host or outbound email address                                | `docs/DOMAINS-AND-EMAIL.md` + `docs/INVENTORY.md`.                                                                                                                                                    |
| An env var                                                             | `docs/env-vars.md` + `turbo.json` `globalEnv`.                                                                                                                                                        |
| A UI component/block                                                   | `packages/ui/src/lib/registry.ts` **(gated by lefthook)** + stories + test (Story Coverage Rules); bump the component count in `ARCHITECTURE.md`/`README.md` if you cite it.                          |
| A public API endpoint                                                  | The 7 steps in `ENDPOINT-ADDITION-RUNBOOK.md` + `pnpm gen:all` **(gated by the `endpoint-checklist` hook)**.                                                                                          |
| A workflow's required↔advisory status, or `.github/rulesets/main.json` | `docs/conventions/CI-POLICY.md`.                                                                                                                                                                      |
| An architectural decision / reversal                                   | New ADR, or **amend** an existing one — never rewrite an ADR body or `Status:` line; append `> **Amendment <date>:** …`.                                                                              |
| The secrets model                                                      | `docs/runbooks/SECRETS*.md`, `docs/runbooks/VAULT-OPS.md`, `docs/compliance/SECRETS-CONTROLS.md`, `docs/INVENTORY.md` (`SECRETS-PRD`).                                                                |
| A number docs cite (component/lane/container count)                    | grep the docs for the old number; counts rot silently.                                                                                                                                                |

Two more pre-push checks that have bitten us:

- **Conventional-commit / PR-title scope must be in the allowlist** (source: `scripts/check-pr-title.mjs`): `admin, ai, api, auth, bundle, ci, cli, config, db, deps, deps-dev, docs, email, github, governance, i18n, infra, mcp, observability, pdf, release, sdk, secrets, shared, storage, tests, turbo, ui, web, workers`. There is **no `e2e` scope** — use `ci:`. The pre-push `pr-title` hook rejects unknown scopes and non-conventional merge-commit subjects (reword merges to `chore: merge …`).
- Touched the API surface? Run `pnpm gen:all` and commit the regen before pushing.

---

## Part B — Drift-sweep playbook

### Method (cheap → deep)

1. **Structural diff** — `ls apps/ packages/ infra/` vs the inventory blocks in `ARCHITECTURE.md` / `README.md`. Highest signal, one command.
2. **Commit-since-doc scan** — `git log <last-doc-commit>..HEAD` filtered to `feat(infra|api|ui)` + new ADRs.
3. **Status-claim recheck** — grep docs for rot-words: `Planned`, `not yet`, `TBD`, `prepared`, and hard numbers.
4. **ADR cross-check** — new `docs/adr/*` not referenced.

**Verify every finding against source before reporting** — most headline "drift" is a misread (e.g. an ALB mention that's correctly a _fallback_, a plan doc that's legitimately aspirational).

### Source-of-truth map (read these, don't trust prose)

| Question                       | SoT                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| What apps/packages/infra exist | `ls apps/ packages/ infra/`                                                                                   |
| What AWS assets are deployed   | `infra/cdk/lib/*.ts` + `infra/cdk/bin/app.ts` (**single account**)                                            |
| Front door                     | Cloudflare Tunnel (`cloudflared` sidecar) — **not** ALB                                                       |
| Required CI checks             | `.github/rulesets/main.json` (not classic branch protection)                                                  |
| Hosts + email                  | `docs/DOMAINS-AND-EMAIL.md`                                                                                   |
| UI component count             | count `sourceType:` lines in `registry.ts` — keys are **mixed quoted + bare**, so a `"key":` grep undercounts |
| Allowed commit scopes          | `scripts/check-pr-title.mjs`                                                                                  |

### Known traps (non-obvious; don't re-derive)

- **Single AWS account** (ADR-0007). No multi-account org, ALB, WAFv2, Transit Gateway, or AWS Identity Center — those rows were stale fiction, now removed from INVENTORY.
- **SES production access was DENIED** → Resend is the permanent transactional provider; both envs send from `no-reply@afframe.com`.
- **Secrets = Vault (Hostinger VPS) → SSM SecureString → ECS**, not Infisical. IdP is email OTP (Google Workspace scoped, not wired). No 1Password anywhere.
- **Linear team `AFF` is FROZEN** → file new work in `DEV`/`PRO`/`SAL`/`OPS` via `mcp__claude_ai_Linear__*`.
- **ADRs are amendment-only.** Append a dated amendment; never rewrite the decision or `Status:` line.
- **testcontainers pull `postgres:18-alpine` from Docker Hub** → intermittent 500/timeout. `e2e.yml` guards with a pre-pull+retry and `TESTCONTAINERS_RYUK_DISABLED`. The same guard is **not** yet on the db-integration jobs (deferred until one flakes).

### Last sweep + outstanding

- **Last full sweep:** 2026-06-07 (PR #341) — root docs, ADRs, API docs, CI-POLICY, runbooks, secrets, INVENTORY.
- **Outstanding (pick these up, don't re-research):**
  - **DEV-68** — activate OpenStatus prod monitors (`infra/openstatus/openstatus.yaml` `active:false→true`). A _code_ change on the OVH VPS, not docs.
  - INVENTORY: cloud-account model collapsed to one real account; a few non-prod-ECS rows kept conservative.
  - Extend the Docker-Hub pre-pull guard to db-integration testcontainer jobs if they start flaking.

> When you finish a sweep, update **Last sweep + outstanding** above. If any "Known trap" is now false, the SoT file wins — fix the trap line.
