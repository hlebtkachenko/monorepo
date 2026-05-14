# Executor Brief

> **SUPERSEDED** by ADR-0007 (MVP single-account CDK-only, 2026-05-11) and `docs/plans/INFRA-REBUILD-PLAN.md`. Historical reference only — the hybrid OpenTofu + CDK model this brief assumes is no longer current. Read ADR-0007 + ADR-0016 + INFRA-REBUILD-PLAN.md instead.

Read this **before** touching anything. You are executing the foundation plans for a financial SaaS monorepo: `CICD-PLAN.md` and `AWS-INTEGRATION-PLAN.md`. This brief tells you what those plans assume, what blocks autonomous execution, and where you must stop and ask.

## Read Order

1. `EXECUTOR-BRIEF.md` (this file) — context, prerequisites, gates
2. `AGENTS.md` — repo conventions
3. `CLAUDE.md` — symlink to AGENTS.md
4. `CICD-PLAN.md` — pipeline plan
5. `AWS-INTEGRATION-PLAN.md` — infrastructure plan

Do not start work until you have read all five.

## Reality Check

| Assumption | Actual State |
|------------|--------------|
| "There is an app to deploy" | There is **no app**. Repo is a UI scaffold (55 shadcn components, Next.js shell). No API, no DB schema, no domain logic. You are building from foundation. Do not try to deploy code that doesn't exist. |
| "There is a team" | **Solo developer** (Hleb Tkachenko). Controls requiring multiple humans (2 reviewers, on-call rotation, change advisory, separation of duties) cannot apply yet. Mark them **deferred until headcount**, not done. |
| "Repo is private" | Currently **public** at `github.com/hlebtkachenko/monorepo`. Some plan items (Shield Advanced, certain SCPs, customer data flows) assume private posture. Public→private transition must happen **before** any AWS account ID, role ARN, or sensitive config lands in `main`. |
| "Standard versions" | Bleeding edge: TypeScript 6.0, pnpm 11, Node 22, Next.js 16, Storybook 10. Some Actions / providers may lag. If blocked by a tool not yet supporting these, document the workaround in an ADR. |
| "Identity Center is set up" | Not yet. Identity Center built-in identity store will be enabled at bootstrap (no external IdP today; SAML federation deferred). |
| "Domain exists" | No domain registered yet. Pick + register before Route53 / ACM / CloudFront work. |
| "Legal entity exists" | Confirm with Hleb which entity (HAPD? new vehicle?) registers for DORA/NIS2/PCI. Solo founder ≠ regulated entity. |

## Hard Prerequisites You Cannot Generate

These must exist before the corresponding plan section is executable. **Stop and ask Hleb if any are missing.**

| Prerequisite | Blocks |
|-------------|--------|
| AWS root account + verified billing email + payment method | All of `AWS-INTEGRATION-PLAN.md` |
| GitHub plan tier upgrade (Team minimum) | Required reviewers, deployment branch policies, rulesets on private repos |
| Domain name registered + Route53 hosted zone | ACM certs, CloudFront, email DMARC, public endpoints |
| Czech legal entity confirmed | DORA/NIS2 registration, DPA signing |
| Payment processor (deferred until payments are in scope) | PCI scope minimization (keeps you at SAQ A) when payments are introduced |
| Resolved Open Decisions (see below) | First IaC commit, first observability vendor commit |

## Open Decisions (Resolve First, Before Any Code)

Both plans flag decisions where consensus does not exist. **Write an ADR in `docs/decisions/`, present recommendation, wait for Hleb approval.**

| Decision | Options | Recommended | Why it blocks |
|----------|---------|-------------|---------------|
| IaC platform layer | CDK / OpenTofu / hybrid | Hybrid (Tofu for accounts/VPC/IAM/data, CDK for app stacks) | First IaC commit |
| Observability vendor | Datadog / Honeycomb | Honeycomb (cheaper, trace-first; Datadog only if RUM+APM+logs all-in-one needed) | First service emits telemetry |
| Coverage policy | Flat % / risk-weighted | Risk-weighted (95% money paths, 70% UI shells) | First test coverage gate |
| Self-hosted runners | Yes / No | No (GitHub-hosted ARM is competitive at <50 engineers) | First CI workflow |
| Container runtime on Mac | Docker Desktop / OrbStack / Colima | Docker Desktop (per Hleb) | First devcontainer |
| Cred manager on Mac | Granted / aws-vault | Granted (better SSO ergonomics) | First Identity Center login |

## Approval Gates — Do NOT Cross Autonomously

You must stop and get explicit approval before each of these:

| Gate | Why |
|------|-----|
| Creating any AWS account | Real money, real legal entity, irreversible |
| Buying any domain | Money + lock-in |
| Signing any DPA / vendor agreement | Legal exposure |
| Enabling Shield Advanced | $3,000/mo + 1-year commit |
| Pushing first prod traffic | Compliance baseline must be verified first |
| Any new spend >$100/mo | Solo founder budget reality |
| Public→private repo transition | Affects external collaborators, CI minute economics |
| First production deploy | Manual approval gate by design |

## Solo Dev Adaptations

The plans assume an eventual team. Adapt as follows while solo:

| Plan item | Solo adaptation |
|-----------|----------------|
| 2 required reviewers on production | 1 reviewer (Hleb) — mark as **deferred until headcount** in PR template |
| On-call rotation | Hleb is on-call. AWS Incident Manager + SNS (email + ntfy.sh push). Paid pager deferred until headcount >= 2. |
| Change advisory board | Self-approval with mandatory ADR + cost estimate in PR |
| Separation of duties | Document break-glass procedure; everything else self-served |
| Quarterly access review | Self-review documented in `docs/audits/` |
| Quarterly DR drill | Single-person runbook executed quarterly |

Do not skip these — record them as deferred with the trigger condition (e.g. "activate when 2nd engineer hired").

## Artifacts You Must Produce as You Go

| Artifact | Location | Trigger |
|----------|----------|---------|
| ADR (Architecture Decision Record) | `docs/adr/NNNN-<slug>.md` | Every non-trivial choice |
| Runbook | `docs/runbooks/<service>.md` | Every AWS service stood up |
| Cost estimate | In ADR or PR description | Before spinning up any AWS service |
| INVENTORY.md | `docs/INVENTORY.md` | Every AWS account/service deployed (DORA ICT asset inventory requirement) |
| Updates to `AGENTS.md` | Root | When repo conventions change |
| Update to `CHANGELOG.md` | Per package via changesets | Every functional change |

## Operational Rules

1. **Never use long-lived AWS keys**, even temporarily. OIDC from step one. If a tool can't do OIDC, raise it as a blocker.
2. **Never commit secrets**, even as placeholders. Use `<TBD>` markers and document where the real value comes from.
3. **Always show cost estimate** before creating an AWS resource that costs money. Round up.
4. **Always show rollback plan** before any infra change.
5. **Always check the plan order**. The Foundation Order in `AWS-INTEGRATION-PLAN.md` (steps 1-18) has hard dependencies. Don't skip ahead.
6. **Conventional commits + signed commits** from day one.
7. **One concern per PR.** No mega-PRs.
8. **Verify before declaring done** — typecheck + tests + build + visual check (per `AGENTS.md`).
9. **Update memory** if you learn a new constraint Hleb will hit again. See user's auto-memory system.
10. **Match scope** — if the task is "add CI lint job", don't also rewrite the deploy workflow.

## When You Are Stuck

If a prerequisite is missing, an open decision unresolved, or you hit an approval gate:

1. **Stop immediately.** Do not improvise.
2. **State the blocker** in plain language: what plan item, what's missing, what you need.
3. **Propose options** if multiple paths exist.
4. **Wait for Hleb** to unblock.

Do not invent fake prerequisites (e.g. dummy AWS account IDs). Do not commit `<TODO>` placeholders that will rot.

## Out of Scope for Now

The plans deliberately exclude these — do not start them:

- Marketing site, landing pages
- Customer-facing app code (no app exists yet)
- Mobile apps
- Multi-region active-active (pilot-light only)
- Advanced ML / AI infra
- Anything not explicitly in the two plan files

If Hleb asks for something out of scope, confirm priority vs the foundation work, and update the plans before executing.

## Final Check Before You Start

- [ ] You have read this brief, both plan files, `AGENTS.md`, and `CLAUDE.md`
- [ ] You have a list of unresolved Open Decisions to bring to Hleb
- [ ] You have a list of missing Hard Prerequisites to bring to Hleb
- [ ] You understand this is a foundation build, not an app deploy
- [ ] You understand the solo-dev constraint
- [ ] You will produce ADRs + runbooks + cost estimates as you go
- [ ] You will not cross approval gates without explicit confirmation

If any checkbox is unchecked, stop. Read more. Ask.
