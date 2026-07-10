import { describe, expect, it } from "vitest"

import {
  deriveDecision,
  ingestCorrections,
  readCorrectionEdit,
  type RawCorrectionRow,
} from "./correction"

const baseInput = {
  counterpartyKey: "CZ12345678",
  direction: "RECEIVED",
  supplyKind: "SERVICES",
  jurisdiction: "DOMESTIC",
  account: "518",
  amount: "1200.00",
} as const

function row(overrides: Partial<RawCorrectionRow>): RawCorrectionRow {
  return {
    id: "row-1",
    conversationId: "11111111-1111-1111-1111-111111111111",
    toolName: "createAccountingEvent",
    createdAt: "2026-01-01T00:00:00.000Z",
    inputJson: { ...baseInput },
    outputJson: { resolution: "approved" },
    ...overrides,
  }
}

describe("readCorrectionEdit", () => {
  it("reads header/vatAmounts/postingLines when present and well-formed", () => {
    const edit = readCorrectionEdit({
      header: { date: "2025-03-15" },
      vatAmounts: [{ rateLabel: "21%", base: "1000.00", vat: "210.00" }],
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1000.00" }],
    })
    expect(edit).toEqual({
      header: { date: "2025-03-15" },
      vatAmounts: [{ rateLabel: "21%", base: "1000.00", vat: "210.00" }],
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1000.00" }],
    })
  })

  it("drops individually malformed postingLines entries without discarding the rest", () => {
    const edit = readCorrectionEdit({
      postingLines: [
        { accountId: "504", side: "DEBIT", amount: "1000.00" },
        { accountId: "518", side: "SIDEWAYS", amount: "1000.00" }, // invalid side
        "not-an-object",
      ],
    })
    expect(edit?.postingLines).toEqual([
      { accountId: "504", side: "DEBIT", amount: "1000.00" },
    ])
  })

  it("returns undefined for a non-object, empty, or all-invalid edit", () => {
    expect(readCorrectionEdit(undefined)).toBeUndefined()
    expect(readCorrectionEdit("nope")).toBeUndefined()
    expect(readCorrectionEdit({})).toBeUndefined()
    expect(readCorrectionEdit({ postingLines: ["bad"] })).toBeUndefined()
  })
})

describe("deriveDecision", () => {
  it("rejected → null (no positive signal, never guess a replacement)", () => {
    expect(deriveDecision(baseInput, "rejected")).toBeNull()
  })

  it("approved with no edit → the proposal itself is the confirmed decision", () => {
    expect(deriveDecision(baseInput, "approved")).toEqual(baseInput)
  })

  it("approved with an edit → the edited fields win over the proposal", () => {
    const decision = deriveDecision(baseInput, "approved", {
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1000.00" }],
    })
    expect(decision).toEqual({
      ...baseInput,
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1000.00" }],
    })
  })
})

describe("ingestCorrections", () => {
  it("skips unresolved rows (outputJson null)", () => {
    const records = ingestCorrections([row({ outputJson: null })])
    expect(records).toHaveLength(0)
  })

  it("skips rows with an unreadable signature", () => {
    const records = ingestCorrections([row({ inputJson: { account: "504" } })])
    expect(records).toHaveLength(0)
  })

  it("skips rows with an unknown/malformed resolution value, never coerces it", () => {
    const records = ingestCorrections([
      row({ outputJson: { resolution: "maybe" } }),
    ])
    expect(records).toHaveLength(0)
  })

  it("ingests an approved-as-is row with the proposal as its decision", () => {
    const record = ingestCorrections([row({})])[0]!
    expect(record.resolution).toBe("approved")
    expect(record.edit).toBeUndefined()
    expect(record.decision).toEqual(baseInput)
    expect(record.signature).toEqual({
      counterpartyKey: "CZ12345678",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    })
  })

  it("ingests an approved-with-edit row with the merged decision + captured edit + note", () => {
    const record = ingestCorrections([
      row({
        outputJson: {
          resolution: "approved",
          note: "wrong account, corrected to 504",
          edit: {
            postingLines: [
              { accountId: "504", side: "DEBIT", amount: "1200.00" },
            ],
          },
        },
      }),
    ])[0]!
    expect(record.edit).toEqual({
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1200.00" }],
    })
    expect(record.note).toBe("wrong account, corrected to 504")
    expect(record.decision).toEqual({
      ...baseInput,
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1200.00" }],
    })
  })

  it("ingests a rejected row with decision null but keeps it as a correction (safety signal)", () => {
    const record = ingestCorrections([
      row({ outputJson: { resolution: "rejected", note: "wrong entirely" } }),
    ])[0]!
    expect(record.resolution).toBe("rejected")
    expect(record.decision).toBeNull()
    expect(record.note).toBe("wrong entirely")
  })
})
