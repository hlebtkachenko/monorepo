import { describe, expect, it } from "vitest"

import betaCs from "../../messages/cs.json"
import { betaRailNav } from "./beta-nav"

describe("beta rail nav", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of betaRailNav) {
      expect(betaCs.nav).toHaveProperty(item.labelKey)
    }
  })

  it("only carries absolute, unique, non-placeholder hrefs", () => {
    const hrefs = betaRailNav.map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
