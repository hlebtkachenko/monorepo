import { Doc } from "@/components/doc"

export const metadata = {
  title: "MCP",
  description:
    "@afframe/mcp — expose every endpoint as an MCP tool to LLM clients.",
}

export default function MCP() {
  return (
    <Doc
      title="MCP"
      intro="`@afframe/mcp` is a Model Context Protocol server. Every endpoint in the OpenAPI spec becomes a tool callable from Claude Desktop, Claude Code, Cursor, or any MCP-aware host."
    >
      <h2>Claude Desktop</h2>
      <p>
        Edit{" "}
        <code>
          ~/Library/Application Support/Claude/claude_desktop_config.json
        </code>
        :
      </p>
      <pre>
        <code>{`{
  "mcpServers": {
    "afframe": {
      "command": "npx",
      "args": ["-y", "@afframe/mcp"],
      "env": { "AFFRAME_API_KEY": "affk_live_..." }
    }
  }
}`}</code>
      </pre>
      <h2>Cursor / Claude Code</h2>
      <p>
        Same package, same env contract. Drop the equivalent block into the
        host's MCP config.
      </p>
      <h2>Tool annotations</h2>
      <p>
        Each generated tool ships a method-derived annotation (
        <code>readOnlyHint</code>, <code>idempotentHint</code>,
        <code>destructiveHint</code>). Curated overrides live in
        <code>apps/mcp/src/tools/_curate.ts</code> for operations where the verb
        alone doesn't capture the side-effect (e.g. a POST that sends an email
        is destructive, not just write).
      </p>
      <h2>Hosted</h2>
      <p>
        A Streamable-HTTP MCP server at <code>mcp.afframe.com</code> ships later
        — same tool table, no stdio bootstrap, OAuth instead of a long-lived API
        key.
      </p>
    </Doc>
  )
}
