/**
 * The four ARES rules of spec §2.10, asserted directly rather than inferred
 * from a form: suggest-never-write, per-field accept, `dic: null` never touches
 * the VAT regime, and the IČO is left-padded.
 */
import { describe, expect, it } from "vitest"

import type { AresProfile } from "@workspace/registries"

import type { OrganizationIdentityView } from "@/lib/data/projections"

import {
  ARES_FIELDS,
  IDENTITY_FIELDS,
  acceptedPatch,
  aresSuggestions,
  isAresField,
  normalizeIco,
} from "./suggestions"

function profile(overrides: Partial<AresProfile> = {}): AresProfile {
  return {
    ico: "25012345",
    legalName: "Stavby Novák s.r.o.",
    legalFormCsuCode: "112",
    legalFormCode: "sro",
    personKind: "legal_entity",
    dic: "CZ25012345",
    inPublicRegister: true,
    registeredAt: "2010-03-01",
    naceCodes: ["41200"],
    address: {
      street: "Jankovcova 1522/53",
      houseNumber: "1522",
      orientationNumber: "53",
      city: "Praha",
      postalCode: "17000",
      region: "Hlavní město Praha",
      countryCode: "CZ",
    },
    taxOfficeCode: "451",
    registryFileNumber: "C 12345, Městský soud v Praze",
    deliveryAddressLines: [],
    ...overrides,
  }
}

function identity(
  overrides: Partial<OrganizationIdentityView> = {},
): OrganizationIdentityView {
  return {
    slug: "novak",
    legalName: "Novák",
    ico: "25012345",
    dic: null,
    vatRegime: "platce",
    vatRegisteredFrom: "2011-01-01",
    registeredStreet: null,
    registeredHouseNumber: null,
    registeredOrientationNumber: null,
    registeredCity: null,
    registeredPostalCode: null,
    registeredCountryCode: "CZ",
    dataBoxId: null,
    courtFileNumber: null,
    taxOfficeCode: null,
    bankAccountPrefix: null,
    bankAccountNumber: null,
    bankCode: null,
    iban: null,
    bic: null,
    contactEmail: null,
    contactPhone: null,
    aresFetchedAt: null,
    ...overrides,
  }
}

describe("normalizeIco — spec §2.10 left-pad", () => {
  it("left-pads a short IČO to 8 digits", () => {
    expect(normalizeIco("1234567")).toEqual({ ok: true, ico: "01234567" })
    expect(normalizeIco("45")).toEqual({ ok: true, ico: "00000045" })
  })

  it("keeps an already-8-digit IČO untouched", () => {
    expect(normalizeIco("25012345")).toEqual({ ok: true, ico: "25012345" })
  })

  it("accepts the separators a Czech IČO is written with", () => {
    expect(normalizeIco("250 12 345")).toEqual({ ok: true, ico: "25012345" })
  })

  it("reads an empty field as 'no IČO', not as an error", () => {
    // A book can legitimately exist before the company is registered.
    expect(normalizeIco("")).toEqual({ ok: true, ico: null })
    expect(normalizeIco(null)).toEqual({ ok: true, ico: null })
    expect(normalizeIco(undefined)).toEqual({ ok: true, ico: null })
  })

  it("refuses anything that cannot be an IČO rather than mangling it", () => {
    // Padding a 9-digit typo would silently produce ANOTHER company's number.
    expect(normalizeIco("123456789")).toEqual({ ok: false, reason: "invalid" })
    expect(normalizeIco("CZ25012345")).toEqual({ ok: false, reason: "invalid" })
    expect(normalizeIco("abc")).toEqual({ ok: false, reason: "invalid" })
  })
})

describe("aresSuggestions — suggest, never write", () => {
  it("returns a suggestion per differing field and mutates nothing", () => {
    const current = identity()
    const before = { ...current }

    const suggestions = aresSuggestions(current, profile())

    expect(current).toEqual(before)
    expect(suggestions.map((s) => s.field).sort()).toEqual(
      [
        "courtFileNumber",
        "dic",
        "legalName",
        "registeredCity",
        "registeredHouseNumber",
        "registeredOrientationNumber",
        "registeredPostalCode",
        "registeredStreet",
        "taxOfficeCode",
      ].sort(),
    )
    expect(suggestions.find((s) => s.field === "legalName")).toEqual({
      field: "legalName",
      current: "Novák",
      suggested: "Stavby Novák s.r.o.",
    })
  })

  it("offers nothing for a field ARES agrees with", () => {
    // `registeredCountryCode` is already "CZ" on both sides.
    const suggestions = aresSuggestions(identity(), profile())
    expect(suggestions.some((s) => s.field === "registeredCountryCode")).toBe(
      false,
    )
  })

  it("ignores a difference that is only whitespace", () => {
    const suggestions = aresSuggestions(
      identity({ registeredCity: "  Praha  " }),
      profile(),
    )
    expect(suggestions.some((s) => s.field === "registeredCity")).toBe(false)
  })

  it("offers nothing for a field ARES has no answer for", () => {
    const suggestions = aresSuggestions(
      identity(),
      profile({ registryFileNumber: null, taxOfficeCode: null }),
    )
    expect(suggestions.some((s) => s.field === "courtFileNumber")).toBe(false)
    expect(suggestions.some((s) => s.field === "taxOfficeCode")).toBe(false)
  })

  it("returns an empty list when the book already matches the registry", () => {
    const p = profile()
    const matching = identity({
      legalName: p.legalName,
      dic: p.dic,
      registeredStreet: p.address.street,
      registeredHouseNumber: p.address.houseNumber,
      registeredOrientationNumber: p.address.orientationNumber,
      registeredCity: p.address.city,
      registeredPostalCode: p.address.postalCode,
      courtFileNumber: p.registryFileNumber,
      taxOfficeCode: p.taxOfficeCode,
    })
    expect(aresSuggestions(matching, p)).toEqual([])
  })
})

describe("the `dic: null` rule — spec §2.10", () => {
  it("produces no suggestion for dic when ARES has none", () => {
    const suggestions = aresSuggestions(
      identity({ dic: "CZ25012345" }),
      profile({ dic: null }),
    )
    expect(suggestions.some((s) => s.field === "dic")).toBe(false)
  })

  it("never names vat_regime, in any spelling, on any input", () => {
    // Structural, not incidental: the VAT regime belongs to /admin (§3.5), so
    // there must be no path from a registry answer to it. Both the field set
    // ARES may speak about AND the writable set as a whole are checked, because
    // a suggestion can only ever write a field that is in both.
    for (const name of ARES_FIELDS) {
      expect(name.toLowerCase()).not.toContain("vat")
    }
    for (const name of IDENTITY_FIELDS) {
      expect(name.toLowerCase()).not.toContain("vat")
    }

    const suggestions = aresSuggestions(
      identity({ vatRegime: "platce" }),
      profile({ dic: null }),
    )
    for (const suggestion of suggestions) {
      expect(suggestion.field.toLowerCase()).not.toContain("vat")
    }
  })

  it("keeps ARES_FIELDS a strict subset of the writable set", () => {
    for (const field of ARES_FIELDS) {
      expect(IDENTITY_FIELDS).toContain(field)
    }
    // The lookup key is not a suggestion about itself.
    expect(ARES_FIELDS as readonly string[]).not.toContain("ico")
  })
})

describe("acceptedPatch — per-field accept", () => {
  const suggestions = aresSuggestions(identity(), profile())

  it("writes only the fields that were ticked", () => {
    const patch = acceptedPatch(suggestions, ["legalName"])
    expect(patch).toEqual({ legalName: "Stavby Novák s.r.o." })
  })

  it("writes every field when all are ticked ('přijmout vše')", () => {
    const patch = acceptedPatch(
      suggestions,
      suggestions.map((s) => s.field),
    )
    expect(Object.keys(patch).sort()).toEqual(
      suggestions.map((s) => s.field).sort(),
    )
  })

  it("writes nothing when nothing was ticked", () => {
    expect(acceptedPatch(suggestions, [])).toEqual({})
  })

  it("cannot be made to write a field that was not suggested", () => {
    // The names come from a request; the VALUES come from the server's own
    // derivation. A name with no matching suggestion has no value to write.
    const patch = acceptedPatch(suggestions, [
      "registeredCountryCode",
      "contactEmail",
      "vatRegime",
    ])
    expect(patch).toEqual({})
  })

  it("ignores a duplicated acceptance rather than writing twice", () => {
    expect(acceptedPatch(suggestions, ["dic", "dic"])).toEqual({
      dic: "CZ25012345",
    })
  })
})

describe("isAresField", () => {
  it("accepts exactly the declared field names", () => {
    expect(isAresField("legalName")).toBe(true)
    expect(isAresField("dic")).toBe(true)
    expect(isAresField("vatRegime")).toBe(false)
    expect(isAresField("ico")).toBe(false)
    expect(isAresField("__proto__")).toBe(false)
  })
})
