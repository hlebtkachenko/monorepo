# Agent structure surface

How AI agents (Claude Code first, plus any MCP client or script) discover the
Afframe org application **outside the GUI**. This is the programmatic mirror of
the sidebar shipped in v0.10.0: the module tree, the pages, and the layout
archetypes — reachable via the public API, the SDK, MCP, and the CLI.

It is **read-only, metadata-only**. It exposes the app's information
architecture, not tenant data and not page actions. See
[Beyond read-only](#beyond-read-only--operability-deferred) for the path to
operability once the accounting domain lands.

## The surface

Two public ops (no API key — the IA is tenant-agnostic, like `GET /v1/status`):

| Op               | Path                           | Returns                                                                                                                        |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `getStructure`   | `GET /v1/structure`            | The 10 rail modules → pages → subpages, each with `route`, `icon`, `tba` (build-status), and optional `archetype` / `purpose`. |
| `listArchetypes` | `GET /v1/structure/archetypes` | The 5 content-panel layout archetypes (`Table`, `Blank`, `Launchpad`, `Dashboard`, `Single`) with their slot contract.         |

Routes are org-relative (no org slug): prefix with `/{orgSlug}/` to build a URL.
`route: ""` is a module index. `archetype`/`purpose` are `null` where not yet
assigned (most pages are placeholders today).

### Reach it

- **MCP** — the auto-generated tools `getStructure` and `listArchetypes`
  (`apps/mcp/src/tools/generated/`). Read-only, no confirmation.
- **CLI** — `afframe structure` (tree; `--json` for machine output) and
  `afframe archetypes`. Both public — no `afframe login` required.
- **SDK** — `createAfframeClient().GET("/v1/structure")` /
  `.GET("/v1/structure/archetypes")` (`@afframe/sdk`).
- **HTTP** — `GET https://api.afframe.com/v1/structure`.

## How it stays honest

The module tree is **not** hand-written and **not** parsed from
`docs/specs/SITEMAP.md` prose. It is generated from the typed nav trees
(`apps/web/app/[orgSlug]/_nav` + each `<module>/nav.ts`) by
`scripts/gen-structure.ts` into a committed snapshot
(`apps/api/src/v1/structure/structure.data.ts`) the controller serves.

`apps/api` cannot import `apps/web` app-router source (wrong build boundary;
stripped by `output: "standalone"`), so the snapshot is the bridge — the same
build-time nav import `scripts/check-nav.ts` already relies on.

Drift guards:

- `pnpm gen:structure` regenerates the snapshot; it runs inside `pnpm gen:all`.
- A lefthook `structure-drift` hook (`pnpm check:structure`) fails a push if a
  `nav.ts` edit wasn't regenerated — mirrors `nav-drift` / `sitemap-drift`.
- `sdk-drift` / `mcp-coverage` / `openapi-lint` keep the SDK/MCP/spec in sync
  with the registered ops.

Per-page `archetype` / `purpose` come from the sparse `PAGE_ANNOTATIONS` map in
`packages/shared/src/api/structure.ts`; a key that isn't a real nav route fails
the drift check, so annotations can't go stale. Fill the map in as pages get a
real archetype — no schema change needed.

## Beyond read-only — operability (deferred)

Discovery is the whole of v1: an agent can learn what the app _is_, not act on
it. Operability (an agent creating an invoice, preparing a VAT close, posting a
journal entry) is **out of scope until the accounting domain lands** — you
cannot expose an agent operation without a real, RLS-scoped table behind it, and
that domain model is not on `main`. Tracked in the follow-up issue.

When the domain lands, add operate ops through the same contract-first seam
(`docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`), under these rules:

- **The trust loop is structural, not advisory.** No `file_*` / `submit_*` /
  `pay_*` / `approve_*` tool exists on the agent surface. Agents call `prepare_*`
  ops that write a proposal and run the deterministic checks; a **human**
  confirms and files. File / execute / approve are AI-denied — an API-key
  principal gets `403` on them regardless of scope.
- **`prepare` is a scope tier that caps autonomous agents below `write`**
  (`read < prepare < write < admin`). Autonomous agent keys are granted at most
  `prepare`; `write`/`admin` require an interactive human session.
- **Org auth is explicit and audited.** An agent must explicitly select
  ("log into") an org to act — never carry an org context over from a failed
  step. It may switch orgs within its workspace, but **every switch is
  audit-logged**. `organization_id` is never a request-body / tool input; the
  server injects it from the principal.
- **Never expose tenant ids in tool input** (`organization_id` / `user_id` /
  `workspace_id` / `role`) and never leak cross-tenant existence (`404`, not
  `403`, for unseen resources).

## Playwright is not the agent bridge

Playwright (`apps/web/playwright.config.ts`, `apps/web/e2e/`) targets
`localhost` + an ephemeral Postgres testcontainer only — it is CI test
infrastructure, never production. Agents must **not** drive `app.afframe.com`
through a browser: it is unauditable, bypasses RLS + scopes + the trust loop,
and has no sanctioned prod-target config. The supported agent path is this
API / SDK / MCP / CLI surface.
