import { describe, it, expect, vi } from "vitest"
import { deliverAnswer } from "./deliver.js"
import type { ApprovalRecord } from "./state/store.js"

function ap(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: "a1",
    kind: "choice",
    decision: "Approve",
    answerText: null,
    options: ["Approve", "Reject"],
    summary: null,
    answeredAt: 1,
    asker: "agent-x",
    onTimeout: null,
    promptMessageId: null,
    callbackUrl: null,
    callbackToken: null,
    resumeWorkflow: null,
    delivered: false,
    exp: 9_999,
    created: 0,
    ...over,
  }
}

describe("deliverAnswer", () => {
  it("POSTs the answer to callbackUrl with a Bearer token", async () => {
    const fetchImpl = vi.fn(
      async (_u: string | URL | Request, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer cbk",
        )
        expect(JSON.parse(init?.body as string)).toMatchObject({
          id: "a1",
          decision: "Approve",
          asker: "agent-x",
        })
        return new Response(null, { status: 200 })
      },
    )
    const r = await deliverAnswer(
      ap({ callbackUrl: "https://x/cb", callbackToken: "cbk" }),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(r).toMatchObject({ fired: true, webhook: true })
  })

  it("dispatches resumeWorkflow with ask_id/decision/text", async () => {
    const dispatch = vi.fn(async () => true)
    const r = await deliverAnswer(
      ap({
        decision: null,
        answerText: "ship it",
        resumeWorkflow: "resume.yml",
      }),
      { dispatch },
    )
    expect(dispatch).toHaveBeenCalledWith("resume.yml", "main", {
      ask_id: "a1",
      decision: "",
      text: "ship it",
    })
    expect(r).toMatchObject({ fired: true, workflow: true })
  })

  it("does nothing when already delivered", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const r = await deliverAnswer(
      ap({ callbackUrl: "https://x", delivered: true }),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(r.fired).toBe(false)
  })

  it("does nothing when unresolved or no target", async () => {
    expect(
      (
        await deliverAnswer(
          ap({ decision: null, callbackUrl: "https://x" }),
          {},
        )
      ).fired,
    ).toBe(false) // unresolved
    expect((await deliverAnswer(ap(), {})).fired).toBe(false) // resolved but no target
  })

  it("webhook failure does not throw and reports not-fired", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network")
    })
    const r = await deliverAnswer(ap({ callbackUrl: "https://x" }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.fired).toBe(false)
  })
})
