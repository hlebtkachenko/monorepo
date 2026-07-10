import { describe, expect, it } from "vitest"

import { decisionKey } from "./decision"

describe("decisionKey", () => {
  it("is identical for structurally-equal decisions regardless of key order", () => {
    const a = { account: "504", amount: "1200.00", period: "2025-03" }
    const b = { period: "2025-03", amount: "1200.00", account: "504" }
    expect(decisionKey(a)).toBe(decisionKey(b))
  })

  it("differs when a value differs", () => {
    const a = { account: "504", amount: "1200.00" }
    const b = { account: "518", amount: "1200.00" }
    expect(decisionKey(a)).not.toBe(decisionKey(b))
  })

  it("sorts keys recursively, including inside nested objects and arrays", () => {
    const a = {
      postingLines: [{ side: "DEBIT", accountId: "504" }],
      header: { b: 1, a: 2 },
    }
    const b = {
      header: { a: 2, b: 1 },
      postingLines: [{ accountId: "504", side: "DEBIT" }],
    }
    expect(decisionKey(a)).toBe(decisionKey(b))
  })
})
