import { describe, it, expect } from "vitest"
import { answerView, isHttpsUrl, shouldApplyTimeout } from "./hitl.js"
import type { ApprovalRecord } from "./state/store.js"

function ap(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
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
    exp: 1000,
    created: 0,
    ...over,
  }
}

describe("answerView", () => {
  it("pending while unanswered and within TTL", () => {
    const v = answerView(ap(), 500)
    expect(v).toMatchObject({
      answered: false,
      pending: true,
      expired: false,
      timedOut: false,
    })
  })

  it("answered by a tap before TTL (not timedOut)", () => {
    const v = answerView(ap({ decision: "Approve", answeredAt: 800 }), 1500)
    expect(v).toMatchObject({
      decision: "Approve",
      answered: true,
      pending: false,
      expired: false,
      timedOut: false,
    })
  })

  it("answered by free text", () => {
    const v = answerView(
      ap({ kind: "text", answerText: "ship it", answeredAt: 200 }),
      300,
    )
    expect(v).toMatchObject({
      text: "ship it",
      answered: true,
      timedOut: false,
    })
  })

  it("timed out: decision persisted at/after exp -> answered + timedOut", () => {
    const v = answerView(
      ap({ decision: "Reject", answeredAt: 1200, onTimeout: "Reject" }),
      1500,
    )
    expect(v).toMatchObject({
      decision: "Reject",
      answered: true,
      timedOut: true,
      expired: false,
    })
  })

  it("expired with NO timeout policy -> expired, not answered", () => {
    const v = answerView(ap(), 2000)
    expect(v).toMatchObject({
      answered: false,
      expired: true,
      pending: false,
      timedOut: false,
      decision: null,
    })
  })
})

describe("isHttpsUrl", () => {
  it("accepts https URLs only", () => {
    expect(isHttpsUrl("https://example.com/callback")).toBe(true)
    expect(isHttpsUrl("https://example.com:8443/cb?x=1")).toBe(true)
  })
  it("rejects http, other schemes, and junk", () => {
    expect(isHttpsUrl("http://example.com/callback")).toBe(false)
    expect(isHttpsUrl("ftp://example.com")).toBe(false)
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false)
    expect(isHttpsUrl("not a url")).toBe(false)
    expect(isHttpsUrl("")).toBe(false)
  })
})

describe("shouldApplyTimeout", () => {
  it("true only when unanswered, past exp, with an onTimeout policy", () => {
    expect(shouldApplyTimeout(ap({ onTimeout: "Reject" }), 2000)).toBe(true)
  })
  it("false without a policy, before exp, or once answered", () => {
    expect(shouldApplyTimeout(ap(), 2000)).toBe(false) // no policy
    expect(shouldApplyTimeout(ap({ onTimeout: "Reject" }), 500)).toBe(false) // not past exp
    expect(
      shouldApplyTimeout(
        ap({ onTimeout: "Reject", decision: "Approve", answeredAt: 500 }),
        2000,
      ),
    ).toBe(false) // already answered
  })
})
