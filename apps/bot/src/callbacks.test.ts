import { describe, it, expect, vi } from "vitest"
import { parseCallback, runCallback, type CallbackDeps } from "./callbacks.js"
import { fakeStore } from "./state/fake-store.js"
import type { GitHubClient } from "./github.js"
import type { DispatchPlan } from "./dispatch.js"

function fakeGitHub(over: Partial<GitHubClient> = {}): GitHubClient {
  return {
    dispatch: vi.fn(async () => true),
    rerunFailedJobs: vi.fn(async () => true),
    listRuns: async () => [],
    listPulls: async () => [],
    runJobs: async () => [],
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
    await d.store.putApproval({
      id: "a1",
      decision: null,
      options: ["Approve", "Reject"],
      summary: "merge?",
      exp: 2_000_000,
      created: 0,
    })
    const first = await runCallback({ t: "ask", id: "a1", idx: 0 }, d)
    expect(first.editText).toMatch(/Approve/)
    const second = await runCallback({ t: "ask", id: "a1", idx: 1 }, d)
    expect(second.answer).toMatch(/Already answered: Approve/)
  })

  it("rejects an out-of-range option index", async () => {
    const d = deps()
    await d.store.putApproval({
      id: "a2",
      decision: null,
      options: ["Yes"],
      summary: null,
      exp: 2_000_000,
      created: 0,
    })
    expect(
      (await runCallback({ t: "ask", id: "a2", idx: 9 }, d)).answer,
    ).toMatch(/Invalid option/)
  })

  it("reports expiry", async () => {
    const d = deps({ now: () => 5_000_000 })
    await d.store.putApproval({
      id: "a3",
      decision: null,
      options: ["Yes"],
      summary: null,
      exp: 1,
      created: 0,
    })
    expect(
      (await runCallback({ t: "ask", id: "a3", idx: 0 }, d)).answer,
    ).toMatch(/expired/i)
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
