import { describe, expect, it } from "vitest"
import { buildOrgCsv } from "./org-export"

describe("buildOrgCsv", () => {
  it("emits a header + one row per org with status", () => {
    const csv = buildOrgCsv([
      {
        legalName: "Alfa s.r.o.",
        slug: "alfa",
        ico: "12345678",
        legalFormCode: "SRO",
        archived: false,
      },
      {
        legalName: "Beta",
        slug: "beta",
        ico: null,
        legalFormCode: null,
        archived: true,
      },
    ])
    const lines = csv.trimEnd().split("\n")
    expect(lines[0]).toBe("legal_name,slug,ico,legal_form,status")
    expect(lines[1]).toBe("Alfa s.r.o.,alfa,12345678,SRO,active")
    expect(lines[2]).toBe("Beta,beta,,,archived")
  })

  it("escapes commas and quotes", () => {
    const csv = buildOrgCsv([
      {
        legalName: 'Gamma, "Ltd"',
        slug: "gamma",
        ico: null,
        legalFormCode: "AS",
        archived: false,
      },
    ])
    expect(csv).toContain('"Gamma, ""Ltd""",gamma,,AS,active')
  })
})
