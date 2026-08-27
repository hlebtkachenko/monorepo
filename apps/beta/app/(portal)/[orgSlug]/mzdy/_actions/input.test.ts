import { describe, expect, it } from "vitest"

import {
  formBooleanChoice,
  formContractType,
  formDate,
  formUuid,
} from "./input"

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe("formContractType — the closed list, never a cast", () => {
  it("accepts every value on `beta_payroll_contract_type`", () => {
    expect(formContractType(fd({ v: "hpp" }), "v")).toBe("hpp")
    expect(formContractType(fd({ v: "dpc" }), "v")).toBe("dpc")
    expect(formContractType(fd({ v: "dpp" }), "v")).toBe("dpp")
  })

  it("refuses anything not on the list, including a posted casing mismatch", () => {
    expect(formContractType(fd({ v: "HPP" }), "v")).toBeNull()
    expect(formContractType(fd({ v: "svarc" }), "v")).toBeNull()
    expect(formContractType(fd({}), "v")).toBeNull()
  })
})

describe("formBooleanChoice — a missing field is never `false`", () => {
  it("reads the explicit strings", () => {
    expect(formBooleanChoice(fd({ active: "true" }), "active")).toBe(true)
    expect(formBooleanChoice(fd({ active: "false" }), "active")).toBe(false)
  })

  it("returns null when nothing was posted", () => {
    expect(formBooleanChoice(fd({}), "active")).toBeNull()
  })
})

describe("formDate — the input[type=date] shape", () => {
  it("accepts YYYY-MM-DD and refuses anything else", () => {
    expect(formDate(fd({ v: "2026-03-01" }), "v")).toBe("2026-03-01")
    expect(formDate(fd({ v: "1.3.2026" }), "v")).toBeNull()
    expect(formDate(fd({}), "v")).toBeNull()
  })
})

describe("formUuid — a malformed id is a refusal, not a 500", () => {
  it("accepts a v7 uuid and refuses garbage", () => {
    const id = "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa"
    expect(formUuid(fd({ v: id }), "v")).toBe(id)
    expect(formUuid(fd({ v: "not-a-uuid" }), "v")).toBeNull()
  })
})
