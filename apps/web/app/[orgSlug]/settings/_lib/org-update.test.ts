import { describe, expect, it } from "vitest"
import { collectOrgUpdates, dataBoxError } from "./org-update"

describe("collectOrgUpdates", () => {
  it("maps present fields to columns and trims", () => {
    const pairs = collectOrgUpdates({
      legalName: "  Alfa s.r.o.  ",
      taxOfficeCode: "007",
    })
    expect(pairs).toEqual([
      ["legal_name", "Alfa s.r.o."],
      ["tax_office_code", "007"],
    ])
  })

  it("maps the identity/address fields added for the settings pages", () => {
    const pairs = collectOrgUpdates({
      legalFormCode: "112",
      registeredHouseNumber: "12",
      registeredOrientationNumber: "3a",
    })
    expect(pairs).toEqual([
      ["legal_form_code", "112"],
      ["registered_house_number", "12"],
      ["registered_orientation_number", "3a"],
    ])
  })

  it("skips absent fields but clears empty strings to null", () => {
    const pairs = collectOrgUpdates({ website: "", contactEmail: "a@b.cz" })
    // Order follows the field→column map (contact_email before website).
    expect(pairs).toEqual([
      ["contact_email", "a@b.cz"],
      ["website", null],
    ])
  })

  it("returns nothing for an empty patch", () => {
    expect(collectOrgUpdates({})).toEqual([])
  })
})

describe("dataBoxError", () => {
  it("accepts empty (clears the value)", () => {
    expect(dataBoxError("")).toBeNull()
    expect(dataBoxError("   ")).toBeNull()
  })

  it("accepts a 7-char lowercase alphanumeric id", () => {
    expect(dataBoxError("ab3cd9z")).toBeNull()
    expect(dataBoxError("  ab3cd9z  ")).toBeNull()
  })

  it("rejects wrong length or illegal characters", () => {
    expect(dataBoxError("abc")).toBe("dataBoxFormat")
    expect(dataBoxError("ABCDEFG")).toBe("dataBoxFormat")
    expect(dataBoxError("ab3cd9z1")).toBe("dataBoxFormat")
    expect(dataBoxError("ab-cd9z")).toBe("dataBoxFormat")
  })
})
