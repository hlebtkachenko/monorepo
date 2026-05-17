# docs/plans

**Planning and issue tracking live in Linear, not in this directory.**

Issues for this monorepo are tracked in Linear — team **Afframe** (key `AFF`). Agents
reach Linear through the `linear` MCP server (`mcp__linear__*` tools). Deferred ideas,
future work, and unclear-scope items go to the **Backlog / Product Discovery** project.

## For agents

- **Do not create new planning `.md` files here.** Create a Linear issue instead.
- The files still in this directory are legacy plans. Each one carries a banner at the
  top linking to the Linear issue that now tracks it. **When that issue is closed,
  delete the file.** The issue is the source of truth; the file is a frozen snapshot.
- Before starting work described by a file here, read its Linear issue first — the
  issue reflects current state, the file may be stale.

## Current files

| File | Tracked by | Action when issue closes |
|------|-----------|--------------------------|
| `AUTH-OUTSTANDING.md` | [AFF-29](https://linear.app/hapddev/issue/AFF-29) | delete file |
| `SCRIPTS-ENABLEMENT.md` | [AFF-30](https://linear.app/hapddev/issue/AFF-30) | delete file |
| `AI-FINANCIAL-AGENTS-PLAN.md` | [AFF-31](https://linear.app/hapddev/issue/AFF-31) | delete file |

## Archived

Superseded plans (`AWS-INTEGRATION-PLAN.md`, `CICD-PLAN.md`, `EXECUTOR-BRIEF.md`,
`INFRA-REBUILD-PLAN.md`) and the completed `code-review-overnight/` PR #89 review were
moved to `_junk/2026-05-17-docs-plans-archive/` (gitignored, kept locally) and remain
in git history. The deferred follow-ups from that review are tracked in
[AFF-32](https://linear.app/hapddev/issue/AFF-32).

Once the three remaining files are deleted, this directory and this README can go too.
