import { describe, expect, it } from "vitest"

import { readCorrectionSignature, signatureKey } from "./signature"

describe("readCorrectionSignature", () => {
  it("reads all 4 facts off a well-formed input", () => {
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
    })
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
  ])("fails closed (returns null), never guesses: %s", (_name, input) => {
    expect(readCorrectionSignature(input as Record<string, unknown>)).toBeNull()
  })
})

describe("signatureKey", () => {
  it("is stable for identical signatures and distinct for differing ones", () => {
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

  it("round-trips as valid JSON (the JSON-tuple form, not a naive delimiter join)", () => {
    const withPipe = {
      counterpartyKey: "CZ1|weird|name",
      direction: "ISSUED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    } as const
    const parsed = JSON.parse(signatureKey(withPipe)) as unknown[]
    expect(parsed).toEqual(["CZ1|weird|name", "ISSUED", "SERVICES", "DOMESTIC"])
  })
})
