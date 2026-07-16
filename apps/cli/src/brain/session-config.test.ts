import { describe, expect, it } from "vitest"
import { buildLoginContext } from "@workspace/brain"
import type {
  AgentSessionLaunchOptions,
  BrainDryRunPlan,
  BrainPostingPlan,
  LiveBrainSessionResult,
} from "@workspace/intake"
import {
  CAPTURE_ACCOUNTING_DOCUMENT_TOOL,
  CLASSIFY_ACCOUNTING_EVENT_TOOL,
  CREATE_ACCOUNTING_POSTING_TOOL,
  LANE_OFF_MESSAGE,
  buildBrainKickoff,
  buildBrainQueryOptions,
  buildBrainSessionEnv,
  buildPostingKickoff,
  detectCaptureError,
  isLaneOffOutcome,
  minorToDecimal,
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

// A posting-lane plan: the kickoff reads `invoice` + `posting`; the amounts drive the pre-computed totals.
function stubPostingPlan(vatMinor = 1050000n): BrainPostingPlan {
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
    invoice: {
      record_type: "invoice",
      direction: "received",
      doc_type: "invoice",
      number: "FP-2025-0042",
      issue_date: "2025-03-14",
      tax_point_date: "2025-03-14",
      currency: "CZK",
      lines: [],
      vat_summary: [
        {
          rate: vatMinor === 0n ? 0 : 21,
          base_minor: 5000000n,
          tax_minor: vatMinor,
        },
      ],
      total_minor: 5000000n + vatMinor,
      supplier: { name: "Stavebniny DEK a.s.", ico: "27946939" },
    },
    posting: {
      periodId: "period-uuid-1",
      summaryRecordId: "summary-uuid-2",
      accountingEventId: "event-uuid-3",
      postingDate: "2025-03-14",
      conversationId: "11111111-1111-4111-8111-111111111111",
    },
  } as unknown as BrainPostingPlan
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

  describe("M2.1 model routing (bookingTemplateMatched)", () => {
    it("omits `model` entirely when bookingTemplateMatched is absent — ZERO behavior change for every caller today", () => {
      const cfg = buildBrainQueryOptions(launchOptions(), BRIDGE)
      expect(cfg.model).toBeUndefined()
      expect("model" in cfg).toBe(false)
    })

    it("pins the cheap model when a confirmed booking template matched", () => {
      const cfg = buildBrainQueryOptions(
        { ...launchOptions(), bookingTemplateMatched: true },
        BRIDGE,
      )
      expect(cfg.model).toBe("haiku")
    })

    it("explicitly pins the stronger default model for a confirmed-novel (checked, unmatched) case", () => {
      const cfg = buildBrainQueryOptions(
        { ...launchOptions(), bookingTemplateMatched: false },
        BRIDGE,
      )
      expect(cfg.model).toBe("sonnet")
    })

    it("never touches the sandbox / tool lists — routing is model-only", () => {
      const matched = buildBrainQueryOptions(
        { ...launchOptions(), bookingTemplateMatched: true },
        BRIDGE,
      )
      const unmatched = buildBrainQueryOptions(
        { ...launchOptions(), bookingTemplateMatched: false },
        BRIDGE,
      )
      expect(matched.allowedTools).toEqual(unmatched.allowedTools)
      expect(matched.disallowedTools).toEqual(unmatched.disallowedTools)
      expect(matched.systemPrompt).toBe(unmatched.systemPrompt)
    })
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

  it("pins the real classify tool name (the server treatment the harness threads onto the write)", () => {
    expect(CLASSIFY_ACCOUNTING_EVENT_TOOL).toBe(
      "mcp__afframe__classify_accounting_event",
    )
  })

  it("the kickoff drives the fixed read → classify → propose sequence", () => {
    const kickoff = buildBrainKickoff(stubPlan())
    expect(kickoff).toContain("mcp__afframe__get_structure")
    expect(kickoff).toContain("mcp__afframe__list_accounting_number_series")
    expect(kickoff).toContain("mcp__afframe__classify_accounting_event")
    expect(kickoff).toContain("mcp__afframe__capture_accounting_document")
    // classify (step 3) is ordered before the capture write (step 4).
    expect(
      kickoff.indexOf("mcp__afframe__classify_accounting_event"),
    ).toBeLessThan(kickoff.indexOf("mcp__afframe__capture_accounting_document"))
  })

  it("[M1.2] the kickoff tells the session to reason facts, never invent the treatment", () => {
    const kickoff = buildBrainKickoff(stubPlan())
    expect(kickoff).toContain("Reason the transaction facts")
    expect(kickoff).toContain("PURE decision")
    expect(kickoff).toContain("hard rule 4")
    // The write step's "verbatim" instruction is unchanged by the reasoning step's addition.
    expect(kickoff).toContain(
      "already-inspected payload verbatim — do not invent, add, drop, or edit any field",
    )
    // brain-gate #639: the fact source is the embedded payload, NOT an (inaccessible) document read.
    expect(kickoff).toContain("you have no document-read tool")
    // brain-gate #639 (preserved through M1.2): on a classify-vs-payload disagreement the MODEL submits
    // verbatim + reports a discrepancy, and never reconciles the treatment fields into the write body itself.
    expect(kickoff).toContain("YOU never edit the payload")
    expect(kickoff).toContain("submit the payload VERBATIM in step 4 anyway")
    expect(kickoff).toContain("never reconcile it yourself")
    // #578: NOTHING threads classify's treatment onto the write — the former "harness applies classify …
    // narrow-only" seam was dead (bare-allowlisted tools bypass canUseTool) and was removed. The kickoff must
    // no longer promise a harness merge; the SERVER gate is the sole treatment authority.
    expect(kickoff).not.toContain("The HARNESS applies classify's")
    expect(kickoff).not.toMatch(/narrow-only/i)
    expect(kickoff).toContain("The SERVER gate is the treatment authority")
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

describe("minorToDecimal (haléř bigint → Kč decimal string)", () => {
  it.each([
    [5680000n, "56800.00"],
    [0n, "0.00"],
    [5n, "0.05"],
    [123n, "1.23"],
    [100n, "1.00"],
    [-100n, "-1.00"],
  ])("%s → %s", (minor, expected) => {
    expect(minorToDecimal(minor)).toBe(expected)
  })
})

describe("buildPostingKickoff (double-entry lane — model reasons the account)", () => {
  it("repeats the untrusted-data hardening clause (the model reasons over document data)", () => {
    expect(buildPostingKickoff(stubPostingPlan())).toContain("UNTRUSTED")
  })

  it("presents the curated invoice facts + deterministically-computed net/VAT/gross totals", () => {
    const kickoff = buildPostingKickoff(stubPostingPlan())
    expect(kickoff).toContain("Stavebniny DEK a.s.")
    expect(kickoff).toContain("IČO 27946939")
    expect(kickoff).toContain("Net base total: 50000.00 CZK")
    expect(kickoff).toContain("Input VAT total: 10500.00 CZK")
    expect(kickoff).toContain("Gross total: 60500.00 CZK")
  })

  it("pins the operator id envelope + conversationId verbatim (no model-generated ids)", () => {
    const kickoff = buildPostingKickoff(stubPostingPlan())
    expect(kickoff).toContain("period-uuid-1")
    expect(kickoff).toContain("summary-uuid-2")
    expect(kickoff).toContain("event-uuid-3")
    expect(kickoff).toContain("11111111-1111-4111-8111-111111111111")
    expect(kickoff).toContain("do not generate your own")
  })

  it("instructs the posting + chart tools but embeds NO pre-chosen cost account (the answer under test)", () => {
    const kickoff = buildPostingKickoff(stubPostingPlan())
    expect(kickoff).toContain(CREATE_ACCOUNTING_POSTING_TOOL)
    expect(kickoff).toContain("mcp__afframe__list_accounts")
    // Structural accounts (input VAT 343, supplier 321) are named; the COST account is deliberately NOT — the
    // model must reason it. This is the anti-leak property that makes the test meaningful (GAP-007).
    expect(kickoff).toContain("343")
    expect(kickoff).toContain("321")
    expect(kickoff).not.toContain("501")
    expect(kickoff).not.toContain("518")
  })

  it("does NOT force a předkontace template — common case as default, non-standard classes flagged", () => {
    const kickoff = buildPostingKickoff(stubPostingPlan())
    // The debit CLASS + the VAT-deduction treatment are part of the judgment, so the model must choose them —
    // a forced class-5 / full-343 template would mis-book assets/advances/non-deductible VAT (brain-gate must-fix).
    expect(kickoff).toContain("CHOOSE the accounts")
    expect(kickoff).toContain("do not assume a template")
    expect(kickoff).toContain("fixed-asset")
    expect(kickoff).toContain("non-deductible")
    expect(kickoff).toContain("§92a")
    expect(kickoff).not.toContain("the ONE class-5")
  })
})
