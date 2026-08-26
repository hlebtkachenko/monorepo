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

  it("shows Finance to every role — Dluhy a platby is client-visible", () => {
    const finance = items(entries).find((item) => item.labelKey === "finance")
    expect(finance?.href).toBe("/acme-sro/finance")
    expect(finance?.icon).toBe("CreditCard")

    // Present for a guest too: §5 makes guest an external VIEWER of the same
    // client-visible data, and §2.4's Dluhy a platby is exactly that.
    expect(
      items(betaRailNav("acme-sro", { isOwner: false })).some(
        (item) => item.labelKey === "finance",
      ),
    ).toBe(true)
  })

  it("shows Výkazy to every role, between Finance and Majetek", () => {
    const labels = items(entries).map((item) => item.labelKey)
    expect(labels.indexOf("vykazy")).toBe(labels.indexOf("finance") + 1)
    expect(labels.indexOf("majetek")).toBe(labels.indexOf("vykazy") + 1)

    const vykazy = items(entries).find((item) => item.labelKey === "vykazy")
    // Rozvaha is the module ROOT, so the rail links at the module and lands on
    // a real statement rather than on a redirect.
    expect(vykazy?.href).toBe("/acme-sro/vykazy")
    expect(vykazy?.icon).toBe("BarChart3")

    // A published statement is client-visible data (§5), so a guest sees it.
    expect(
      items(betaRailNav("acme-sro", { isOwner: false })).some(
        (item) => item.labelKey === "vykazy",
      ),
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
    expect(ucetni?.href).toBe("/acme-sro/pro-ucetni")
    expect(ucetni?.icon).toBe("Briefcase")

    // Every href stays absolute, unique and org-scoped with the extra entry too.
    const hrefs = items(ownerEntries).map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/acme-sro"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
