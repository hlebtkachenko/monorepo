# CodeGraph

CodeGraph is the repo-local code intelligence index for agents. It parses source files into a local SQLite graph, exposes that graph through MCP, and lets agents answer structural questions without rebuilding call paths through repeated grep/read loops.

## Where it lives

```text
git worktree
  source files
  .mcp.json
  .codegraph/
    codegraph.db
```

`.codegraph/` is local, ignored, and per worktree. Never commit it. The root checkout and every Conductor workspace have separate indexes, so branch-specific changes do not collide.

The MCP server is configured in `.mcp.json` and runs the repo-pinned binary:

```bash
pnpm exec codegraph serve --mcp
```

### MCP + index configuration (`.mcp.json` env)

| Env var                            | Value                        | Why                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CODEGRAPH_TELEMETRY`              | `0`                          | No anonymous usage reporting.                                                                                                                                                                                                           |
| `CODEGRAPH_MCP_TOOLS`              | `explore,node,search,status` | Exposes all four tools, not just `codegraph_explore`. Short names are the suffix after `codegraph_`; an unset value or a wrong name (the upstream `trace,context` example) silently drops `codegraph_explore`, so keep `explore` first. |
| `CODEGRAPH_PARSE_WORKERS`          | `8`                          | Parse-pool size. Default is core-scaled; pinned to 8 to bound peak memory on a 24 GB machine (peak ≈ workers × worker heap). Also set in `scripts/codegraph.mjs` so manual `init`/`sync` match.                                         |
| `CODEGRAPH_DAEMON_IDLE_TIMEOUT_MS` | `1800000`                    | Keeps the daemon warm 30 min after the last client so back-to-back agent runs skip startup (default is 300 s).                                                                                                                          |

The exposed tool surface is verifiable: an MCP `tools/list` against `serve --mcp` with a given `CODEGRAPH_MCP_TOOLS` returns exactly the allowlisted tools.

### Always-on for every agent

`.claude/settings.json` is **versioned** (un-ignored in `.gitignore`) and ships two things to every contributor and every fresh workspace:

- the `mcp__codegraph__*` permission (auto-approves the tools, no prompt), and
- a `UserPromptSubmit` hook `pnpm exec codegraph prompt-hook` that injects a `<codegraph_context>` block of matching symbols into every prompt.

Personal overrides go in the still-ignored `.claude/settings.local.json`. Do not duplicate the hook there (it would run twice). An existing local workspace that already has an untracked `.claude/settings.json` may need it removed once before pulling this in.

## First setup

For the local base checkout, run this once after pulling a branch that contains the CodeGraph setup:

```bash
pnpm install --frozen-lockfile
pnpm codegraph:ready
```

For this repo, a full initial index is small enough to run locally: about 2k files and a few seconds on Hleb's Mac. The output database stays in `.codegraph/`.

For new Conductor workspaces, `.conductor/settings.toml` runs the setup automatically, with the index build made best-effort so it can never fail workspace creation:

```bash
pnpm install --frozen-lockfile && { pnpm codegraph:ready || echo 'Warning: CodeGraph index unavailable; run pnpm codegraph:ready manually.' >&2; }
```

This only affects workspaces created after the settings file is merged to the default branch on the remote. Existing workspaces should run `pnpm codegraph:ready` once manually.

A `.conductor/settings.local.toml` `scripts.setup` value replaces the shared setup command on that machine. Local overrides must keep the `pnpm codegraph:ready` step or fresh workspaces will not receive an index.

The Conductor CodeGraph Run action is the on-demand refresh path. It changes directory to `CONDUCTOR_WORKSPACE_PATH` before running, ensuring the refresh still targets the workspace when Spotlight testing runs the project from the repository root. It then exits the Run shell with the real command status, returning the Run button to its idle state without requiring a manual Stop.

> A `setup script exited 1: bash: line 3: CONDUCTOR_ROOT_PATH: unbound variable` failure is **not** from this script — nothing in the repo references that variable. It comes from Conductor's own setup wrapper (`set -u`) when its env var is momentarily unset. Retry creating the workspace; if it persists, update Conductor. The warning branch above ensures CodeGraph is never the cause of a failed setup.

## Scripts

All wrapper commands run through `scripts/codegraph.mjs` with telemetry disabled:

| Command                 | Does                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm codegraph:ready`  | Ensure the index exists (build if missing), sync changed files, print status. Session default. |
| `pnpm codegraph:ensure` | Build the index only if `.codegraph/` is missing; no sync.                                     |
| `pnpm codegraph:sync`   | Ensure the index exists, then sync changes since the last index.                               |
| `pnpm codegraph:status` | Print index status; reports if no index exists yet (does not build one).                       |
| `pnpm codegraph:init`   | Rebuild the full index from scratch.                                                           |

## Agent Start Checklist

At the start of a coding session, run:

```bash
pnpm codegraph:ready
```

This creates the local index if this is a fresh worktree, syncs after fetch/rebase/branch changes, and prints status.

Normal editing does not require manual sync: `codegraph serve --mcp` watches files and incrementally updates changed source files. Manual sync is still cheap and explicit after git operations.

## How Agents Should Use It

Use CodeGraph first for:

- where a symbol, route, component, action, or endpoint is implemented
- how a flow reaches another layer
- what calls a function or what it calls
- impact analysis before changing shared code
- finding affected tests for changed files

For MCP-enabled agents, use the CodeGraph MCP tools before grep/read loops for structural questions. `codegraph_explore` is the primary tool — it returns relevant source, call paths, and blast radius in one response — and this repo also exposes `codegraph_node`, `codegraph_search`, and `codegraph_status` via `CODEGRAPH_MCP_TOOLS` (see the config table above) for targeted single-symbol reads and lookups.

For non-MCP contexts, use the CLI equivalents:

```bash
pnpm exec codegraph explore "how does onboarding create a workspace?"
pnpm exec codegraph query getBuildVersion --limit 5
pnpm exec codegraph impact materializeInvite
git diff --name-only origin/main...HEAD | pnpm exec codegraph affected --stdin --quiet
```

If CodeGraph reports stale files, read those specific files directly before editing. Do not re-derive the full flow with grep just to verify fresh CodeGraph output.

## Updating CodeGraph

CodeGraph is pinned as the root dev dependency `@colbymchenry/codegraph`. Dependabot covers updates through the root npm ecosystem entry.

After a version bump:

```bash
pnpm install --frozen-lockfile
pnpm exec codegraph --version
pnpm codegraph:ready
pnpm knip
```

Use `pnpm codegraph:init` or `pnpm exec codegraph index --force .` only when `.codegraph/` is missing, corrupted, or intentionally rebuilt from scratch.

## Not For KB Graph Yet

CodeGraph indexes code structure. Do not treat it as the Czech accounting KB dependency graph. For Markdown wikilinks, statutory references, and frontmatter dependencies, build the dedicated `mcp-acckb` graph described in the KB growth plan.
