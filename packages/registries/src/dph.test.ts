import { describe, expect, it, vi } from "vitest"
import {
  bareTaxNumber,
  buildCrpdphEnvelope,
  lookupVatRegistry,
  parseCrpdphResponse,
} from "./dph"
import { RegistryLookupError } from "./types"

const RELIABLE_PAYER = `<?xml version="1.0"?>
<StatusNespolehlivyPlatceResponse xmlns="http://adis.mfcr.cz/rozhraniCRPDPH/">
  <status statusCode="0" statusText="OK"/>
  <statusPlatceDPH nespolehlivyPlatce="NE" cisloFu="007" dic="12345678">
    <zverejneneUcty>
      <ucet>
        <standardniUcet cislo="1234567890" kodBanky="0100"/>
      </ucet>
    </zverejneneUcty>
  </statusPlatceDPH>
</StatusNespolehlivyPlatceResponse>`

const UNRELIABLE_PAYER = `<StatusNespolehlivyPlatceResponse>
  <status statusCode="0"/>
  <statusPlatceDPH nespolehlivyPlatce="ANO" datumZverejneniNespolehlivosti="2020-01-15" dic="12345678"/>
</StatusNespolehlivyPlatceResponse>`

const NOT_FOUND = `<StatusNespolehlivyPlatceResponse>
  <status statusCode="0"/>
  <statusPlatceDPH nespolehlivyPlatce="NENALEZEN" dic="99999999"/>
</StatusNespolehlivyPlatceResponse>`

const SERVICE_ERROR = `<StatusNespolehlivyPlatceResponse>
  <status statusCode="3" statusText="Chyba vstupnich dat"/>
</StatusNespolehlivyPlatceResponse>`

describe("bareTaxNumber / buildCrpdphEnvelope", () => {
  it("strips the CZ prefix", () => {
    expect(bareTaxNumber("CZ12345678")).toBe("12345678")
    expect(bareTaxNumber("cz12345678")).toBe("12345678")
    expect(bareTaxNumber("12345678")).toBe("12345678")
  })
  it("embeds the bare number in the envelope", () => {
    expect(buildCrpdphEnvelope("CZ12345678")).toContain(
      "<urn:dic>12345678</urn:dic>",
    )
  })
})

describe("parseCrpdphResponse", () => {
  it("reads a reliable payer + bank account", () => {
    const r = parseCrpdphResponse(RELIABLE_PAYER, "CZ12345678")
    expect(r.found).toBe(true)
    expect(r.isPayer).toBe(true)
    expect(r.unreliable).toBe(false)
    expect(r.suggestedVatRegime).toBe("PAYER")
    expect(r.bankAccounts).toEqual([
      { prefix: null, number: "1234567890", bankCode: "0100" },
    ])
  })

  it("reads an unreliable payer with a publication date", () => {
    const r = parseCrpdphResponse(UNRELIABLE_PAYER, "CZ12345678")
    expect(r.unreliable).toBe(true)
    expect(r.unreliableSince).toBe("2020-01-15")
    expect(r.isPayer).toBe(true)
  })

  it("treats NENALEZEN as a non-payer (cannot see identified persons)", () => {
    const r = parseCrpdphResponse(NOT_FOUND, "CZ99999999")
    expect(r.found).toBe(false)
    expect(r.isPayer).toBe(false)
    expect(r.unreliable).toBeNull()
    expect(r.suggestedVatRegime).toBe("NON_PAYER")
  })

  it("throws on a non-zero service status", () => {
    expect(() => parseCrpdphResponse(SERVICE_ERROR, "CZ1")).toThrow(
      RegistryLookupError,
    )
  })
})

describe("lookupVatRegistry", () => {
  it("posts the envelope and parses the response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(RELIABLE_PAYER, { status: 200 }),
    ) as unknown as typeof fetch
    const r = await lookupVatRegistry("CZ12345678", { fetchImpl })
    expect(r.isPayer).toBe(true)
  })

  it("throws on transport failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    await expect(
      lookupVatRegistry("CZ12345678", { fetchImpl }),
    ).rejects.toBeInstanceOf(RegistryLookupError)
  })
})
