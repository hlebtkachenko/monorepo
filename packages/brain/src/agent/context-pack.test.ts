import { describe, expect, it } from "vitest"

import {
  buildLoginContext,
  HARD_RULE_PREAMBLE,
  type LoginContextSections,
} from "./context-pack"
import {
  BRAIN_DENIED_BUILTIN_TOOLS,
  DEFAULT_BRAIN_POLICY,
  isToolAllowed,
} from "./sandbox"

// A minimal set of injected section texts. buildLoginContext is a pure assembler — the caller supplies
// these; the function only stitches + embeds the sandbox policy.
const sections = (): LoginContextSections => ({
  constitution: "I1: writes go through the server. I5: no self-modification.",
  kb: { id: "kb-abc123", version: "2026-07-01" },
  lawSummary: "ZoÚ + Decree 500/2002 digest.",
  confidenceProtocol:
    "Server scores C from infra signals; the model never self-scores.",
  escalationPolicy:
    "Below green or blocked -> route to a human via mcp__advisor__escalate.",
})

describe("buildLoginContext — hard-rule preamble", () => {
  it("opens with the hard-rule preamble reasserting the three cardinal invariants", () => {
    const pack = buildLoginContext(sections())
    expect(pack.system.startsWith(HARD_RULE_PREAMBLE)).toBe(true)
    // Cardinal-sin + no-self-confidence + writes-through-the-gate must all be present.
    expect(pack.system).toContain("CONFIDENT-WRONG IS THE CARDINAL SIN")
    expect(pack.system).toContain("YOU DO NOT ASSERT YOUR OWN CONFIDENCE")
    expect(pack.system).toContain("WRITES GO THROUGH THE SERVER GATE")
  })

  it("embeds every supplied safety section text", () => {
    const s = sections()
    const pack = buildLoginContext(s)
    expect(pack.system).toContain(s.constitution)
    expect(pack.system).toContain(s.lawSummary)
    expect(pack.system).toContain(s.confidenceProtocol)
    expect(pack.system).toContain(s.escalationPolicy)
    expect(pack.system).toContain(s.kb.id)
    expect(pack.system).toContain(s.kb.version)
  })
})

describe("buildLoginContext — embedded sandbox policy", () => {
  it("embeds the N-1 default policy so the session is sandboxed by construction", () => {
    const pack = buildLoginContext(sections())
    expect(pack.toolPolicy).toEqual(DEFAULT_BRAIN_POLICY)
    // Allow patterns are one mcp__<server>__* glob per permitted server (no built-ins by default).
    expect(pack.allowedTools).toEqual([
      "mcp__accounting__*",
      "mcp__kb__*",
      "mcp__intake__*",
      "mcp__advisor__*",
    ])
  })

  it("carries the N-1 deny-list verbatim (the exfiltration / self-modification surface)", () => {
    const pack = buildLoginContext(sections())
    expect(pack.disallowedTools).toEqual([...BRAIN_DENIED_BUILTIN_TOOLS])
    // The pack's own text names the deny-list so every session inherits it.
    for (const tool of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(pack.system).toContain(tool)
    }
  })

  it("the embedded policy round-trips through isToolAllowed (matches sandbox.ts exactly)", () => {
    const pack = buildLoginContext(sections())
    expect(isToolAllowed("mcp__accounting__post", pack.toolPolicy)).toBe(true)
    for (const denied of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(isToolAllowed(denied, pack.toolPolicy)).toBe(false)
    }
    expect(isToolAllowed("mcp__evil__exfil", pack.toolPolicy)).toBe(false)
  })

  it("honors an explicit tool policy override", () => {
    const pack = buildLoginContext({
      ...sections(),
      toolPolicy: {
        allowedMcpServers: ["accounting"],
        allowedBuiltinTools: [],
      },
    })
    expect(pack.allowedTools).toEqual(["mcp__accounting__*"])
    expect(isToolAllowed("mcp__kb__lookup", pack.toolPolicy)).toBe(false)
  })

  it("rejects a policy whose allow-list overlaps the deny-list (fails closed, no un-sandbox)", () => {
    const denied = BRAIN_DENIED_BUILTIN_TOOLS[0]!
    expect(() =>
      buildLoginContext({
        ...sections(),
        toolPolicy: {
          allowedMcpServers: ["accounting"],
          allowedBuiltinTools: [denied],
        },
      }),
    ).toThrow(/denied built-in/)
  })
})

describe("buildLoginContext — purity", () => {
  it("is deterministic: identical sections yield an identical pack", () => {
    const a = buildLoginContext(sections())
    const b = buildLoginContext(sections())
    expect(a).toEqual(b)
  })

  it("echoes the KB pointer as a fresh object (no aliasing of the input)", () => {
    const s = sections()
    const pack = buildLoginContext(s)
    expect(pack.kb).toEqual(s.kb)
    expect(pack.kb).not.toBe(s.kb)
  })
})
