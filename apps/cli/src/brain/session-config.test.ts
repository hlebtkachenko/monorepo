import { describe, expect, it } from "vitest"
import { buildLoginContext } from "@workspace/brain"
import type {
  AgentSessionLaunchOptions,
  BrainDryRunPlan,
  LiveBrainSessionResult,
} from "@workspace/intake"
import {
  CAPTURE_ACCOUNTING_DOCUMENT_TOOL,
  LANE_OFF_MESSAGE,
  buildBrainKickoff,
  buildBrainQueryOptions,
  buildBrainSessionEnv,
  detectCaptureError,
  isLaneOffOutcome,
  parseCaptureOutcome,
  parseCaptureResultText,
  readToolResultText,
  renderLiveResult,
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
    // Now the deployed REST API BASE (consumed by the local stdio bridge as AFFRAME_API_BASE), not an /mcp URL.
    mcpEndpoint: "https://api.afframe.com",
    apiKey: "affk_live_secret",
    agentSdkAuth: "sk-ant-test",
  }
}

// A stub of the launcher-resolved local stdio MCP bridge (tsx runner + the @afframe/mcp server source).
const BRIDGE = {
  command: "/repo/apps/mcp/node_modules/.bin/tsx",
  args: ["/repo/apps/mcp/src/server.ts"],
}

describe("buildBrainQueryOptions", () => {
  it("maps the login pack + creds verbatim into the SDK query options", () => {
    const o = launchOptions()
    const cfg = buildBrainQueryOptions(o, BRIDGE)

    expect(cfg.systemPrompt).toBe(o.plan.loginPack.system)
    expect(cfg.allowedTools).toEqual([...o.plan.loginPack.allowedTools])
    expect(cfg.disallowedTools).toEqual([...o.plan.loginPack.disallowedTools])
    // Copies, not the login pack's own arrays (mutating the config must not mutate the pack).
    expect(cfg.allowedTools).not.toBe(o.plan.loginPack.allowedTools)
    expect(cfg.disallowedTools).not.toBe(o.plan.loginPack.disallowedTools)
  })

  it("allowlist carries the capture tool and never the held-write ops; denylist carries the built-ins", () => {
    const cfg = buildBrainQueryOptions(launchOptions(), BRIDGE)
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

  it("points the afframe MCP server at a local stdio bridge: key in env (not argv), REST base pinned", () => {
    const cfg = buildBrainQueryOptions(launchOptions(), BRIDGE)
    expect(cfg.mcpServers).toEqual({
      afframe: {
        type: "stdio",
        command: "/repo/apps/mcp/node_modules/.bin/tsx",
        args: ["/repo/apps/mcp/src/server.ts"],
        env: {
          AFFRAME_API_KEY: "affk_live_secret",
          AFFRAME_API_BASE: "https://api.afframe.com",
        },
        alwaysLoad: true,
      },
    })
    // Security invariant: the secret rides in env, NEVER in argv (argv is world-readable via `ps`).
    expect(cfg.mcpServers.afframe!.args.join(" ")).not.toContain(
      "affk_live_secret",
    )
    expect(cfg.mcpServers.afframe!.env.AFFRAME_API_KEY).toBe("affk_live_secret")
  })

  it("never bypasses permissions and loads no filesystem settings", () => {
    const cfg = buildBrainQueryOptions(launchOptions(), BRIDGE)
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

describe("isLaneOffOutcome (M0.2a — clean lane-off message)", () => {
  it("recognizes the MCP renderer's rate-limited shape (write lane off or concurrency-capped)", () => {
    // The exact rendered text apps/mcp/src/tools/_render.ts `toolError` emits for a RateLimitError, wrapped
    // in the `{status:"unparsed", raw}` shape `parseCaptureResultText` produces for a non-JSON tool result.
    const serverGate = {
      status: "unparsed",
      raw: "Rate limited. retry_after=?s code=rate_limited request_id=req-1",
    }
    expect(isLaneOffOutcome(serverGate)).toBe(true)
  })

  it("does not fire on a normal applied/held outcome", () => {
    expect(isLaneOffOutcome({ status: "applied", eventId: "e1" })).toBe(false)
    expect(isLaneOffOutcome({ status: "held", reviewId: "r1" })).toBe(false)
  })

  it("does not fire on an unrelated unparsed tool result", () => {
    expect(
      isLaneOffOutcome({ status: "unparsed", raw: "[bad_request] oops" }),
    ).toBe(false)
  })

  it("is false-safe on a non-object / missing raw", () => {
    for (const serverGate of [undefined, null, "text", 7, {}]) {
      expect(isLaneOffOutcome(serverGate)).toBe(false)
    }
  })

  it("LANE_OFF_MESSAGE is a clean human sentence, not a raw dump", () => {
    expect(LANE_OFF_MESSAGE).not.toContain("429")
    expect(LANE_OFF_MESSAGE).not.toContain("request_id")
    expect(LANE_OFF_MESSAGE.toLowerCase()).toContain("nothing was booked")
  })
})

describe("renderLiveResult (M0.2a — acceptance: CLI prints a clean lane-off message, not a raw 429)", () => {
  it("prints the clean message (and nothing else) when the server refused the write", () => {
    const result: LiveBrainSessionResult = {
      brainRunId: "run-1",
      applied: false,
      status: "unparsed",
      isError: true,
      rateLimited: true,
      serverGate: {
        status: "unparsed",
        raw: "Rate limited. retry_after=?s code=rate_limited request_id=req-1",
      },
    }
    expect(renderLiveResult(result)).toBe(`${LANE_OFF_MESSAGE}\n`)
    expect(renderLiveResult(result)).not.toContain("429")
    expect(renderLiveResult(result)).not.toContain("req-1")
  })

  it("prints the full JSON result for an applied write", () => {
    const result: LiveBrainSessionResult = {
      brainRunId: "run-2",
      applied: true,
      status: "applied",
      isError: false,
      rateLimited: false,
      serverGate: { status: "applied", eventId: "e1" },
    }
    expect(renderLiveResult(result)).toBe(
      JSON.stringify(result, null, 2) + "\n",
    )
  })

  it("prints the full JSON result for a held write", () => {
    const result: LiveBrainSessionResult = {
      brainRunId: "run-3",
      applied: false,
      status: "held",
      isError: false,
      rateLimited: false,
      serverGate: { status: "held", reviewId: "rev-1" },
    }
    expect(renderLiveResult(result)).toBe(
      JSON.stringify(result, null, 2) + "\n",
    )
  })
})

describe("detectCaptureError (in-session rate-limit / hard-error detector)", () => {
  // The exact text the write MCP's `toolError` renderer emits for an admission 429 (apps/mcp/src/tools/_render.ts).
  const rateLimitText =
    "Rate limited. retry_after=30s code=rate_limited request_id=req_123"

  it("classifies an admission rate-limit and lifts retry_after (seconds) to milliseconds", () => {
    // The block IS an isError result, but the specific rate-limit marker takes precedence so the batch RETRIES.
    expect(detectCaptureError(rateLimitText, true)).toEqual({
      isError: true,
      rateLimited: true,
      retryAfterMs: 30_000,
    })
    // The marker alone is enough even if the isError flag were somehow dropped from the block.
    expect(detectCaptureError(rateLimitText, false).rateLimited).toBe(true)
  })

  it("omits retryAfterMs when the rate-limit carried no numeric retry_after (renderer emits `?s`)", () => {
    const noRetry =
      "Rate limited. retry_after=?s code=rate_limited request_id=r"
    expect(detectCaptureError(noRetry, true)).toEqual({
      isError: true,
      rateLimited: true,
      retryAfterMs: undefined,
    })
  })

  it("classifies a non-rate-limit isError block (5xx / validation) as a hard error, not a rate-limit", () => {
    const apiError =
      "[insufficient_scope] key lacks accounting:write (status=403 request_id=r)"
    expect(detectCaptureError(apiError, true)).toEqual({
      isError: true,
      rateLimited: false,
    })
  })

  it("treats a non-JSON body as a hard error even if the isError flag is missing (a success is always JSON)", () => {
    expect(detectCaptureError("upstream connection reset", false)).toEqual({
      isError: true,
      rateLimited: false,
    })
  })

  it("does NOT flag a genuine applied/held JSON body as an error", () => {
    expect(
      detectCaptureError('{"status":"applied","eventId":"e1"}', false),
    ).toEqual({ isError: false, rateLimited: false })
    expect(
      detectCaptureError('{"status":"held","reviewId":"rev-9"}', false),
    ).toEqual({ isError: false, rateLimited: false })
  })

  it("does NOT flag an absent capture result (no text) as an error", () => {
    // A missing capture result is not an error signal here — the classifier's no-reviewId floor still fails it.
    expect(detectCaptureError(undefined, false)).toEqual({
      isError: false,
      rateLimited: false,
    })
    expect(detectCaptureError("", false)).toEqual({
      isError: false,
      rateLimited: false,
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

  it("pins the deterministic idempotency-key when the bulk orchestrator supplies one", () => {
    const plan = stubPlan()
    const key = "brain-book-abc123"
    const kickoff = buildBrainKickoff(plan, key)
    // The exact key is pinned into the capture step so the session cannot generate its own — the resume-safe
    // property the bulk orchestrator relies on (same doc → same Idempotency-Key → server dedups a re-book).
    expect(kickoff).toContain('"idempotency-key"')
    expect(kickoff).toContain(key)
    expect(kickoff).toContain("do not generate your own")
    // Absent a key, the kickoff never mentions the idempotency-key argument (unchanged single-doc behavior).
    expect(buildBrainKickoff(plan)).not.toContain('"idempotency-key"')
  })
})
