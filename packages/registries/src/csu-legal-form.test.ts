import { describe, expect, it } from "vitest"
import { legalFormCodeFromCsu, personKindFromCsu } from "./csu-legal-form"

describe("legalFormCodeFromCsu", () => {
  it("maps common ČSÚ codes", () => {
    expect(legalFormCodeFromCsu("112")).toBe("SRO")
    expect(legalFormCodeFromCsu("121")).toBe("AS")
    expect(legalFormCodeFromCsu("101")).toBe("OSVC")
    expect(legalFormCodeFromCsu("706")).toBe("SPOLEK")
    expect(legalFormCodeFromCsu("641")).toBe("SVJ")
  })
  it("returns null for unmapped / missing codes", () => {
    expect(legalFormCodeFromCsu("999")).toBeNull()
    expect(legalFormCodeFromCsu(null)).toBeNull()
  })
})

describe("personKindFromCsu", () => {
  it("classifies natural vs legal", () => {
    expect(personKindFromCsu("101")).toBe("natural_person")
    expect(personKindFromCsu("107")).toBe("natural_person")
    expect(personKindFromCsu("112")).toBe("legal_entity")
    expect(personKindFromCsu(null)).toBeNull()
  })
})
