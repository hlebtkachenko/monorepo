import { describe, expect, it } from "vitest"
import {
  AFFRAME_MCP_SERVER,
  BRAIN_ACCOUNTING_DENIED_TOOLS,
  BRAIN_ACCOUNTING_POLICY,
  BRAIN_ACCOUNTING_READ_TOOLS,
  BRAIN_ACCOUNTING_WRITE_TOOLS,
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

describe("isToolAllowed — per-tool allowlist [G1-F2]", () => {
  it("a server WITHOUT a per-tool list still allows all its tools (backward compatible)", () => {
    // The default policy has no `allowedMcpTools`, so the legacy whole-server allow is unchanged.
    expect(DEFAULT_BRAIN_POLICY.allowedMcpTools).toBeUndefined()
    expect(isToolAllowed("mcp__accounting__post", DEFAULT_BRAIN_POLICY)).toBe(
      true,
    )
    expect(
      isToolAllowed("mcp__accounting__anything_at_all", DEFAULT_BRAIN_POLICY),
    ).toBe(true)
  })

  it("a server WITH a per-tool list allows ONLY its listed tools", () => {
    const policy: ToolAllowlistPolicy = {
      allowedMcpServers: ["svc"],
      allowedMcpTools: { svc: ["read_thing", "write_thing"] },
      allowedBuiltinTools: [],
    }
    expect(isToolAllowed("mcp__svc__read_thing", policy)).toBe(true)
    expect(isToolAllowed("mcp__svc__write_thing", policy)).toBe(true)
    // Not on the list → denied even though `svc` is an allowed server (per-tool, not per-server).
    expect(isToolAllowed("mcp__svc__delete_thing", policy)).toBe(false)
  })

  it("the per-tool map narrows but NEVER widens: a tool listed for a non-allowed server stays denied", () => {
    const policy: ToolAllowlistPolicy = {
      allowedMcpServers: ["svc"],
      // `other` is not in allowedMcpServers, so listing tools for it must not grant them.
      allowedMcpTools: { other: ["read_thing"] },
      allowedBuiltinTools: [],
    }
    expect(isToolAllowed("mcp__other__read_thing", policy)).toBe(false)
  })

  it("an empty per-tool list denies every tool on that server (explicit lockdown)", () => {
    const policy: ToolAllowlistPolicy = {
      allowedMcpServers: ["svc"],
      allowedMcpTools: { svc: [] },
      allowedBuiltinTools: [],
    }
    expect(isToolAllowed("mcp__svc__read_thing", policy)).toBe(false)
  })

  it("the per-tool capability is server-agnostic [G3-R4]: two servers, one narrowed, one not", () => {
    const policy: ToolAllowlistPolicy = {
      allowedMcpServers: ["narrowed", "open"],
      allowedMcpTools: { narrowed: ["safe_tool"] },
      allowedBuiltinTools: [],
    }
    expect(isToolAllowed("mcp__narrowed__safe_tool", policy)).toBe(true)
    expect(isToolAllowed("mcp__narrowed__risky_tool", policy)).toBe(false)
    // `open` has no per-tool list → whole-server allow, unaffected by `narrowed`'s narrowing.
    expect(isToolAllowed("mcp__open__anything", policy)).toBe(true)
  })
})

describe("BRAIN_ACCOUNTING_POLICY — pinned real accounting allowlist", () => {
  it("allows every one of the 5 pinned write ops on the afframe server", () => {
    for (const tool of BRAIN_ACCOUNTING_WRITE_TOOLS) {
      expect(
        isToolAllowed(
          `mcp__${AFFRAME_MCP_SERVER}__${tool}`,
          BRAIN_ACCOUNTING_POLICY,
        ),
      ).toBe(true)
    }
    // Spot-check the exact real names so a rename can't silently drift this test.
    expect(
      isToolAllowed(
        "mcp__afframe__create_accounting_event",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(true)
    expect(
      isToolAllowed(
        "mcp__afframe__capture_accounting_document",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(true)
    expect(
      isToolAllowed(
        "mcp__afframe__create_accounting_posting",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(true)
    expect(
      isToolAllowed("mcp__afframe__create_feedback", BRAIN_ACCOUNTING_POLICY),
    ).toBe(true)
    expect(
      isToolAllowed(
        "mcp__afframe__classify_accounting_event",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(true)
  })

  it("allows a representative report getter + org/structure/status + number-series lookup", () => {
    for (const tool of BRAIN_ACCOUNTING_READ_TOOLS) {
      expect(
        isToolAllowed(
          `mcp__${AFFRAME_MCP_SERVER}__${tool}`,
          BRAIN_ACCOUNTING_POLICY,
        ),
      ).toBe(true)
    }
    expect(
      isToolAllowed(
        "mcp__afframe__get_accounting_vat_return",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(true)
    expect(
      isToolAllowed("mcp__afframe__get_organization", BRAIN_ACCOUNTING_POLICY),
    ).toBe(true)
    expect(
      isToolAllowed(
        "mcp__afframe__list_accounting_number_series",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(true)
  })

  it("DENIES resolve_accounting_held_write (self-approval bypass) and list_accounting_held_writes (injection surface)", () => {
    // The two are the whole point of per-tool granularity: the afframe server is allowed, these are not.
    expect(
      isToolAllowed(
        "mcp__afframe__resolve_accounting_held_write",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(false)
    expect(
      isToolAllowed(
        "mcp__afframe__list_accounting_held_writes",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(false)
    for (const tool of BRAIN_ACCOUNTING_DENIED_TOOLS) {
      expect(
        isToolAllowed(
          `mcp__${AFFRAME_MCP_SERVER}__${tool}`,
          BRAIN_ACCOUNTING_POLICY,
        ),
      ).toBe(false)
    }
  })

  it("DENIES a tool NOT on the allowlist even though the afframe server is allowed (proves per-tool)", () => {
    // A plausible destructive op the codegen might one day expose — the per-tool list must reject it.
    expect(
      isToolAllowed(
        "mcp__afframe__delete_accounting_event",
        BRAIN_ACCOUNTING_POLICY,
      ),
    ).toBe(false)
    expect(
      isToolAllowed("mcp__afframe__deleteSomething", BRAIN_ACCOUNTING_POLICY),
    ).toBe(false)
  })

  it("still denies every dangerous built-in and any other MCP server", () => {
    for (const tool of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(isToolAllowed(tool, BRAIN_ACCOUNTING_POLICY)).toBe(false)
    }
    expect(
      isToolAllowed("mcp__evil__steal_secrets", BRAIN_ACCOUNTING_POLICY),
    ).toBe(false)
    expect(
      isToolAllowed("mcp__filesystem__write", BRAIN_ACCOUNTING_POLICY),
    ).toBe(false)
  })

  it("the pinned allowlist has no overlap with the denied held-write tools (no accidental re-allow)", () => {
    const allowed = new Set<string>([
      ...BRAIN_ACCOUNTING_WRITE_TOOLS,
      ...BRAIN_ACCOUNTING_READ_TOOLS,
    ])
    for (const denied of BRAIN_ACCOUNTING_DENIED_TOOLS) {
      expect(allowed.has(denied)).toBe(false)
    }
  })
})
