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
 * in `allowedMcpServers`, or its exact name is in `allowedBuiltinTools`. Everything else is denied.
 */
export interface ToolAllowlistPolicy {
  /** MCP servers whose tools the Brain may call. Names are pinned in WP-M0.5 (accounting = #395). */
  allowedMcpServers: readonly string[]
  /** Explicit built-in tools allowed. Keep EMPTY for a pure MCP client — anything here widens the surface. */
  allowedBuiltinTools: readonly string[]
}

/**
 * The default Brain policy: a pure MCP client with no built-in tools. Server names are placeholders pending
 * the real accounting MCP server + endpoint names (#395), the KB/intake servers, and the constrained
 * advisor-escalation server (all pinned in WP-M0.5).
 */
export const DEFAULT_BRAIN_POLICY: ToolAllowlistPolicy = {
  allowedMcpServers: ["accounting", "kb", "intake", "advisor"],
  allowedBuiltinTools: [],
}

/** DEFAULT-DENY tool gate. Returns true only if `toolName` is explicitly permitted by `policy`. */
export function isToolAllowed(
  toolName: string,
  policy: ToolAllowlistPolicy,
): boolean {
  if (toolName.length === 0) return false
  const mcp = parseMcpToolName(toolName)
  if (mcp) return policy.allowedMcpServers.includes(mcp.server)
  return policy.allowedBuiltinTools.includes(toolName)
}
