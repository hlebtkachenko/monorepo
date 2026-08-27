import { describe, expect, it } from "vitest"

import { formMoney, formOptionalMoney } from "./input"

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

/**
 * The regression these cover: Majetek renders every amount as `650 000,00 Kč`
 * and then refused that exact string back, so the create form answered
 * "Neplatný vstup." for a figure the client had just read off the Přehled.
 *
 * The two directions are tested together on purpose. Widening a money gate is
 * only safe if what it still refuses is pinned down in the same place — the
 * accept cases below would otherwise be satisfied by simply deleting the gate.
 */

describe("formMoney — Czech-written amounts", () => {
  it("accepts the format the portal itself renders", () => {
    // U+00A0 and U+202F are what Intl.NumberFormat("cs-CZ") actually emits
    // between groups; an ASCII space is what a person types.
    expect(formMoney(fd({ v: "150 000,50" }), "v")).toBe("150000.50")
    expect(formMoney(fd({ v: "650\u00a0000,00" }), "v")).toBe("650000.00")
    expect(formMoney(fd({ v: "12\u202f345,6" }), "v")).toBe("12345.6")
    expect(formMoney(fd({ v: "-1 200,50" }), "v")).toBe("-1200.50")
  })

  it("treats dots as grouping only when a comma proves they were", () => {
    expect(formMoney(fd({ v: "1.234,56" }), "v")).toBe("1234.56")
    // No comma: the dot is still a decimal point, so this is three decimal
    // places and stays a refusal rather than being guessed to mean 1234.
    expect(formMoney(fd({ v: "1.234" }), "v")).toBeNull()
  })

  it("still accepts what it always accepted", () => {
    expect(formMoney(fd({ v: "150000" }), "v")).toBe("150000")
    expect(formMoney(fd({ v: "150000.50" }), "v")).toBe("150000.50")
    expect(formMoney(fd({ v: "-42" }), "v")).toBe("-42")
  })

  it("still refuses everything that is not numeric(14,2) syntax", () => {
    for (const bad of [
      "",
      "abc",
      "1,23,45",
      "150000,555",
      "1234567890123",
      "12,5 Kč",
      "-",
      ",",
      "1e5",
      "0x10",
    ]) {
      expect(formMoney(fd({ v: bad }), "v")).toBeNull()
    }
  })

  it("refuses a missing field", () => {
    expect(formMoney(fd({}), "v")).toBeNull()
  })
})

describe("formOptionalMoney", () => {
  it("normalises the same way, and keeps empty meaning 'not provided'", () => {
    expect(formOptionalMoney(fd({ v: "650 000,00" }), "v")).toBe("650000.00")
    expect(formOptionalMoney(fd({ v: "" }), "v")).toBeNull()
    expect(formOptionalMoney(fd({ v: "   " }), "v")).toBeNull()
    expect(formOptionalMoney(fd({}), "v")).toBeNull()
  })

  it("still reports a malformed amount as undefined, not as absent", () => {
    // The distinction the action layer depends on: `undefined` is refused with
    // "Neplatný vstup.", `null` is written as a real absence.
    expect(formOptionalMoney(fd({ v: "abc" }), "v")).toBeUndefined()
    expect(formOptionalMoney(fd({ v: "1.234" }), "v")).toBeUndefined()
  })
})
