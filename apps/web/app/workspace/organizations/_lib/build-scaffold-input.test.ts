import { describe, expect, it } from "vitest"
import { buildScaffoldInput } from "./build-scaffold-input"
import { OrgWizardSchema, WIZARD_DEFAULTS } from "./wizard-schema"

const SCOPE = {
  workspaceId: "00000000-0000-7000-8000-000000000001",
  ownerUserId: "00000000-0000-7000-8000-000000000002",
  idempotencyKey: "wizard-idem-key-123",
}

function values(overrides: Record<string, unknown>) {
  return OrgWizardSchema.parse({
    ...WIZARD_DEFAULTS,
    legalName: "Alfa s.r.o.",
    ...overrides,
  })
}

describe("OrgWizardSchema", () => {
  it("parses a valid form payload", () => {
    const v = values({})
    expect(v.vatRegimeCode).toBe("NON_PAYER")
    expect(v.fiscalYearStartMonth).toBe(1)
    expect(v.entityKind).toBe("NEW_ENTITY")
    expect(v.legalSubjectKind).toBe("for_profit")
  })

  it("rejects a bad IČO", () => {
    expect(() => values({ ico: "12" })).toThrow()
  })
})

describe("buildScaffoldInput", () => {
  it("injects scope and drops empty optional strings", () => {
    const input = buildScaffoldInput(
      values({ ico: "", dic: "", registeredAt: "2026-03-15" }),
      SCOPE,
    )
    expect(input.workspaceId).toBe(SCOPE.workspaceId)
    expect(input.ownerUserId).toBe(SCOPE.ownerUserId)
    expect(input.idempotencyKey).toBe(SCOPE.idempotencyKey)
    expect(input.ico).toBeUndefined()
    expect(input.dic).toBeUndefined()
    expect(input.registeredAt).toBe("2026-03-15")
    expect(input.address).toBeUndefined()
  })

  it("groups address only when at least one field is set", () => {
    const input = buildScaffoldInput(
      values({ city: "Praha", postalCode: "17000" }),
      SCOPE,
    )
    expect(input.address).toMatchObject({
      city: "Praha",
      postalCode: "17000",
    })
  })

  it("carries a filing period only for a VAT payer", () => {
    const payer = buildScaffoldInput(
      values({ vatRegimeCode: "PAYER", dic: "CZ12345678" }),
      SCOPE,
    )
    expect(payer.vatFilingPeriod).toBe("MONTHLY")

    const nonPayer = buildScaffoldInput(
      values({ vatRegimeCode: "NON_PAYER", vatFilingPeriod: "QUARTERLY" }),
      SCOPE,
    )
    expect(nonPayer.vatFilingPeriod).toBeUndefined()
  })

  it("maps the authorized person only when both names are set", () => {
    const withSigner = buildScaffoldInput(
      values({
        signerGivenName: "Jan",
        signerFamilyName: "Novák",
        signerPosition: "jednatel",
      }),
      SCOPE,
    )
    expect(withSigner.authorizedPerson).toEqual({
      givenName: "Jan",
      familyName: "Novák",
      position: "jednatel",
    })

    const partial = buildScaffoldInput(
      values({ signerGivenName: "Jan", signerFamilyName: "" }),
      SCOPE,
    )
    expect(partial.authorizedPerson).toBeUndefined()
  })

  it("maps OSS only when scheme + valid-from are both set", () => {
    const withOss = buildScaffoldInput(
      values({ ossScheme: "UNION", ossValidFrom: "2026-01-01" }),
      SCOPE,
    )
    expect(withOss.oss).toEqual({ scheme: "UNION", validFrom: "2026-01-01" })

    const noDate = buildScaffoldInput(values({ ossScheme: "UNION" }), SCOPE)
    expect(noDate.oss).toBeUndefined()
  })

  it("cleans extended config fields", () => {
    const input = buildScaffoldInput(
      values({ dataBoxId: "abc1234", taxOfficeCode: "007", contactEmail: "" }),
      SCOPE,
    )
    expect(input.dataBoxId).toBe("abc1234")
    expect(input.taxOfficeCode).toBe("007")
    expect(input.contactEmail).toBeUndefined()
  })
})
