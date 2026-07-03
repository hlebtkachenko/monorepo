import { describe, expect, it } from "vitest"
import {
  BRAIN_DENIED_BUILTIN_TOOLS,
  DEFAULT_BRAIN_POLICY,
  isToolAllowed,
  parseMcpToolName,
  type ToolAllowlistPolicy,
} from "./sandbox"

describe("parseMcpToolName", () => {
  it("parses a well-formed mcp tool name", () => {
    expect(parseMcpToolName("mcp__accounting__post")).toEqual({
      server: "accounting",
      tool: "post",
    })
  })

  it("parses a tool name whose tool part contains further separators", () => {
    expect(parseMcpToolName("mcp__accounting__create__event")).toEqual({
      server: "accounting",
      tool: "create__event",
    })
  })

  it("returns null for a non-mcp name", () => {
    expect(parseMcpToolName("Bash")).toBeNull()
    expect(parseMcpToolName("")).toBeNull()
  })

  it("rejects malformed mcp names (empty server or empty tool)", () => {
    expect(parseMcpToolName("mcp__")).toBeNull()
    expect(parseMcpToolName("mcp__accounting")).toBeNull() // no separator → no tool
    expect(parseMcpToolName("mcp__accounting__")).toBeNull() // empty tool
    expect(parseMcpToolName("mcp____post")).toBeNull() // empty server
  })
})

describe("isToolAllowed — default-deny under the default Brain policy", () => {
  it("denies every dangerous built-in tool", () => {
    for (const tool of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(isToolAllowed(tool, DEFAULT_BRAIN_POLICY)).toBe(false)
    }
  })

  it("denies the empty string", () => {
    expect(isToolAllowed("", DEFAULT_BRAIN_POLICY)).toBe(false)
  })

  it("denies an MCP tool from a server not on the allowlist (the injection escape)", () => {
    expect(
      isToolAllowed("mcp__evil__steal_secrets", DEFAULT_BRAIN_POLICY),
    ).toBe(false)
    expect(isToolAllowed("mcp__filesystem__read", DEFAULT_BRAIN_POLICY)).toBe(
      false,
    )
  })

  it("allows MCP tools from the permitted servers", () => {
    expect(isToolAllowed("mcp__accounting__post", DEFAULT_BRAIN_POLICY)).toBe(
      true,
    )
    expect(isToolAllowed("mcp__kb__lookup", DEFAULT_BRAIN_POLICY)).toBe(true)
    expect(isToolAllowed("mcp__intake__read", DEFAULT_BRAIN_POLICY)).toBe(true)
    expect(isToolAllowed("mcp__advisor__escalate", DEFAULT_BRAIN_POLICY)).toBe(
      true,
    )
  })

  it("denies an unknown built-in even if its name looks innocuous", () => {
    expect(isToolAllowed("SomeNewTool", DEFAULT_BRAIN_POLICY)).toBe(false)
  })
})

describe("isToolAllowed — explicit built-in allowlist", () => {
  const policy: ToolAllowlistPolicy = {
    allowedMcpServers: ["accounting"],
    allowedBuiltinTools: ["Read"],
  }

  it("allows a built-in only when it is explicitly listed", () => {
    expect(isToolAllowed("Read", policy)).toBe(true)
    expect(isToolAllowed("Bash", policy)).toBe(false)
  })

  it("still denies an MCP server not on this policy's list", () => {
    expect(isToolAllowed("mcp__kb__lookup", policy)).toBe(false)
    expect(isToolAllowed("mcp__accounting__post", policy)).toBe(true)
  })
})
