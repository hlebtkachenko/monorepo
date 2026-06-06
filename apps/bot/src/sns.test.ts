import { describe, it, expect } from "vitest"
import { snsToEvent, confirmSubscription } from "./sns.js"

describe("snsToEvent", () => {
  it("ALARM CloudWatch message -> infra error event", () => {
    const e = snsToEvent({
      Type: "Notification",
      Message: JSON.stringify({
        AlarmName: "RdsCpu",
        NewStateValue: "ALARM",
        NewStateReason: "cpu > 95",
      }),
    })
    expect(e?.source).toBe("error")
    expect(e?.area).toBe("infra")
    expect(e?.risk).toBe("high")
    expect(e?.title).toContain("RdsCpu")
    expect(e?.fingerprintParts).toEqual(["aws-alarm", "RdsCpu"])
  })

  it("OK transition -> null (only ALARM opens an issue)", () => {
    expect(
      snsToEvent({
        Type: "Notification",
        Message: JSON.stringify({ AlarmName: "RdsCpu", NewStateValue: "OK" }),
      }),
    ).toBeNull()
  })

  it("non-JSON notification -> generic infra event", () => {
    const e = snsToEvent({
      Type: "Notification",
      Subject: "Budget 80%",
      Message: "you spent 80%",
    })
    expect(e?.title).toContain("Budget 80%")
    expect(e?.risk).toBe("medium")
    expect(e?.fingerprintParts).toEqual(["aws-notification", "Budget 80%"])
  })

  it("SubscriptionConfirmation -> null (handled separately)", () => {
    expect(
      snsToEvent({
        Type: "SubscriptionConfirmation",
        SubscribeURL: "https://x",
      }),
    ).toBeNull()
  })
})

describe("confirmSubscription", () => {
  it("GETs the SubscribeURL and returns true on 2xx", async () => {
    let hit = ""
    const fake = (async (url: string | URL | Request) => {
      hit = String(url)
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch
    const ok = await confirmSubscription(
      { Type: "SubscriptionConfirmation", SubscribeURL: "https://sns/confirm" },
      fake,
    )
    expect(ok).toBe(true)
    expect(hit).toBe("https://sns/confirm")
  })

  it("returns false for a non-confirmation envelope", async () => {
    expect(await confirmSubscription({ Type: "Notification" })).toBe(false)
  })
})
