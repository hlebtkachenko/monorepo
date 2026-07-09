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

Telemetry is disabled through `.mcp.json`.

## First setup

For the local base checkout, run this once after pulling a branch that contains the CodeGraph setup:

```bash
pnpm install --frozen-lockfile
pnpm codegraph:ready
```

For this repo, a full initial index is small enough to run locally: about 2k files and a few seconds on Hleb's Mac. The output database stays in `.codegraph/`.

For new Conductor workspaces, `.conductor/settings.toml` runs the same setup automatically:

```bash
pnpm install --frozen-lockfile && pnpm codegraph:ready
```

This only affects workspaces created after the settings file is merged to the default branch on the remote. Existing workspaces should run `pnpm codegraph:ready` once manually.

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

For MCP-enabled agents, use the CodeGraph MCP tool before grep/read loops for structural questions. The default MCP shape intentionally exposes `codegraph_explore` as the main tool; upstream recommends the single strong tool because it returns relevant source, call paths, and blast radius in one response.

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
