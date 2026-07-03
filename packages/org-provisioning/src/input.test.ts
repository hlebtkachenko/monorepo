import { describe, expect, it } from "vitest"
import { ScaffoldInput } from "./input"

// slugify has its own comprehensive suite in ./slug.test.ts.

const WS = "00000000-0000-7000-8000-000000000001"
const USER = "00000000-0000-7000-8000-000000000002"

describe("ScaffoldInput", () => {
  it("applies defaults", () => {
    const parsed = ScaffoldInput.parse({
      workspaceId: WS,
      ownerUserId: USER,
      idempotencyKey: "idem-key-123",
      legalName: "Acme s.r.o.",
      personKind: "legal_entity",
      legalFormCode: "SRO",
      entityKind: "NEW_ENTITY",
      fiscalYear: 2026,
    })
    expect(parsed.accountingCurrency).toBe("CZK")
    expect(parsed.fiscalYearStartMonth).toBe(1)
    expect(parsed.vatRegimeCode).toBe("NON_PAYER")
    expect(parsed.legalSubjectKind).toBe("for_profit")
    expect(parsed.inPublicRegister).toBe(false)
    expect(parsed.businessActivityCodes).toEqual([])
  })

  it("rejects a missing legal name", () => {
    expect(() =>
      ScaffoldInput.parse({
        workspaceId: WS,
        ownerUserId: USER,
        idempotencyKey: "idem-key-123",
        personKind: "legal_entity",
        legalFormCode: "SRO",
        entityKind: "NEW_ENTITY",
      }),
    ).toThrow()
  })

  it("rejects a malformed IČO", () => {
    expect(() =>
      ScaffoldInput.parse({
        workspaceId: WS,
        ownerUserId: USER,
        idempotencyKey: "idem-key-123",
        legalName: "Acme",
        personKind: "legal_entity",
        legalFormCode: "SRO",
        entityKind: "NEW_ENTITY",
        ico: "12",
      }),
    ).toThrow()
  })

  const base = {
    workspaceId: WS,
    ownerUserId: USER,
    idempotencyKey: "idem-key-123",
    legalName: "Acme s.r.o.",
    personKind: "legal_entity" as const,
    legalFormCode: "SRO",
    entityKind: "NEW_ENTITY" as const,
    fiscalYear: 2026,
  }

  it("accepts the extended config fields", () => {
    const parsed = ScaffoldInput.parse({
      ...base,
      dataBoxId: "abc1234",
      contactEmail: "info@acme.cz",
      deliveryAddressLines: ["Acme s.r.o.", "P.O. Box 1", "301 00 Plzeň"],
      taxOfficeCode: "007",
      registryFileNumber: "C 12345, Krajský soud v Plzni",
      address: {
        street: "Stehlíkova 12",
        houseNumber: "12",
        region: "Plzeňský kraj",
      },
      authorizedPerson: {
        givenName: "Jan",
        familyName: "Novák",
        position: "jednatel",
      },
      oss: { scheme: "UNION", validFrom: "2026-01-01" },
    })
    expect(parsed.dataBoxId).toBe("abc1234")
    expect(parsed.deliveryAddressLines).toHaveLength(3)
    expect(parsed.authorizedPerson?.familyName).toBe("Novák")
    expect(parsed.oss?.scheme).toBe("UNION")
    expect(parsed.address?.region).toBe("Plzeňský kraj")
  })

  it("rejects a malformed data-box id", () => {
    expect(() =>
      ScaffoldInput.parse({ ...base, dataBoxId: "ABC1234" }),
    ).toThrow()
    expect(() =>
      ScaffoldInput.parse({ ...base, dataBoxId: "abc123" }),
    ).toThrow()
  })

  it("rejects more than 3 delivery lines", () => {
    expect(() =>
      ScaffoldInput.parse({
        ...base,
        deliveryAddressLines: ["a", "b", "c", "d"],
      }),
    ).toThrow()
  })
})
