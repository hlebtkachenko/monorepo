import { describe, it, expect, vi } from "vitest"
import { parseCallback, runCallback, type CallbackDeps } from "./callbacks.js"
import { fakeStore } from "./state/fake-store.js"
import type { ApprovalRecord } from "./state/store.js"
import type { GitHubClient } from "./github.js"
import type { DispatchPlan } from "./dispatch.js"

function approval(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: "a",
    kind: "choice",
    decision: null,
    answerText: null,
    options: ["Approve", "Reject"],
    summary: null,
    answeredAt: null,
    asker: null,
    onTimeout: null,
    promptMessageId: null,
    callbackUrl: null,
    callbackToken: null,
    resumeWorkflow: null,
    delivered: false,
    exp: 2_000_000,
    created: 0,
    ...over,
  }
}

function fakeGitHub(over: Partial<GitHubClient> = {}): GitHubClient {
  return {
    dispatch: vi.fn(async () => true),
    rerunFailedJobs: vi.fn(async () => true),
    listRuns: async () => [],
    listPulls: async () => [],
    runJobs: async () => [],
    listCommits: async () => [],
    ...over,
  }
}

const plan: DispatchPlan = {
  kind: "deploy",
  workflow: "_deploy-aws.yml",
  ref: "main",
  inputs: { environment: "staging" },
  label: "deploy staging",
}

function deps(over: Partial<CallbackDeps> = {}): CallbackDeps {
  return {
    store: fakeStore(),
    github: fakeGitHub(),
    now: () => 1_000_000,
    ...over,
  }
}

describe("parseCallback", () => {
  it("parses each prefix", () => {
    expect(parseCallback("cfm:abc")).toEqual({ t: "confirm", token: "abc" })
    expect(parseCallback("cxl:abc")).toEqual({ t: "cancel", token: "abc" })
    expect(parseCallback("ask:id7:2")).toEqual({ t: "ask", id: "id7", idx: 2 })
    expect(parseCallback("snz:DEV-12:60")).toEqual({
      t: "snooze",
      scope: "DEV-12",
      mins: 60,
    })
    expect(parseCallback("ack:DEV-12")).toEqual({ t: "ack", scope: "DEV-12" })
    expect(parseCallback("rrn:98765")).toEqual({ t: "rerun", runId: 98765 })
    expect(parseCallback("dep:staging")).toEqual({
      t: "deploy",
      env: "staging",
    })
    expect(parseCallback("rb:production")).toEqual({
      t: "rbenv",
      env: "production",
    })
    expect(parseCallback("rbt:staging:sha-abc1234")).toEqual({
      t: "rbtag",
      env: "staging",
      tag: "sha-abc1234",
    })
    expect(parseCallback("log:42")).toEqual({ t: "showlog", runId: 42 })
    expect(parseCallback("xpr:a5")).toEqual({ t: "cancelask", id: "a5" })
    expect(parseCallback("txt:a6")).toEqual({ t: "custom", id: "a6" })
  })

  it("falls back to echo for unknown / malformed", () => {
    expect(parseCallback("Approve")).toEqual({ t: "echo", data: "Approve" })
    expect(parseCallback("rrn:notnum")).toEqual({
      t: "echo",
      data: "rrn:notnum",
    })
    expect(parseCallback("cfm:")).toEqual({ t: "echo", data: "cfm:" })
  })
})

describe("runCallback — confirm", () => {
  it("claims once and dispatches; double-tap is a no-op", async () => {
    const d = deps()
    await d.store.createDispatch({
      token: "t1",
      kind: "deploy",
      payload: JSON.stringify(plan),
      status: "pending",
      exp: 2_000_000,
      created: 0,
    })
    const first = await runCallback({ t: "confirm", token: "t1" }, d)
    expect(first.editText).toMatch(/Dispatched/)
    expect(d.github!.dispatch).toHaveBeenCalledTimes(1)

    const second = await runCallback({ t: "confirm", token: "t1" }, d)
    expect(second.answer).toMatch(/Already fired/)
    expect(d.github!.dispatch).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch an expired confirmation and marks it expired", async () => {
    const d = deps({ now: () => 9_999_999 })
    await d.store.createDispatch({
      token: "t2",
      kind: "deploy",
      payload: JSON.stringify(plan),
      status: "pending",
      exp: 1, // already past
      created: 0,
    })
    const out = await runCallback({ t: "confirm", token: "t2" }, d)
    expect(out.answer).toMatch(/expired/i)
    expect(d.github!.dispatch).not.toHaveBeenCalled()
    expect((await d.store.getDispatch("t2"))?.status).toBe("expired")
  })

  it("reverts to pending on a failed send so a retry can re-claim", async () => {
    const gh = fakeGitHub({ dispatch: vi.fn(async () => false) })
    const d = deps({ github: gh })
    await d.store.createDispatch({
      token: "t3",
      kind: "deploy",
      payload: JSON.stringify(plan),
      status: "pending",
      exp: 2_000_000,
      created: 0,
    })
    const out = await runCallback({ t: "confirm", token: "t3" }, d)
    expect(out.answer).toMatch(/retry/i)
    expect(out.editText).toBeUndefined() // buttons stay tappable
    expect((await d.store.getDispatch("t3"))?.status).toBe("pending")

    // A retry tap with a now-healthy GitHub succeeds.
    ;(gh.dispatch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)
    const retry = await runCallback({ t: "confirm", token: "t3" }, d)
    expect(retry.editText).toMatch(/Dispatched/)
    expect((await d.store.getDispatch("t3"))?.status).toBe("fired")
  })

  it("answers when GitHub is not configured", async () => {
    const out = await runCallback(
      { t: "confirm", token: "x" },
      deps({ github: null }),
    )
    expect(out.answer).toMatch(/not configured/)
  })
})

describe("runCallback — cancel", () => {
  it("cancels a pending dispatch once", async () => {
    const d = deps()
    await d.store.createDispatch({
      token: "c1",
      kind: "deploy",
      payload: JSON.stringify(plan),
      status: "pending",
      exp: 2_000_000,
      created: 0,
    })
    const out = await runCallback({ t: "cancel", token: "c1" }, d)
    expect(out.editText).toMatch(/Cancelled/)
    const again = await runCallback({ t: "cancel", token: "c1" }, d)
    expect(again.answer).toMatch(/Already handled/)
  })
})

describe("runCallback — ask", () => {
  it("records the first tap and rejects later taps", async () => {
    const d = deps()
    await d.store.putApproval(
      approval({ id: "a1", options: ["Approve", "Reject"], summary: "merge?" }),
    )
    const first = await runCallback({ t: "ask", id: "a1", idx: 0 }, d)
    expect(first.editText).toMatch(/Approve/)
    const second = await runCallback({ t: "ask", id: "a1", idx: 1 }, d)
    expect(second.answer).toMatch(/Already answered: Approve/)
  })

  it("rejects an out-of-range option index", async () => {
    const d = deps()
    await d.store.putApproval(approval({ id: "a2", options: ["Yes"] }))
    expect(
      (await runCallback({ t: "ask", id: "a2", idx: 9 }, d)).answer,
    ).toMatch(/Invalid option/)
  })

  it("reports expiry", async () => {
    const d = deps({ now: () => 5_000_000 })
    await d.store.putApproval(approval({ id: "a3", options: ["Yes"], exp: 1 }))
    expect(
      (await runCallback({ t: "ask", id: "a3", idx: 0 }, d)).answer,
    ).toMatch(/expired/i)
  })

  it("refuses a tap once a free-text answer is already recorded", async () => {
    const d = deps()
    await d.store.putApproval(approval({ id: "a4", kind: "text" }))
    await d.store.setAnswerText("a4", "ship it", 1_000_000)
    const out = await runCallback({ t: "ask", id: "a4", idx: 0 }, d)
    expect(out.answer).toMatch(/Already answered: ship it/)
  })

  it("cancelask cancels a pending approval (first wins)", async () => {
    const d = deps()
    await d.store.putApproval(approval({ id: "a5", summary: "deploy?" }))
    const out = await runCallback({ t: "cancelask", id: "a5" }, d)
    expect(out.editText).toMatch(/Cancelled/)
    expect((await d.store.getApproval("a5"))?.decision).toBe("cancelled")
    const again = await runCallback({ t: "cancelask", id: "a5" }, d)
    expect(again.answer).toMatch(/Already answered/)
  })

  it("custom (✍️ Other) on a pending ask returns a force_reply instruction", async () => {
    const d = deps()
    await d.store.putApproval(approval({ id: "a6", summary: "pick env" }))
    const out = await runCallback({ t: "custom", id: "a6" }, d)
    expect(out.forceReply?.approvalId).toBe("a6")
    expect(out.forceReply?.prompt).toMatch(/pick env/)
    expect(out.stripButtons).toBe(true) // option buttons removed so only text reply remains
  })

  it("custom refuses once already answered", async () => {
    const d = deps()
    await d.store.putApproval(approval({ id: "a7" }))
    await d.store.setDecision("a7", "Approve", 1_000_000)
    const out = await runCallback({ t: "custom", id: "a7" }, d)
    expect(out.forceReply).toBeUndefined()
    expect(out.answer).toMatch(/Already answered/)
  })
})

describe("runCallback — snooze / ack / rerun / echo", () => {
  it("snooze sets a future window", async () => {
    const d = deps()
    const out = await runCallback({ t: "snooze", scope: "DEV-9", mins: 60 }, d)
    expect(out.stripButtons).toBe(true)
    const s = await d.store.getSnooze("DEV-9")
    expect(s?.until).toBe(1_000_000 + 60 * 60_000)
    expect(s?.acked).toBe(false)
  })

  it("ack marks acked", async () => {
    const d = deps()
    await runCallback({ t: "ack", scope: "DEV-9" }, d)
    expect((await d.store.getSnooze("DEV-9"))?.acked).toBe(true)
  })

  it("rerun calls the GitHub client", async () => {
    const gh = fakeGitHub()
    const d = deps({ github: gh })
    const out = await runCallback({ t: "rerun", runId: 42 }, d)
    expect(gh.rerunFailedJobs).toHaveBeenCalledWith(42)
    expect(out.answer).toMatch(/triggered/)
  })

  it("echo replies with the choice", async () => {
    const out = await runCallback({ t: "echo", data: "Approve" }, deps())
    expect(out.reply).toMatch(/You chose: Approve/)
  })
})

describe("runCallback — pickers", () => {
  it("deploy env -> creates a pending dispatch + confirm buttons", async () => {
    const d = deps()
    const out = await runCallback({ t: "deploy", env: "staging" }, d)
    expect(out.reply).toMatch(/Confirm/)
    // a pending dispatch row now exists with a cfm token in the keyboard
    const cfm = out.replyMarkup?.[0]?.[0]
    expect(cfm && "data" in cfm ? cfm.data : "").toMatch(/^cfm:/)
    const token = (cfm as { data: string }).data.slice(4)
    expect((await d.store.getDispatch(token))?.status).toBe("pending")
  })

  it("deploy rejects an invalid env", async () => {
    const out = await runCallback({ t: "deploy", env: "prod" }, deps())
    expect(out.answer).toMatch(/Usage|Invalid/)
    expect(out.replyMarkup).toBeUndefined()
  })

  it("rbenv lists recent commits as rbt buttons", async () => {
    const gh = fakeGitHub({
      listCommits: async () => [
        { short: "abc1234", subject: "fix things" },
        { short: "def5678", subject: "more" },
      ],
    })
    const out = await runCallback(
      { t: "rbenv", env: "production" },
      deps({ github: gh }),
    )
    expect(out.reply).toMatch(/production/)
    const first = out.replyMarkup?.[0]?.[0]
    expect(first && "data" in first ? first.data : "").toBe(
      "rbt:production:sha-abc1234",
    )
  })

  it("rbenv answers when GitHub unconfigured / no commits", async () => {
    expect(
      (
        await runCallback(
          { t: "rbenv", env: "staging" },
          deps({ github: null }),
        )
      ).answer,
    ).toMatch(/not configured/)
    expect(
      (await runCallback({ t: "rbenv", env: "staging" }, deps())).answer,
    ).toMatch(/No recent commits/)
  })

  it("rbtag -> confirm dispatch for the chosen tag", async () => {
    const d = deps()
    const out = await runCallback(
      { t: "rbtag", env: "staging", tag: "sha-abc1234" },
      d,
    )
    expect(out.reply).toMatch(/Confirm/)
    const cfm = out.replyMarkup?.[0]?.[0] as { data: string }
    const stored = await d.store.getDispatch(cfm.data.slice(4))
    expect(stored?.kind).toBe("rollback")
    expect(JSON.parse(stored!.payload).inputs).toEqual({
      environment: "staging",
      image_tag_override: "sha-abc1234",
    })
  })

  it("showlog summarises failed jobs", async () => {
    const gh = fakeGitHub({
      runJobs: async () => [
        {
          name: "build",
          conclusion: "failure",
          htmlUrl: "u",
          failedSteps: ["compile"],
        },
        { name: "ok", conclusion: "success", htmlUrl: "u", failedSteps: [] },
      ],
    })
    const out = await runCallback(
      { t: "showlog", runId: 7 },
      deps({ github: gh }),
    )
    expect(out.reply).toMatch(/Failed jobs in run 7/)
    expect(out.reply).toMatch(/build/)
    expect(out.reply).toMatch(/compile/)
  })
})
