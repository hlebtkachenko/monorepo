# `@afframe/mcp`

Official MCP (Model Context Protocol) server for the Afframe public API.

> **Status**: `0.0.1` — internal/preview. The npm + DXT + hosted `mcp.afframe.com` shape ships per [`docs/api/MCP.md`](../../docs/api/MCP.md).

Lets LLM clients (Claude Desktop, Claude Code, Cursor, ChatGPT Desktop, …) call `api.afframe.com/v1` directly as MCP tools.

## Install (Claude Desktop)

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
{
  "mcpServers": {
    "afframe": {
      "command": "npx",
      "args": ["-y", "@afframe/mcp@latest"],
      "env": {
        "AFFRAME_API_KEY": "affk_live_..."
      }
    }
  }
}
```

Override the base URL for staging or local dev:

```json
"env": {
  "AFFRAME_API_KEY": "affk_live_...",
  "AFFRAME_API_BASE": "http://127.0.0.1:3001"
}
```

## Tools

| Tool               | Wraps                  | Annotations           |
| ------------------ | ---------------------- | --------------------- |
| `ping`             | `GET /v1/ping`         | read-only, idempotent |
| `get_organization` | `GET /v1/organization` | read-only, idempotent |

Domain tools (`list_invoices`, `create_invoice`, …) land with the matching `/v1` endpoints. The tool surface stays curated, not 1:1 endpoint mapping (Cursor caps at 40 tools — see [`docs/api/MCP.md`](../../docs/api/MCP.md) §1).

## Transport

STDIO. Streamable HTTP (the hosted `mcp.afframe.com`) is documented in `docs/api/MCP.md` §3 — separate deployment, same tool registry.

## Errors

Every tool error returns `isError: true` with the Plaid envelope quoted verbatim — LLMs (and end users) see `code`, `status`, and `request_id`. `documentation_url` is appended when present (the api does not emit it today; reserved field). Rate-limit errors include `retry_after`.

## Dev

```bash
pnpm --filter @afframe/mcp dev
# stdio loop — connect a client (e.g., `npx @modelcontextprotocol/inspector`)
```

```bash
pnpm --filter @afframe/mcp build
node apps/mcp/dist/server.js   # same shape as the npx install
```

Full design + roadmap: [`docs/api/MCP.md`](../../docs/api/MCP.md).
