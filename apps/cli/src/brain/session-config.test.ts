import { describe, expect, it } from "vitest"
import { buildLoginContext } from "@workspace/brain"
import type {
  AgentSessionLaunchOptions,
  BrainDryRunPlan,
} from "@workspace/intake"
import {
  CAPTURE_ACCOUNTING_DOCUMENT_TOOL,
  buildBrainKickoff,
  buildBrainQueryOptions,
  buildBrainSessionEnv,
  parseCaptureOutcome,
  parseCaptureResultText,
  readToolResultText,
  sandboxAllows,
} from "./session-config"

// Only `loginPack`, `policy`, and `captureRequest` are read by the functions under test; a real login pack
// (default BRAIN_ACCOUNTING_POLICY) makes the sandbox + tool-list assertions genuine. `captureRequest`
// carries a distinctive marker so the kickoff-embeds-the-inspected-payload assertion is real.
function stubPlan(): BrainDryRunPlan {
  const loginPack = buildLoginContext({
    constitution: "CONSTITUTION",
    kb: { id: "kb-1", version: "2026-07" },
    lawSummary: "LAW",
    confidenceProtocol: "PROTOCOL",
    escalationPolicy: "ESCALATION",
  })
  return {
    loginPack,
    policy: loginPack.toolPolicy,
    toolPlan: [],
    captureRequest: { periodId: "period-uuid-1", seriesId: "series-uuid-2" },
  } as unknown as BrainDryRunPlan
}

function launchOptions(): AgentSessionLaunchOptions {
  return {
    plan: stubPlan(),
    mcpEndpoint: "https://api.afframe.com/mcp",
    apiKey: "affk_live_secret",
    agentSdkAuth: "sk-ant-test",
  }
}

describe("buildBrainQueryOptions", () => {
  it("maps the login pack + creds verbatim into the SDK query options", () => {
    const o = launchOptions()
    const cfg = buildBrainQueryOptions(o)

    expect(cfg.systemPrompt).toBe(o.plan.loginPack.system)
    expect(cfg.allowedTools).toEqual([...o.plan.loginPack.allowedTools])
    expect(cfg.disallowedTools).toEqual([...o.plan.loginPack.disallowedTools])
    // Copies, not the login pack's own arrays (mutating the config must not mutate the pack).
    expect(cfg.allowedTools).not.toBe(o.plan.loginPack.allowedTools)
    expect(cfg.disallowedTools).not.toBe(o.plan.loginPack.disallowedTools)
  })

  it("allowlist carries the capture tool and never the held-write ops; denylist carries the built-ins", () => {
    const cfg = buildBrainQueryOptions(launchOptions())
    expect(cfg.allowedTools).toContain(CAPTURE_ACCOUNTING_DOCUMENT_TOOL)
    expect(cfg.allowedTools).toContain("mcp__afframe__get_structure")
    expect(cfg.allowedTools).not.toContain(
      "mcp__afframe__resolve_accounting_held_write",
    )
    expect(cfg.allowedTools).not.toContain(
      "mcp__afframe__list_accounting_held_writes",
    )
    expect(cfg.disallowedTools).toContain("Bash")
  })

  it("points the afframe MCP server at the endpoint with the Brain key, http transport", () => {
    const cfg = buildBrainQueryOptions(launchOptions())
    expect(cfg.mcpServers).toEqual({
      afframe: {
        type: "http",
        url: "https://api.afframe.com/mcp",
        headers: { Authorization: "Bearer affk_live_secret" },
      },
    })
  })

  it("never bypasses permissions and loads no filesystem settings", () => {
    const cfg = buildBrainQueryOptions(launchOptions())
    expect(cfg.permissionMode).toBe("default")
    expect(cfg.permissionMode).not.toBe("bypassPermissions")
    expect(cfg.settingSources).toEqual([])
  })
})

describe("sandboxAllows (default-deny)", () => {
  const plan = stubPlan()

  it("allows the pinned accounting read + write tools", () => {
    expect(sandboxAllows(CAPTURE_ACCOUNTING_DOCUMENT_TOOL, plan)).toBe(true)
    expect(sandboxAllows("mcp__afframe__get_structure", plan)).toBe(true)
    expect(
      sandboxAllows("mcp__afframe__list_accounting_number_series", plan),
    ).toBe(true)
  })

  it("denies the held-write ops, every built-in, and unknown servers", () => {
    expect(
      sandboxAllows("mcp__afframe__resolve_accounting_held_write", plan),
    ).toBe(false)
    expect(
      sandboxAllows("mcp__afframe__list_accounting_held_writes", plan),
    ).toBe(false)
    for (const builtin of ["Bash", "Read", "Write", "WebFetch", "Task"]) {
      expect(sandboxAllows(builtin, plan)).toBe(false)
    }
    expect(sandboxAllows("mcp__other__get_structure", plan)).toBe(false)
    expect(sandboxAllows("", plan)).toBe(false)
  })
})

describe("parseCaptureOutcome (fail-safe)", () => {
  it("reads an applied write", () => {
    expect(parseCaptureOutcome({ status: "applied", eventId: "e1" })).toEqual({
      applied: true,
      status: "applied",
      reviewId: undefined,
      raw: { status: "applied", eventId: "e1" },
    })
  })

  it("reads a held write with its review handle", () => {
    const out = parseCaptureOutcome({ status: "held", reviewId: "rev-9" })
    expect(out.applied).toBe(false)
    expect(out.status).toBe("held")
    expect(out.reviewId).toBe("rev-9")
  })

  it("treats an unreadable body as not-applied", () => {
    for (const raw of [{}, null, undefined, "text", 7, { status: 3 }]) {
      expect(parseCaptureOutcome(raw).applied).toBe(false)
    }
  })
})

describe("readToolResultText + parseCaptureResultText", () => {
  it("reads a string or an array of text parts", () => {
    expect(readToolResultText("hi")).toBe("hi")
    expect(
      readToolResultText([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab")
  })

  it("returns undefined when there is no text", () => {
    expect(readToolResultText([])).toBeUndefined()
    expect(readToolResultText(null)).toBeUndefined()
    expect(readToolResultText(42)).toBeUndefined()
  })

  it("JSON-parses valid text and records unparsed text", () => {
    expect(parseCaptureResultText('{"status":"held","reviewId":"r"}')).toEqual({
      status: "held",
      reviewId: "r",
    })
    expect(parseCaptureResultText(undefined)).toBeUndefined()
    expect(parseCaptureResultText("not json")).toEqual({
      status: "unparsed",
      raw: "not json",
    })
  })
})

describe("buildBrainSessionEnv", () => {
  it("copies defined string vars and drops undefined ones", () => {
    const env = buildBrainSessionEnv({ A: "1", B: undefined, C: "3" }, "tok")
    expect(env).toEqual({ A: "1", C: "3" })
  })

  it("sets ANTHROPIC_API_KEY only for an sk- API-key token", () => {
    expect(buildBrainSessionEnv({}, "sk-ant-xyz").ANTHROPIC_API_KEY).toBe(
      "sk-ant-xyz",
    )
    expect(
      "ANTHROPIC_API_KEY" in buildBrainSessionEnv({}, "subscription-token"),
    ).toBe(false)
  })
})

describe("constants", () => {
  it("pins the real capture tool name", () => {
    expect(CAPTURE_ACCOUNTING_DOCUMENT_TOOL).toBe(
      "mcp__afframe__capture_accounting_document",
    )
  })

  it("the kickoff drives the fixed read → propose sequence", () => {
    const kickoff = buildBrainKickoff(stubPlan())
    expect(kickoff).toContain("mcp__afframe__get_structure")
    expect(kickoff).toContain("mcp__afframe__list_accounting_number_series")
    expect(kickoff).toContain("mcp__afframe__capture_accounting_document")
  })

  it("the kickoff embeds the inspected captureRequest verbatim (no re-planning)", () => {
    const plan = stubPlan()
    const kickoff = buildBrainKickoff(plan)
    // The exact inspected payload is serialized into the prompt, so the live session submits it, not a
    // model-fabricated body.
    expect(kickoff).toContain(JSON.stringify(plan.captureRequest, null, 2))
    expect(kickoff).toContain("period-uuid-1")
    expect(kickoff).toContain("verbatim")
    // Deterministic in the plan: a different captureRequest yields a different kickoff.
    const other = {
      ...plan,
      captureRequest: { periodId: "other-period" },
    } as BrainDryRunPlan
    expect(buildBrainKickoff(other)).not.toBe(kickoff)
  })
})
