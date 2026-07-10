import { describe, expect, it } from "vitest"

import {
  buildLoginContext,
  HARD_RULE_PREAMBLE,
  type LoginContextSections,
} from "./context-pack"
import {
  BRAIN_ACCOUNTING_POLICY,
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
  it("defaults to the pinned real accounting policy so the session is bound to the real tools + sandboxed", () => {
    const pack = buildLoginContext(sections())
    expect(pack.toolPolicy).toEqual(BRAIN_ACCOUNTING_POLICY)
    // The default no-toolPolicy pack emits exact per-tool patterns for the 20 allowed afframe tools and
    // NONE for the two DENIED held-write ops (the DENY governs a REAL default session, not a placeholder).
    expect(pack.allowedTools).toContain("mcp__afframe__create_accounting_event")
    expect(pack.allowedTools).toContain("mcp__afframe__get_accounting_journal")
    expect(pack.allowedTools).toContain("mcp__afframe__match_booking_template")
    expect(pack.allowedTools).toHaveLength(20)
    expect(pack.allowedTools).not.toContain("mcp__afframe__*")
    expect(pack.allowedTools).not.toContain(
      "mcp__afframe__resolve_accounting_held_write",
    )
    expect(pack.allowedTools).not.toContain(
      "mcp__afframe__list_accounting_held_writes",
    )
  })

  it("carries the N-1 deny-list verbatim (the exfiltration / self-modification surface)", () => {
    const pack = buildLoginContext(sections())
    expect(pack.disallowedTools).toEqual([...BRAIN_DENIED_BUILTIN_TOOLS])
    // The pack's own text names the deny-list so every session inherits it.
    for (const tool of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(pack.system).toContain(tool)
    }
  })

  it("the embedded default policy round-trips through isToolAllowed (matches sandbox.ts exactly)", () => {
    const pack = buildLoginContext(sections())
    // A real allowed accounting write is permitted; the two held-write ops + exfil surface are not.
    expect(
      isToolAllowed("mcp__afframe__create_accounting_event", pack.toolPolicy),
    ).toBe(true)
    expect(
      isToolAllowed(
        "mcp__afframe__resolve_accounting_held_write",
        pack.toolPolicy,
      ),
    ).toBe(false)
    expect(
      isToolAllowed(
        "mcp__afframe__list_accounting_held_writes",
        pack.toolPolicy,
      ),
    ).toBe(false)
    for (const denied of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(isToolAllowed(denied, pack.toolPolicy)).toBe(false)
    }
    expect(isToolAllowed("mcp__evil__exfil", pack.toolPolicy)).toBe(false)
  })

  it("honors an explicit legacy DEFAULT_BRAIN_POLICY override (coarse per-server-only, backward compat)", () => {
    const pack = buildLoginContext({
      ...sections(),
      toolPolicy: DEFAULT_BRAIN_POLICY,
    })
    expect(pack.toolPolicy).toEqual(DEFAULT_BRAIN_POLICY)
    // The legacy shape has no per-tool narrowing → one coarse wildcard per placeholder server.
    expect(pack.allowedTools).toEqual([
      "mcp__accounting__*",
      "mcp__kb__*",
      "mcp__intake__*",
      "mcp__advisor__*",
    ])
    // A server with no per-tool list still allows all its tools (backward-compatible behavior).
    expect(isToolAllowed("mcp__accounting__post", pack.toolPolicy)).toBe(true)
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

  it("emits exact per-tool allow patterns for a narrowed server, wildcard for an un-narrowed one [G1-F2]", () => {
    const pack = buildLoginContext({
      ...sections(),
      toolPolicy: {
        allowedMcpServers: ["afframe", "kb"],
        allowedMcpTools: { afframe: ["create_accounting_event", "get_status"] },
        allowedBuiltinTools: [],
      },
    })
    // Narrowed server → one exact `mcp__afframe__<tool>` per allowed tool (no wildcard).
    expect(pack.allowedTools).toEqual([
      "mcp__afframe__create_accounting_event",
      "mcp__afframe__get_status",
      "mcp__kb__*", // un-narrowed server keeps the coarse wildcard
    ])
    // The emitted patterns agree with isToolAllowed: withheld tools are denied.
    expect(
      isToolAllowed("mcp__afframe__create_accounting_event", pack.toolPolicy),
    ).toBe(true)
    expect(
      isToolAllowed(
        "mcp__afframe__resolve_accounting_held_write",
        pack.toolPolicy,
      ),
    ).toBe(false)
  })

  it("pins the real accounting allowlist: resolve/list-held withheld from allowedTools", () => {
    const pack = buildLoginContext({
      ...sections(),
      toolPolicy: BRAIN_ACCOUNTING_POLICY,
    })
    expect(pack.allowedTools).toContain("mcp__afframe__create_accounting_event")
    expect(pack.allowedTools).toContain("mcp__afframe__get_accounting_journal")
    // The two DENIED held-write ops never appear as an allow pattern, and no bare wildcard leaks them in.
    expect(pack.allowedTools).not.toContain("mcp__afframe__*")
    expect(pack.allowedTools).not.toContain(
      "mcp__afframe__resolve_accounting_held_write",
    )
    expect(pack.allowedTools).not.toContain(
      "mcp__afframe__list_accounting_held_writes",
    )
    expect(
      isToolAllowed(
        "mcp__afframe__resolve_accounting_held_write",
        pack.toolPolicy,
      ),
    ).toBe(false)
    expect(
      isToolAllowed(
        "mcp__afframe__list_accounting_held_writes",
        pack.toolPolicy,
      ),
    ).toBe(false)
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
