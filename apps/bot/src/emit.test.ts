import { describe, it, expect, vi } from "vitest"
import type { Bot } from "grammy"
import { emitIssue } from "./emit.js"
import type { Env } from "./env.js"
import type { IssueEvent } from "./issues/types.js"

function fakeBot() {
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  return { bot: { api: { sendMessage } } as unknown as Bot, sendMessage }
}

function event(over: Partial<IssueEvent> = {}): IssueEvent {
  return {
    source: "error",
    title: "Boom",
    body: "something failed",
    fingerprintParts: ["x"],
    ...over,
  }
}

// No GitHub token → the issue path short-circuits to the "not configured" branch, which
// still returns issue:null but WITHOUT the alertOnly flag. That lets us prove a control
// source fell through the alert-only gate rather than being swallowed by it.
const env = { TELEGRAM_USER_ID: "42" } as unknown as Env

describe("emitIssue alert-only policy", () => {
  it("ci-failure alerts Telegram without opening an issue", async () => {
    const { bot, sendMessage } = fakeBot()
    const res = await emitIssue(
      event({ source: "ci-failure", title: "CI failed on main" }),
      env,
      bot,
    )
    expect(res).toEqual({
      status: 200,
      payload: { ok: true, issue: null, alertOnly: true },
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0]![1]).toContain("CI failed on main")
  })

  it("runtime error is alert-only too", async () => {
    const { bot } = fakeBot()
    const res = await emitIssue(event({ source: "error" }), env, bot)
    expect(res.payload).toMatchObject({ alertOnly: true, issue: null })
  })

  it("attaches a Rerun control when the event carries a GitHub run", async () => {
    const { bot, sendMessage } = fakeBot()
    await emitIssue(
      event({ source: "ci-failure", runId: 123, runUrl: "https://run" }),
      env,
      bot,
    )
    const keyboard = sendMessage.mock.calls[0]![2]?.reply_markup
    expect(JSON.stringify(keyboard)).toContain("rrn:123")
  })

  it("does NOT alert-only deliberate sources (security-scan falls through the gate)", async () => {
    const { bot } = fakeBot()
    const res = await emitIssue(event({ source: "security-scan" }), env, bot)
    // Fell through to the issue path (no token → not-configured branch): no alertOnly flag.
    expect(res.payload).not.toHaveProperty("alertOnly")
  })
})
