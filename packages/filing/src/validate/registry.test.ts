import { describe, it, expect } from "vitest"

import { resolveSchema, type FilingType } from "./registry"

describe("resolveSchema", () => {
  it("resolves a registered (filingType, version) pair", () => {
    const set = resolveSchema("dppo", "05.01.01")
    expect(set.main.fileName).toBe("dppdp9_epo2.xsd")
    expect(set.main.contents).toContain("DPPDP9")
  })

  it("throws for an unregistered version", () => {
    expect(() => resolveSchema("dppo", "99.99.99")).toThrow(
      /no vendored schema registered/,
    )
  })

  it("does not dispatch to an Object.prototype method for a crafted version", () => {
    // The lookup key embeds `version`; with a plain object, a value like "constructor"
    // or "toString" would resolve to a prototype function and be invoked. The Map-backed
    // registry must instead reject it as unregistered.
    for (const version of [
      "constructor",
      "toString",
      "hasOwnProperty",
      "__proto__",
    ]) {
      expect(() => resolveSchema("isdoc" as FilingType, version)).toThrow(
        /no vendored schema registered/,
      )
    }
  })
})
