import { describe, expect, it } from "vitest"

import betaCs from "../../messages/cs.json"
import { betaRailNav } from "./beta-nav"

describe("beta rail nav", () => {
  const items = betaRailNav("acme-sro")

  it("resolves every label key against the catalog", () => {
    for (const item of items) {
      expect(betaCs.nav).toHaveProperty(item.labelKey)
    }
  })

  it("only carries absolute, unique, non-placeholder hrefs scoped to the org", () => {
    const hrefs = items.map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/acme-sro"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("re-scopes every href when called with a different org", () => {
    const other = betaRailNav("jina-firma")
    expect(other.every((item) => item.href?.startsWith("/jina-firma"))).toBe(
      true,
    )
  })
})
