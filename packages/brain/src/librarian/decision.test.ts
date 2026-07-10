import { describe, expect, it } from "vitest"

import { decisionKey, normalizeDecisionForVote } from "./decision"

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

describe("normalizeDecisionForVote", () => {
  it("strips per-document amounts/dates/ids and keeps the treatment fields", () => {
    const normalized = normalizeDecisionForVote({
      account: "504",
      scenario: "domestic-service-received",
      vatMode: "STANDARD",
      vatJurisdiction: "DOMESTIC",
      amount: "1200.00",
      date: "2025-03-15",
      documentNumber: "FV-2025-0042",
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1000.00" }],
      vatAmounts: [{ rateLabel: "21%", base: "1000.00", vat: "210.00" }],
    })
    expect(normalized).toEqual({
      account: "504",
      scenario: "domestic-service-received",
      vatMode: "STANDARD",
      vatJurisdiction: "DOMESTIC",
      postingLines: [{ accountId: "504", side: "DEBIT" }],
      vatAmounts: [{ rateLabel: "21%" }],
    })
  })

  it("makes two decisions that differ only in per-document fields key-equal", () => {
    const a = normalizeDecisionForVote({
      account: "504",
      side: "DEBIT",
      amount: "1200.00",
      date: "2025-03-15",
    })
    const b = normalizeDecisionForVote({
      account: "504",
      side: "DEBIT",
      amount: "58.00",
      date: "2025-11-02",
    })
    expect(decisionKey(a)).toBe(decisionKey(b))
  })

  it("is idempotent (normalizing an already-normalized decision is a no-op)", () => {
    const once = normalizeDecisionForVote({ account: "504", amount: "10.00" })
    const twice = normalizeDecisionForVote(once)
    expect(twice).toEqual(once)
  })

  it("keeps distinct treatments distinct (different account does NOT collapse)", () => {
    const a = normalizeDecisionForVote({ account: "504", amount: "10.00" })
    const b = normalizeDecisionForVote({ account: "518", amount: "10.00" })
    expect(decisionKey(a)).not.toBe(decisionKey(b))
  })
})
