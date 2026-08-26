import { describe, expect, it } from "vitest"

import betaCs from "../../messages/cs.json"
import { betaRailNav, type BetaRailItem } from "./beta-nav"

function items(entries: BetaRailItem[]) {
  return entries.filter(
    (entry): entry is Exclude<BetaRailItem, "separator"> =>
      entry !== "separator",
  )
}

describe("beta rail nav", () => {
  const entries = betaRailNav("acme-sro")

  it("resolves every label key against the catalog", () => {
    for (const item of items(entries)) {
      expect(betaCs.nav).toHaveProperty(item.labelKey)
    }
  })

  it("only carries absolute, unique, non-placeholder hrefs scoped to the org", () => {
    const hrefs = items(entries).map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/acme-sro"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("re-scopes every href when called with a different org", () => {
    const other = betaRailNav("jina-firma")
    expect(
      items(other).every((item) => item.href?.startsWith("/jina-firma")),
    ).toBe(true)
  })

  it("hides Pro účetní from every non-owner viewer", () => {
    expect(entries).toEqual(betaRailNav("acme-sro", { isOwner: false }))
    expect(items(entries).some((item) => item.labelKey === "ucetni")).toBe(
      false,
    )
    expect(entries).not.toContain("separator")
  })

  it("shows Pro účetní, behind a separator, only for the owner", () => {
    const ownerEntries = betaRailNav("acme-sro", { isOwner: true })

    expect(ownerEntries).toContain("separator")
    const ucetni = items(ownerEntries).find(
      (item) => item.labelKey === "ucetni",
    )
    expect(ucetni?.href).toBe("/acme-sro/pro-ucetni/zpracovani")
    expect(ucetni?.icon).toBe("Briefcase")

    // Every href stays absolute, unique and org-scoped with the extra entry too.
    const hrefs = items(ownerEntries).map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/acme-sro"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
