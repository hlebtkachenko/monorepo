# `@afframe/mcp` — MCP Server Design

> **[Wip — implemented in-repo, not published.]** `apps/mcp` ships a working stdio MCP server with codegen-generated tools for the GET operations (`ping`, `getOrganization`, `getStatus`) and POST operations (`createFeedback` — request bodies become Zod `inputSchema`s; AFF-236). There is no npm publish pipeline and no Streamable-HTTP transport. Sections beyond the shipped stdio surface remain design intent ([`ADR-0023`](../adr/0023-public-api-developer-platform.md)).

Design + usage reference for the official Model Context Protocol server exposing `api.afframe.com/v1` to LLM clients (Claude Desktop, Claude Code, Cursor, ChatGPT desktop, ...).

---

## 1. Decisions

| Question               | Answer                                                                                      | Why                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool surface           | Curated, grouped (not 1:1 endpoint mapping)                                                 | Empirical: Cursor caps at 40 tools, GitHub MCP burns ~42k tokens on definitions. Curated wins for LLM tool selection.                                                 |
| Schema source          | Auto-generate from OpenAPI 3.1, hand-curate, commit as source (don't regenerate at runtime) | In-house TypeScript codegen at `apps/mcp/scripts/gen-tools.ts` (see ADR-0024 §4). `cnoe-io/openapi-mcp-codegen` rejected — Python-only. Repair pass gets ~94% usable. |
| Distribution — local   | `npx -y @afframe/mcp@latest` (env-var bearer token)                                         | Most common pattern in `claude_desktop_config.json`                                                                                                                   |
| Distribution — desktop | Claude Desktop Extensions (`.dxt`)                                                          | One-click install, OS-keychain secrets, bundled Node runtime                                                                                                          |
| Distribution — hosted  | `mcp.afframe.com` (Streamable HTTP + OAuth)                                                 | Zero install, OAuth = no key handling. The Stripe/Linear/Cloudflare pattern.                                                                                          |
| Transport (remote)     | Streamable HTTP only                                                                        | SSE deprecated in MCP spec 2025-03-26, fully removed 2026-03-26                                                                                                       |
| Repo location          | `apps/mcp`                                                                                  | Shares `@workspace/shared` types with `apps/api` and `apps/cli`                                                                                                       |
| Auth (local)           | `AFFRAME_API_KEY` env var → `Authorization: Bearer ...`                                     | Standard; never accept a per-tool token argument                                                                                                                      |
| Auth (hosted)          | OAuth 2.1 device flow against `app.afframe.com`                                             | Per the 2025-06-18 MCP authorization spec                                                                                                                             |
| Naming                 | `verb_resource` snake_case (`create_invoice`, `list_invoices`)                              | Convention in Stripe / Linear / GitHub. Clients namespace as `mcp__afframe__verb_resource`.                                                                           |
| Scope split            | Three pre-bundled flavours: `read`, `write`, `destructive`                                  | Linear's scope model; accountancy clients won't grant write on day one                                                                                                |
| Discovery              | Publish `/.well-known/mcp` + list in registry.modelcontextprotocol.io                       | Lets registries crawl capability without connecting                                                                                                                   |

---

## 2. Tool surface

### Bundling strategy

Don't expose every REST operation as a tool. Bundle by intent:

```
manage_invoice(action: "create" | "finalize" | "void" | "send", ...)
get_invoice(id: string)
list_invoices(filters: {...})
search_invoices(query: string)
manage_journal(action: "create" | "post" | "reverse", ...)
get_journal(id: string)
list_accounts()
fx_rate(from: string, to: string, date: ISODate)
```

Roughly 20-30 tools at GA. Stripe ships ~30, Linear ~25, Sentry ~20 — pattern from research.

### Tool definition shape (per tool)

- `name`: `verb_resource` snake_case.
- `description`: 1-3 sentences. Includes the underlying REST operation. LLMs select better with named intents than with vague descriptions.
- `inputSchema`: JSON Schema generated from the Zod schemas in `@workspace/shared/api` (the same source the OpenAPI spec uses).
- `annotations`: `{ readOnlyHint, destructiveHint, idempotentHint }` — guides Claude/Cursor's "this might do something" confirmation prompts.

### Read / write / destructive split

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "afframe-read": {
      "command": "npx",
      "args": ["-y", "@afframe/mcp@latest", "--scope=read"],
      "env": { "AFFRAME_API_KEY": "affk_live_..." }
    }
  }
}
```

- `--scope=read` (default) — only tools annotated `readOnlyHint: true`.
- `--scope=write` — read + non-destructive mutating tools.
- `--scope=destructive` — everything. Confirmation required.
- The server REJECTS the scope flag at startup if the underlying key lacks the corresponding REST scopes (`invoices:write`, etc.).

---

## 3. Auth flow

### Local (npx)

```text
$ AFFRAME_API_KEY=affk_live_… npx -y @afframe/mcp
```

- `AFFRAME_API_KEY` is mandatory. Fail-fast with a friendly error otherwise.
- `AFFRAME_API_BASE` optional (default `https://api.afframe.com`). Useful for staging.
- The key is read once at startup and held in memory. Never logged. Never echoed.

### DXT

```text
afframe.dxt
├─ manifest.json
├─ server.js           (bundled, single file)
├─ icon.png
└─ runtime/            (Node 22, bundled per platform)
```

- `manifest.json` declares `user_config: { api_key: { type: "secret", description: "...", required: true } }`.
- Claude Desktop stores the value in macOS Keychain / Windows Credential Manager.
- Install path: double-click the `.dxt`.

### Hosted (`mcp.afframe.com`)

```
$ claude mcp add --transport http afframe https://mcp.afframe.com/mcp
# browser opens app.afframe.com/oauth/authorize?...
# user clicks "Allow", a scoped, short-lived OAuth token is issued
# Claude stores the refresh token; tool calls forward the access token
```

- OAuth 2.1 device-flow per the [2025-06-18 MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).
- The hosted server runs on Cloudflare Workers (`createMcpHandler()`, stateless) — Streamable HTTP, no Durable Object state.

---

## 4. Code shape

```ts
// apps/mcp/src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Client } from "./client"
import { tools } from "./tools"

const server = new McpServer({
  name: "@afframe/mcp",
  version: pkg.version,
})

const client = Client.fromEnv() // reads AFFRAME_API_KEY + AFFRAME_API_BASE

for (const tool of tools(client)) {
  server.tool(tool.name, tool.description, tool.inputSchema, tool.handler, {
    annotations: tool.annotations,
  })
}

await server.start({ transport: process.stdout })
```

```ts
// apps/mcp/src/tools/invoices.ts
import { CreateInvoiceSchema } from "@workspace/shared/api"

export const createInvoice = (client: Client) => ({
  name: "create_invoice",
  description: "Create a draft invoice. Wraps POST /v1/invoices.",
  inputSchema: CreateInvoiceSchema, // zod schema, exported as JSON Schema
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  handler: async (args) =>
    client.post("/v1/invoices", args, { idempotency: true }),
})
```

Each tool is one file under `apps/mcp/src/tools/`. Filename matches `name`. Trivial to grep and to lint.

---

## 5. Patterns to copy

1. **Stripe's dual-transport / dual-auth**: `mcp.afframe.com` (OAuth, human users) + `npx @afframe/mcp` (bearer, CI / power users). Same tool surface, two distribution paths.
2. **Linear's scope-restricted keys + scope-flavoured MCP installs**: read-only by default; opt-in to write; opt-in twice to destructive. Critical signal for accounting data — partners will not grant write to an AI agent on day one.

---

## 6. Patterns to avoid

- A single generic `call_api(method, path, body)` tool. LLMs do not select it well.
- Per-tool token arguments. The token belongs in env / config, never in the call payload (it leaks into prompts and traces).
- Regenerating tool definitions at runtime. Generate once, edit, commit.
- Long tool names (`afframe_invoices_create_v1`). The client namespaces; you don't need to.

---

## 7. 2026-relevant ecosystem facts

| Fact                                                      | Implication                                       |
| --------------------------------------------------------- | ------------------------------------------------- |
| Streamable HTTP only (SSE removed) in MCP spec 2026-03-26 | Hosted server uses streamable HTTP from day one   |
| DXT is the default Claude Desktop install path            | Ship `.dxt` alongside npm                         |
| `.well-known/mcp` discovery on roadmap                    | Plan to expose it                                 |
| Official MCP Registry at registry.modelcontextprotocol.io | Publish once GA                                   |
| Cursor caps at 40 tools                                   | Stay well under (~25 is the target)               |
| Elicitation primitive stable                              | Use for confirmation prompts on destructive tools |

---

## 8. Roadmap

| Milestone | Scope                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| 0.1       | `npx @afframe/mcp` with 5 read tools against the foundation (`whoami`, `get_organization`, `ping`). Internal use. |
| 0.5       | All AFF-71 domain tools (read + write split). Published to npm.                                                   |
| 0.9       | `mcp.afframe.com` hosted Streamable HTTP + OAuth. DXT bundle.                                                     |
| 1.0       | Listed in registry.modelcontextprotocol.io. Documented in `/docs/mcp`.                                            |

---

## 9. References

- [MCP specification 2026-03-26](https://modelcontextprotocol.io/specification/)
- [MCP authorization spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Stripe MCP docs](https://docs.stripe.com/mcp)
- [Linear MCP docs](https://linear.app/docs/mcp)
- [Cloudflare Remote MCP guide](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- [Speakeasy: OpenAPI → MCP tool design](https://www.speakeasy.com/mcp/tool-design/generate-mcp-tools-from-openapi)
- [Claude Desktop Extensions (DXT)](https://www.desktopextensions.com/)
- [`ADR-0023`](../adr/0023-public-api-developer-platform.md), [`SDK.md`](./SDK.md), [`CLI.md`](./CLI.md)
