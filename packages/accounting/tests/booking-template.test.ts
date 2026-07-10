import { describe, expect, it } from "vitest"
import {
  matchBookingTemplate,
  type BookingSignature,
  type ConfirmedBookingTemplate,
} from "../src/booking-template"
import type { PostingDecision } from "../src/classify"

const DECISION: PostingDecision = {
  vatMode: "STANDARD",
  vatJurisdiction: "DOMESTIC",
  vatRate: "21",
  scenario: "P-SERVICES-21",
  saldoAccount: "321",
  commodityCode: null,
  reasoning: ["confirmed template"],
}

function template(
  over: Partial<ConfirmedBookingTemplate> & { id: string },
): ConfirmedBookingTemplate {
  return {
    counterpartyKey: "27082440",
    direction: "RECEIVED",
    supplyKind: "SERVICES",
    jurisdiction: "DOMESTIC",
    confirmedDecision: DECISION,
    humanConfirmedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  }
}

const SIGNATURE: BookingSignature = {
  counterpartyKey: "27082440",
  direction: "RECEIVED",
  supplyKind: "SERVICES",
  jurisdiction: "DOMESTIC",
}

describe("matchBookingTemplate (M2.1)", () => {
  it("matches a confirmed template with an identical signature", () => {
    const t = template({ id: "tpl-1" })
    expect(matchBookingTemplate(SIGNATURE, [t])).toBe(t)
  })

  it("returns null when no template matches", () => {
    expect(matchBookingTemplate(SIGNATURE, [])).toBeNull()
  })

  it("returns null on a signature mismatch (jurisdiction differs)", () => {
    const t = template({ id: "tpl-1", jurisdiction: "EU" })
    expect(matchBookingTemplate(SIGNATURE, [t])).toBeNull()
  })

  it("returns null on a signature mismatch (counterparty differs)", () => {
    const t = template({ id: "tpl-1", counterpartyKey: "99999999" })
    expect(matchBookingTemplate(SIGNATURE, [t])).toBeNull()
  })

  it("returns null on a signature mismatch (direction differs)", () => {
    const t = template({ id: "tpl-1", direction: "ISSUED" })
    expect(matchBookingTemplate(SIGNATURE, [t])).toBeNull()
  })

  it("returns null on a signature mismatch (supplyKind differs)", () => {
    const t = template({ id: "tpl-1", supplyKind: "GOODS" })
    expect(matchBookingTemplate(SIGNATURE, [t])).toBeNull()
  })

  it("NEVER matches an unconfirmed (draft) template — the trust gate", () => {
    const draft = template({ id: "tpl-draft", humanConfirmedAt: null })
    expect(matchBookingTemplate(SIGNATURE, [draft])).toBeNull()
  })

  it("ignores an unconfirmed draft alongside a confirmed template for the same signature", () => {
    const draft = template({
      id: "tpl-draft",
      humanConfirmedAt: null,
      confirmedDecision: { ...DECISION, scenario: "WRONG-DRAFT-SCENARIO" },
    })
    const confirmed = template({ id: "tpl-confirmed" })
    const match = matchBookingTemplate(SIGNATURE, [draft, confirmed])
    expect(match).toBe(confirmed)
  })

  it("is deterministic: if multiple confirmed candidates somehow exist, picks the most recently confirmed", () => {
    const older = template({
      id: "tpl-older",
      humanConfirmedAt: "2026-01-01T00:00:00.000Z",
    })
    const newer = template({
      id: "tpl-newer",
      humanConfirmedAt: "2026-06-01T00:00:00.000Z",
    })
    expect(matchBookingTemplate(SIGNATURE, [older, newer])).toBe(newer)
    expect(matchBookingTemplate(SIGNATURE, [newer, older])).toBe(newer)
  })

  it("is pure: the same inputs always yield the same output", () => {
    const t = template({ id: "tpl-1" })
    const results = Array.from({ length: 5 }, () =>
      matchBookingTemplate(SIGNATURE, [t]),
    )
    expect(new Set(results).size).toBe(1)
  })
})
