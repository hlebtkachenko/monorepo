import { describe, expect, it } from "vitest"

import { readCorrectionSignature, signatureKey } from "./signature"

describe("readCorrectionSignature", () => {
  it("reads the 4 base facts + the sub-fact defaults off a well-formed input", () => {
    const signature = readCorrectionSignature({
      counterpartyKey: "CZ12345678",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
      // extra unrelated fields must not break reading.
      amount: "1000.00",
    })
    expect(signature).toEqual({
      counterpartyKey: "CZ12345678",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
      commodityCode: null,
      isAdvance: false,
    })
  })

  it("reads the §92 commodity code when present (splits domestic reverse-charge sub-cases)", () => {
    const signature = readCorrectionSignature({
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "GOODS",
      jurisdiction: "REVERSE_CHARGE",
      commodityCode: "4", // stavební-montážní práce (§92e)
    })
    expect(signature?.commodityCode).toBe("4")
  })

  it("derives isAdvance=true from supplyKind ADVANCE", () => {
    const signature = readCorrectionSignature({
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "ADVANCE",
      jurisdiction: "DOMESTIC",
    })
    expect(signature?.isAdvance).toBe(true)
  })

  it("derives isAdvance=true from a §37a advanceSettlement flag even when supplyKind is a real supply", () => {
    // A §37a final-settlement doc carries the REAL supply kind (SERVICES) but nets an advance — it
    // must NOT collapse into a plain-SERVICES cluster. The advanceSettlement flag is what separates
    // them (supplyKind alone is already a base fact and would be redundant).
    const signature = readCorrectionSignature({
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
      advanceSettlement: true,
    })
    expect(signature?.isAdvance).toBe(true)
  })

  it.each([
    [
      "missing counterpartyKey",
      {
        direction: "RECEIVED",
        supplyKind: "SERVICES",
        jurisdiction: "DOMESTIC",
      },
    ],
    [
      "empty counterpartyKey",
      {
        counterpartyKey: "",
        direction: "RECEIVED",
        supplyKind: "SERVICES",
        jurisdiction: "DOMESTIC",
      },
    ],
    [
      "invalid direction",
      {
        counterpartyKey: "CZ1",
        direction: "SIDEWAYS",
        supplyKind: "SERVICES",
        jurisdiction: "DOMESTIC",
      },
    ],
    [
      "invalid supplyKind",
      {
        counterpartyKey: "CZ1",
        direction: "RECEIVED",
        supplyKind: "MAGIC",
        jurisdiction: "DOMESTIC",
      },
    ],
    [
      "invalid jurisdiction",
      {
        counterpartyKey: "CZ1",
        direction: "RECEIVED",
        supplyKind: "SERVICES",
        jurisdiction: "MOON",
      },
    ],
    [
      "non-string counterpartyKey",
      {
        counterpartyKey: 123,
        direction: "RECEIVED",
        supplyKind: "SERVICES",
        jurisdiction: "DOMESTIC",
      },
    ],
  ])(
    "fails closed (returns null) on a bad BASE fact, never guesses: %s",
    (_name, input) => {
      expect(
        readCorrectionSignature(input as Record<string, unknown>),
      ).toBeNull()
    },
  )

  it("never fails on a bad sub-fact — commodityCode reads as null, isAdvance stays a boolean", () => {
    const signature = readCorrectionSignature({
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
      commodityCode: 92, // wrong type — degrades to null, never nulls the whole signature
      advanceSettlement: "yes", // not === true — reads as false
    })
    expect(signature).not.toBeNull()
    expect(signature?.commodityCode).toBeNull()
    expect(signature?.isAdvance).toBe(false)
  })
})

describe("signatureKey", () => {
  it("is stable for identical signatures and distinct for differing base facts", () => {
    const a = {
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    const b = {
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    const c = {
      counterpartyKey: "CZ1",
      direction: "ISSUED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    expect(signatureKey(a)).toBe(signatureKey(b))
    expect(signatureKey(a)).not.toBe(signatureKey(c))
  })

  it("keys distinctly on the §92 commodity code (does not over-cluster two different §92 supplies)", () => {
    const base = {
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "GOODS",
      jurisdiction: "REVERSE_CHARGE",
    } as const
    const gold = { ...base, commodityCode: "1" } // zlato §92b
    const construction = { ...base, commodityCode: "4" } // stavební §92e
    expect(signatureKey(gold)).not.toBe(signatureKey(construction))
  })

  it("keys distinctly on the §37a advance discriminator (advance/settlement vs plain invoice)", () => {
    const base = {
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    const plain = { ...base, isAdvance: false }
    const settlement = { ...base, isAdvance: true }
    expect(signatureKey(plain)).not.toBe(signatureKey(settlement))
  })

  it("a signature built without the sub-facts keys identically to one with the null/false defaults", () => {
    const bare = {
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    const explicit = { ...bare, commodityCode: null, isAdvance: false } as const
    expect(signatureKey(bare)).toBe(signatureKey(explicit))
  })

  it("round-trips as valid JSON (the JSON-tuple form, not a naive delimiter join)", () => {
    const withPipe = {
      counterpartyKey: "CZ1|weird|name",
      direction: "ISSUED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    const parsed = JSON.parse(signatureKey(withPipe)) as unknown[]
    expect(parsed).toEqual([
      "CZ1|weird|name",
      "ISSUED",
      "SERVICES",
      "DOMESTIC",
      null,
      false,
    ])
  })
})
