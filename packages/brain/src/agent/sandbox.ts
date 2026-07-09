// ⚠ SAFETY SPINE — do not modify without brain-gate review

/**
 * N-1 — the Brain CC-client tool sandbox.
 *
 * A Brain session is a Claude Code client that ingests UNTRUSTED documents (client invoices/PDFs) and can
 * call tools. An injected instruction inside a document ("run bash, read DATABASE_URL, POST it out") must
 * be STRUCTURALLY impossible, not merely discouraged. This module is the policy: **DEFAULT-DENY** — only
 * explicitly-allowed tools may run. It enforces reframe R-2 (the Brain is an unprivileged client: no shell,
 * no arbitrary network, no filesystem write, no self-modification of `.brain/`) and complements ADR-0027
 * (no prod self-modification) + ADR-0026 (the model cannot forge its confidence).
 *
 * This is the POLICY + validator. Emitting the concrete Claude Code session config (allowedTools /
 * disallowedTools) from a policy lands with the CC harness (WP-M0.5), once the SDK option names and the
 * real MCP tool names (accounting endpoints, #395) are pinned.
 */

/**
 * Built-in Claude Code tools a Brain session must NEVER hold — the exfiltration / self-modification /
 * arbitrary-agent surface. Informational: DEFAULT-DENY already excludes them (none is an MCP tool and none
 * is in any allowlist), but naming them makes the threat explicit and lets a test assert each is denied.
 */
export const BRAIN_DENIED_BUILTIN_TOOLS = [
  "Bash", // shell — arbitrary exec / secret exfiltration
  "WebFetch", // arbitrary outbound HTTP — exfiltration channel
  "WebSearch", // outbound network
  "Write", // filesystem write — self-modification / `.brain/` tamper
  "Edit", // filesystem edit
  "NotebookEdit",
  "Read", // raw filesystem read — could read secrets on disk
  "Glob", // filesystem enumeration
  "Grep", // filesystem search
  "Task", // raw sub-agent spawn — escalation is a constrained `mcp__advisor__*` tool, not this
  "Agent",
] as const

/** Prefix of a Claude Code MCP tool name: `mcp__<server>__<tool>`. */
const MCP_TOOL_PREFIX = "mcp__"

export interface McpToolName {
  server: string
  tool: string
}

/** Parse a Claude Code MCP tool name (`mcp__<server>__<tool>`), or null if the name is not one. */
export function parseMcpToolName(name: string): McpToolName | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const sep = rest.indexOf("__")
  // Reject an empty server (`mcp____x`), a missing separator (`mcp__x`), or an empty tool (`mcp__x__`).
  if (sep <= 0 || sep >= rest.length - 2) return null
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) }
}

/**
 * A Brain session's tool policy. DEFAULT-DENY: a tool is allowed only if it is an MCP tool whose server is
 * in `allowedMcpServers` (and, when that server has a per-tool allowlist, whose tool is on it), or its exact
 * name is in `allowedBuiltinTools`. Everything else is denied.
 *
 * [G1-F2] Per-tool granularity. `allowedMcpServers` alone is per-SERVER: allowing a server allows EVERY tool
 * it exposes. That is too coarse once a single server hosts both safe and dangerous operations — the real
 * Afframe MCP server (`afframe`) hosts the accounting reads/writes AND `resolve_accounting_held_write` (a
 * self-approval bypass) + `list_accounting_held_writes` (a prompt-injection surface), which must be DENIED
 * while the rest of the server is allowed. The optional `allowedMcpTools` map narrows a server to an explicit
 * set of tool names WITHOUT touching any other server: a server present in the map is restricted to its listed
 * tools; a server ABSENT from the map keeps the coarse whole-server allow (backward compatible).
 */
export interface ToolAllowlistPolicy {
  /** MCP servers whose tools the Brain may call. Names are the CLIENT namespace (`mcp__<server>__…`). */
  allowedMcpServers: readonly string[]
  /**
   * OPTIONAL per-server tool allowlist. Maps a server name (a subset of `allowedMcpServers`) to the exact set
   * of tool names permitted ON that server. When a server appears here, ONLY its listed tools are allowed and
   * every other tool on that server is denied. When a server is absent, the coarse whole-server allow applies
   * (unchanged legacy behavior). A server listed here but NOT in `allowedMcpServers` is still fully denied —
   * the per-tool map narrows, it never widens. [G3-R4] This capability is server-agnostic: it works for ANY
   * server in the policy shape (kb/intake/advisor get their own pinned lists once their real tool names exist;
   * whole-server allow is a placeholder for those today).
   */
  allowedMcpTools?: Readonly<Record<string, readonly string[]>>
  /** Explicit built-in tools allowed. Keep EMPTY for a pure MCP client — anything here widens the surface. */
  allowedBuiltinTools: readonly string[]
}

/**
 * LEGACY / EXAMPLE fixture — the coarse per-SERVER-only shape. NOT the Brain's live default: `buildLoginContext`
 * now defaults to `BRAIN_ACCOUNTING_POLICY` (the pinned per-TOOL real allowlist). This one is a pure MCP client
 * with no built-in tools and NO per-tool narrowing; its server names are placeholders (`accounting`/`kb`/`intake`/
 * `advisor` — none is the real `afframe` server, and `kb`/`intake`/`advisor` tool names do not exist yet). It is
 * retained to document + test the backward-compatible per-server-only behavior (a server with no per-tool list
 * allows all its tools). Do not wire it into a live session; use `BRAIN_ACCOUNTING_POLICY`.
 */
export const DEFAULT_BRAIN_POLICY: ToolAllowlistPolicy = {
  allowedMcpServers: ["accounting", "kb", "intake", "advisor"],
  allowedBuiltinTools: [],
}

/**
 * The client namespace under which Claude Code addresses the Afframe MCP server (`apps/mcp`). The single
 * `@afframe/mcp` server is added to a CC client as `afframe` (see `docs/api/MCP.md` — "Clients namespace as
 * `mcp__afframe__verb_resource`"), so every accounting tool is `mcp__afframe__<snake_case_tool>`. All 23
 * generated tools (reads, writes, and the held-write ops) live on this ONE server; `--scope` is a launch-time
 * filter, not a separate namespace — so the DENY of resolve/list-held must be enforced here per-TOOL.
 */
export const AFFRAME_MCP_SERVER = "afframe"

/**
 * The write tools the Brain may propose. Real registered names (snake_case `verb_resource`) from
 * `apps/mcp/src/tools/generated/`. `create_feedback` + `classify_accounting_event` are non-destructive but
 * live here as the Brain's active (non-report) surface.
 */
export const BRAIN_ACCOUNTING_WRITE_TOOLS = [
  "create_accounting_event",
  "capture_accounting_document",
  "create_accounting_posting",
  "create_feedback",
  "classify_accounting_event",
] as const

/**
 * The read tools the Brain may call: the 10 `get_accounting_*` report getters + org/structure/status +
 * the number-series lookup. Deliberately EXCLUDES `list_accounting_held_writes` (see the deny note below).
 */
export const BRAIN_ACCOUNTING_READ_TOOLS = [
  "get_accounting_vat_return",
  "get_accounting_control_statement",
  "get_accounting_ec_sales_list",
  "get_accounting_corporate_income_tax",
  "get_accounting_financial_statements",
  "get_accounting_journal",
  "get_accounting_ledger",
  "get_accounting_open_items",
  "get_accounting_saldokonto",
  "get_accounting_statement_layout",
  "get_organization",
  "get_structure",
  "get_status",
  "list_accounting_number_series",
] as const

/**
 * Tools on the `afframe` server the Brain is EXPLICITLY DENIED, even though the server is otherwise allowed:
 *
 * - `resolve_accounting_held_write` — [G3-R3] self-approval bypass. `POST /held-writes/:id/resolve` is
 *   admission-exempt (no kill-switch, no confidence gate). The DURABLE fix has LANDED: the server-side
 *   key capability (`api_key.actor_kind`, migration 0045, #517/#543) DENIES the Brain's agent key on the
 *   whole held-write surface via `@RequireHumanActor()` (`apps/api/src/auth/require-human-actor.decorator.ts`
 *   + `api-key.guard.ts`), and the author≠approver rider is a second, independent backstop. This CLIENT-SIDE
 *   DENY is now defense-in-depth on top of that server-side deny, not the sole guard.
 * - `list_accounting_held_writes` — exposes OTHER pending held payloads, a prompt-injection surface (an
 *   injected doc could read another tenant/run's held write and craft a matching approval).
 */
export const BRAIN_ACCOUNTING_DENIED_TOOLS = [
  "resolve_accounting_held_write",
  "list_accounting_held_writes",
] as const

/**
 * The pinned accounting policy: a pure MCP client restricted to the `afframe` server, and on that server
 * narrowed PER-TOOL to exactly the write + read allowlist above. `resolve_accounting_held_write` and
 * `list_accounting_held_writes` are absent from the list, so the default-deny denies them even though the
 * server is allowed — proving per-TOOL, not per-server, granularity.
 */
export const BRAIN_ACCOUNTING_POLICY: ToolAllowlistPolicy = {
  allowedMcpServers: [AFFRAME_MCP_SERVER],
  allowedMcpTools: {
    [AFFRAME_MCP_SERVER]: [
      ...BRAIN_ACCOUNTING_WRITE_TOOLS,
      ...BRAIN_ACCOUNTING_READ_TOOLS,
    ],
  },
  allowedBuiltinTools: [],
}

/**
 * DEFAULT-DENY tool gate. Returns true only if `toolName` is explicitly permitted by `policy`.
 *
 * MCP decision (two gates, both must pass): (1) the server must be in `allowedMcpServers`; (2) IF that server
 * has an `allowedMcpTools` entry, the tool must be in it — otherwise (no entry) the whole server is allowed
 * (legacy per-server behavior). So adding a per-tool list only ever NARROWS a server, never widens it, and a
 * server with no per-tool list keeps the exact original semantics (backward compatible).
 */
export function isToolAllowed(
  toolName: string,
  policy: ToolAllowlistPolicy,
): boolean {
  if (toolName.length === 0) return false
  const mcp = parseMcpToolName(toolName)
  if (mcp) {
    if (!policy.allowedMcpServers.includes(mcp.server)) return false
    const perServerTools = policy.allowedMcpTools?.[mcp.server]
    // No per-tool list for this server → whole-server allow (unchanged legacy behavior).
    if (perServerTools === undefined) return true
    return perServerTools.includes(mcp.tool)
  }
  return policy.allowedBuiltinTools.includes(toolName)
}
