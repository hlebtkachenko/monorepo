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

  it("hides Asistent unless the caller was told to show it", () => {
    // The default is OFF, which is the whole point: `showAssistant` is resolved
    // on the server from `BETA_ASSISTANT_ENABLED` plus the §5 role rule, and a
    // caller that forgets to pass it gets no entry rather than an open one.
    expect(items(entries).some((item) => item.labelKey === "asistent")).toBe(
      false,
    )
    expect(
      items(betaRailNav("acme-sro", { showAssistant: false })).some(
        (item) => item.labelKey === "asistent",
      ),
    ).toBe(false)
  })

  it("places Asistent after Majetek, before the Pro účetní separator", () => {
    const shown = betaRailNav("acme-sro", {
      showAssistant: true,
      isOwner: true,
    })
    const labels = items(shown).map((item) => item.labelKey)

    expect(labels.indexOf("asistent")).toBe(labels.indexOf("majetek") + 1)
    expect(labels.indexOf("ucetni")).toBe(labels.indexOf("asistent") + 1)
    expect(shown.indexOf("separator")).toBeGreaterThan(0)

    const asistent = items(shown).find((item) => item.labelKey === "asistent")
    // The icon spec §1 names, and one every icon pack carries.
    expect(asistent?.href).toBe("/acme-sro/asistent")
    expect(asistent?.icon).toBe("MessageCircle")

    const hrefs = items(shown).map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/acme-sro"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("resolves the Asistent label key against the catalog too", () => {
    for (const item of items(
      betaRailNav("acme-sro", { showAssistant: true }),
    )) {
      expect(betaCs.nav).toHaveProperty(item.labelKey)
    }
  })

  it("hides Mzdy from a viewer with no management seat", () => {
    expect(entries).toEqual(betaRailNav("acme-sro", { isManagement: false }))
    expect(items(entries).some((item) => item.labelKey === "mzdy")).toBe(false)
  })

  it("shows Mzdy, between Výkazy and Majetek, for a management seat", () => {
    const managed = betaRailNav("acme-sro", { isManagement: true })
    const labels = items(managed).map((item) => item.labelKey)
    expect(labels.indexOf("mzdy")).toBe(labels.indexOf("vykazy") + 1)
    expect(labels.indexOf("majetek")).toBe(labels.indexOf("mzdy") + 1)

    const mzdy = items(managed).find((item) => item.labelKey === "mzdy")
    expect(mzdy?.href).toBe("/acme-sro/mzdy")
    expect(mzdy?.icon).toBe("Users")

    // Every href stays absolute, unique and org-scoped with the extra entry.
    const hrefs = items(managed).map((item) => item.href)
    expect(hrefs.every((href) => href?.startsWith("/acme-sro"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
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

  /**
   * The employee seat (spec §2.6.1, PR 33): "renders a narrowed rail: Přehled
   * (personal) · Dokumenty (own) · Moje mzda".
   *
   * It REPLACES the list rather than filtering it, so the assertions are about
   * the exact three entries — a filter that happened to produce three today
   * would silently grow a fourth the next time a module lands, which is the
   * failure this shape exists to prevent.
   */
  it("gives the employee seat exactly three entries and nothing else", () => {
    const seat = betaRailNav("acme-sro", { isEmployeeSeat: true })

    expect(seat).not.toContain("separator")
    expect(items(seat).map((item) => item.labelKey)).toEqual([
      "prehled",
      "dokumenty",
      "mojeMzda",
    ])
    expect(items(seat).map((item) => item.href)).toEqual([
      "/acme-sro",
      "/acme-sro/dokumenty",
      "/acme-sro/mzdy/moje-mzda",
    ])
    for (const item of items(seat)) {
      expect(betaCs.nav).toHaveProperty(item.labelKey)
    }
  })

  it("ignores isOwner and isManagement for a seat — replacement, not a filter", () => {
    // Belt AND braces: if a future change ever made a seat look like management
    // to the caller, the rail must still be the three entries.
    const seat = betaRailNav("acme-sro", {
      isEmployeeSeat: true,
      isOwner: true,
      isManagement: true,
    })
    expect(items(seat)).toHaveLength(3)
    expect(items(seat).some((item) => item.labelKey === "ucetni")).toBe(false)
    expect(items(seat).some((item) => item.labelKey === "mzdy")).toBe(false)
  })

  it("never gives a seat the company modules", () => {
    const seat = items(betaRailNav("acme-sro", { isEmployeeSeat: true })).map(
      (item) => item.labelKey,
    )
    for (const hidden of ["dane", "finance", "vykazy", "majetek"] as const) {
      expect(seat).not.toContain(hidden)
    }
  })
})
