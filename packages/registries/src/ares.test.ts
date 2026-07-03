import { describe, expect, it, vi } from "vitest"
import { lookupAres, normalizeAresResponse } from "./ares"
import { RegistryLookupError } from "./types"

// Recorded-shape ARES v3 economic-subject payloads (trimmed to read fields).
const SRO_PAYLOAD = {
  ico: "12345678",
  obchodniJmeno: "Alfa a.s.",
  pravniForma: "121",
  dic: "CZ12345678",
  datumVzniku: "2003-12-15",
  czNace: ["4791", 620100],
  financniUrad: "007",
  sidlo: {
    nazevUlice: "Jankovcova",
    cisloDomovni: 1522,
    cisloOrientacni: "53",
    cisloOrientacniPismeno: "a",
    nazevObce: "Praha",
    nazevKraje: "Hlavní město Praha",
    psc: 17000,
    kodStatu: "CZ",
  },
  adresaDorucovaci: {
    radekAdresy1: "Alfa a.s.",
    radekAdresy2: "Jankovcova 1522/53",
    radekAdresy3: "170 00 Praha",
  },
  dalsiUdaje: [
    { datovyZdroj: "RES" },
    { datovyZdroj: "VR", spisovaZnacka: "B 1234, Městský soud v Praze" },
  ],
  seznamRegistraci: { stavZdrojeVr: "AKTIVNI", stavZdrojeRes: "AKTIVNI" },
}

const OSVC_NOT_IN_OR = {
  ico: "01234567",
  obchodniJmeno: "Jan Novák",
  pravniForma: "101",
  datumVzniku: "2015-06-01",
  sidlo: { nazevObce: "Brno", psc: 60200, kodStatu: "CZ" },
  seznamRegistraci: { stavZdrojeVr: "NEEXISTUJICI", stavZdrojeRzp: "AKTIVNI" },
}

describe("normalizeAresResponse", () => {
  it("maps an a.s. with public-register + tax registration", () => {
    const p = normalizeAresResponse(SRO_PAYLOAD)
    expect(p.ico).toBe("12345678")
    expect(p.legalName).toBe("Alfa a.s.")
    expect(p.legalFormCsuCode).toBe("121")
    expect(p.legalFormCode).toBe("AS")
    expect(p.personKind).toBe("legal_entity")
    expect(p.dic).toBe("CZ12345678")
    expect(p.inPublicRegister).toBe(true)
    expect(p.registeredAt).toBe("2003-12-15")
    expect(p.naceCodes).toEqual(["4791", "620100"])
    expect(p.address).toEqual({
      street: "Jankovcova 1522/53",
      houseNumber: "1522",
      orientationNumber: "53a",
      city: "Praha",
      postalCode: "17000",
      region: "Hlavní město Praha",
      countryCode: "CZ",
    })
    expect(p.taxOfficeCode).toBe("007")
    expect(p.registryFileNumber).toBe("B 1234, Městský soud v Praze")
    expect(p.deliveryAddressLines).toEqual([
      "Alfa a.s.",
      "Jankovcova 1522/53",
      "170 00 Praha",
    ])
  })

  it("maps an OSVČ not in the public register (no DIČ)", () => {
    const p = normalizeAresResponse(OSVC_NOT_IN_OR)
    expect(p.legalFormCode).toBe("OSVC")
    expect(p.personKind).toBe("natural_person")
    expect(p.inPublicRegister).toBe(false)
    expect(p.dic).toBeNull()
    expect(p.address.street).toBe("Brno") // falls back to obec when no street
  })

  it("flags a natural person zapsaná v OR (forces double-entry downstream)", () => {
    const p = normalizeAresResponse({
      ...OSVC_NOT_IN_OR,
      seznamRegistraci: { stavZdrojeVr: "AKTIVNI" },
    })
    expect(p.personKind).toBe("natural_person")
    expect(p.inPublicRegister).toBe(true)
  })

  it("leaves an unmapped ČSÚ code as null legalFormCode", () => {
    const p = normalizeAresResponse({ ...SRO_PAYLOAD, pravniForma: "999" })
    expect(p.legalFormCsuCode).toBe("999")
    expect(p.legalFormCode).toBeNull()
  })
})

describe("lookupAres", () => {
  it("rejects a malformed IČO before any fetch", async () => {
    await expect(lookupAres("123")).rejects.toBeInstanceOf(RegistryLookupError)
  })

  it("fetches and normalizes on 200", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(SRO_PAYLOAD), { status: 200 }),
    ) as unknown as typeof fetch
    const p = await lookupAres("12345678", { fetchImpl })
    expect(p.legalFormCode).toBe("AS")
  })

  it("throws RegistryLookupError on a non-200", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("not found", { status: 404 }),
    ) as unknown as typeof fetch
    await expect(lookupAres("12345678", { fetchImpl })).rejects.toBeInstanceOf(
      RegistryLookupError,
    )
  })
})
