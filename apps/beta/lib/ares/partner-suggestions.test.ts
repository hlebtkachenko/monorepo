/**
 * The partner-shaped ARES reconciliation rules (spec §2.10, PR 29) — the
 * twin of `lib/ares/suggestions.test.ts`, over `partnerAresSuggestions` /
 * `partnerAcceptedPatch` instead of the organization's own pair.
 */
import { describe, expect, it } from "vitest"

import type { AresProfile } from "@workspace/registries"

import {
  PARTNER_ARES_FIELDS,
  isPartnerAresField,
  partnerAcceptedPatch,
  partnerAresSuggestions,
} from "./partner-suggestions"

function profile(overrides: Partial<AresProfile> = {}): AresProfile {
  return {
    ico: "12345678",
    legalName: "Stavebniny Novák s.r.o.",
    legalFormCsuCode: "112",
    legalFormCode: null,
    personKind: null,
    dic: "CZ12345678",
    inPublicRegister: true,
    registeredAt: "2010-01-01",
    naceCodes: [],
    address: {
      street: "Dlouhá",
      houseNumber: "123",
      orientationNumber: "45",
      city: "Praha",
      postalCode: "11000",
      countryCode: "CZ",
    },
    taxOfficeCode: "2001",
    registryFileNumber: "C 12345, Městský soud v Praze",
    deliveryAddress: null,
    ...overrides,
  } as AresProfile
}

const EMPTY_CURRENT = Object.fromEntries(
  PARTNER_ARES_FIELDS.map((field) => [field, null]),
) as Record<(typeof PARTNER_ARES_FIELDS)[number], string | null>

describe("partnerAresSuggestions — a blank create form", () => {
  it("offers every field ARES knows, since nothing is typed yet", () => {
    const suggestions = partnerAresSuggestions(EMPTY_CURRENT, profile())
    const fields = suggestions.map((s) => s.field).sort()
    expect(fields).toEqual(
      [
        "name",
        "dic",
        "street",
        "houseNumber",
        "orientationNumber",
        "city",
        "postalCode",
        "countryCode",
        "legalFormCsuCode",
        "registryFileNumber",
      ].sort(),
    )
  })

  it("never offers `ico` — it is the lookup key, not a suggestion", () => {
    const suggestions = partnerAresSuggestions(EMPTY_CURRENT, profile())
    expect(suggestions.some((s) => s.field === "ico")).toBe(false)
  })
})

describe("partnerAresSuggestions — an existing partner", () => {
  it("offers nothing when the stored row already agrees", () => {
    const current = {
      ...EMPTY_CURRENT,
      name: "Stavebniny Novák s.r.o.",
      dic: "CZ12345678",
      street: "Dlouhá",
      houseNumber: "123",
      orientationNumber: "45",
      city: "Praha",
      postalCode: "11000",
      countryCode: "CZ",
      legalFormCsuCode: "112",
      registryFileNumber: "C 12345, Městský soud v Praze",
    }
    expect(partnerAresSuggestions(current, profile())).toEqual([])
  })

  it("offers only the fields that differ", () => {
    const current = { ...EMPTY_CURRENT, name: "Stavebniny Novák s.r.o." }
    const suggestions = partnerAresSuggestions(current, profile())
    expect(suggestions.some((s) => s.field === "name")).toBe(false)
    expect(suggestions.some((s) => s.field === "dic")).toBe(true)
  })

  it("treats a trimmed match as no difference", () => {
    const current = { ...EMPTY_CURRENT, name: " Stavebniny Novák s.r.o. " }
    const suggestions = partnerAresSuggestions(
      current,
      profile({ legalName: "Stavebniny Novák s.r.o." }),
    )
    expect(suggestions.some((s) => s.field === "name")).toBe(false)
  })

  it("offers nothing for a field ARES has no answer for", () => {
    const suggestions = partnerAresSuggestions(
      EMPTY_CURRENT,
      profile({ dic: null }),
    )
    expect(suggestions.some((s) => s.field === "dic")).toBe(false)
  })

  it("has no path from a null dic to anything vat-regime shaped — the field does not exist here", () => {
    const suggestions = partnerAresSuggestions(
      EMPTY_CURRENT,
      profile({ dic: null }),
    )
    expect(suggestions.some((s) => (s.field as string).includes("vat"))).toBe(
      false,
    )
  })
})

describe("isPartnerAresField", () => {
  it("accepts every declared field and refuses everything else", () => {
    for (const field of PARTNER_ARES_FIELDS) {
      expect(isPartnerAresField(field)).toBe(true)
    }
    expect(isPartnerAresField("ico")).toBe(false)
    expect(isPartnerAresField("role")).toBe(false)
    expect(isPartnerAresField("noteInternal")).toBe(false)
  })
})

describe("partnerAcceptedPatch", () => {
  it("writes only the ticked fields, with the server's own suggested value", () => {
    const suggestions = partnerAresSuggestions(EMPTY_CURRENT, profile())
    const patch = partnerAcceptedPatch(suggestions, ["name", "city"])
    expect(Object.keys(patch).sort()).toEqual(["city", "name"])
    expect(patch.name).toBe("Stavebniny Novák s.r.o.")
    expect(patch.city).toBe("Praha")
  })

  it("ignores an accepted name that was never actually suggested", () => {
    const suggestions = partnerAresSuggestions(EMPTY_CURRENT, profile())
    const patch = partnerAcceptedPatch(suggestions, ["vatRegime"])
    expect(patch).toEqual({})
  })

  it("is empty when nothing was ticked", () => {
    const suggestions = partnerAresSuggestions(EMPTY_CURRENT, profile())
    expect(partnerAcceptedPatch(suggestions, [])).toEqual({})
  })
})
