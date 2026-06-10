# START HERE

Canonical entry point for fresh sessions and new contributors. Read this
file first; every link below leads to a single source of truth.

## What this repo is

Self-hosted accounting platform for Czech regulated workflows. Stripe-shape
REST API, Plaid-shape error envelope, IETF RateLimit headers, first-class
TypeScript SDK / CLI / MCP. The Scalar API Reference at
`api.afframe.com/` is the public developer surface; there is no separate
docs site (see [ADR-0024](adr/0024-developer-platform-codegen-pipeline.md)
Amendment 2026-05-21).

- Production: `app.afframe.com`, `api.afframe.com`, `admin.afframe.com`
- Staging mirrors at `*-staging.afframe.com`
- Status: `status.afframe.com` (OVH VPS, not AWS)

## Public API surface (apps/api)

Single NestJS process on `:3001` serves these routes — full reference
in [`docs/api/README.md`](api/README.md) and [`docs/api/API-REFERENCE.md`](api/API-REFERENCE.md):

| Route              | Auth    | Purpose                                                            |
| ------------------ | ------- | ------------------------------------------------------------------ |
| `/`                | None    | Scalar API Reference — interactive developer docs                  |
| `/v1/openapi.json` | None    | Canonical OpenAPI 3.1 spec                                         |
| `/v1/docs`         | None    | 301 redirect to `/` (legacy bookmark)                              |
| `/editor`          | None    | 302 redirect to `editor.scalar.com` pre-filled with the env's spec |
| `/void/*`          | None    | Mock-server echo (no credentials echoed back) for SDK / CLI tests  |
| `/api/health`      | None    | Container health probe (ECS + Cloudflare)                          |
| `/v1/ping`         | API key | Connectivity smoke; returns the resolved principal                 |
| `/v1/organization` | API key | Authenticated principal's organization summary                     |
| `/v1/status`       | None    | Service health summary (proxies status.afframe.com)                |
| `/v1/feedback`     | None    | Partner feedback ingestion (POST)                                  |

Domain endpoints (invoices, accounts, journal entries) are not yet implemented.

## Read these, in order

1. **[AGENTS.md](../AGENTS.md)** — repo rules for AI agents. Architecture
   summary, component pattern, import rules, dependency-update coverage,
   testing matrix, **Endpoint Addition Rules** (six-step checklist).
2. **[CONTRIBUTING.md](../CONTRIBUTING.md)** — human-contributor onboarding,
   commit conventions, branching.
3. **[docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md](runbooks/ENDPOINT-ADDITION-RUNBOOK.md)**
   — the six-step endpoint procedure with full diffs.
4. **[docs/conventions/ENDPOINT-ADDITION.md](conventions/ENDPOINT-ADDITION.md)**
   — naming, auth scopes, tenancy, error variants, breaking-change
   triggers. The "what makes a good endpoint" reference.
5. **[docs/runbooks/ADDING-X-TO-MONOREPO.md](runbooks/ADDING-X-TO-MONOREPO.md)**
   — how to add a new package / app / runbook / ADR / workflow.

## When you need to …

| Task                       | Read                                           |
| -------------------------- | ---------------------------------------------- |
| Add an API endpoint        | `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`   |
| Add a package or app       | `docs/runbooks/ADDING-X-TO-MONOREPO.md`        |
| Write a commit message     | `docs/conventions/COMMITS.md`                  |
| Configure CI               | `docs/conventions/CI-POLICY.md`                |
| Deploy to AWS              | `docs/runbooks/AWS-DEPLOY.md`                  |
| Roll back                  | `docs/runbooks/ROLLBACK.md`                    |
| Respond to an incident     | `docs/runbooks/INCIDENT.md`                    |
| Rotate a secret            | `docs/runbooks/SECRETS-ROTATION.md`            |
| Tune costs                 | `docs/runbooks/COST-INCIDENT-RESPONSE.md`      |
| Audit local dev            | `docs/runbooks/LOCAL-DEV.md`                   |
| Build a Storybook story    | `docs/runbooks/SHOWCASE-RUNBOOK.md`            |
| Add a non-shadcn component | `docs/runbooks/COMPONENT-MIGRATION-RUNBOOK.md` |

## Decisions backing this layout

- [docs/adr/](adr/) — architectural decision records (MADR format).
  Start with **ADR-0007** (AWS layout), **ADR-0008** (Cloudflare Tunnel),
  **ADR-0023** (Plaid error envelope), and **ADR-0024** (developer
  platform codegen pipeline).
- [docs/plans/](plans/) — strategic execution plans (the multi-phase
  ones that touch every layer).

## Skills

`.claude/skills/add-endpoint/SKILL.md` walks you through the
endpoint-addition six-step. Invoke with `/add-endpoint <resource>` in
Claude Code. Refuses hand-edits of `generated/` directories.
