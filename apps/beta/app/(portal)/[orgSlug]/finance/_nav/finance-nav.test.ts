import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"

import { FINANCE_NAV, financeHref, isActiveFinanceNav } from "./finance-nav"

describe("FINANCE_NAV", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of FINANCE_NAV) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("carries the §2.4 leaves that have a route, in spec order", () => {
    // §2.4 names five; the other three (Pohledávky a závazky, Partneři, Úvěry
    // a leasingy) are not routes yet, and §0.3 forbids a placeholder tab for
    // them. Each arrives here together with its page.
    expect(FINANCE_NAV.map((item) => item.slug)).toEqual([
      "dluhy-a-platby",
      "ucty-a-hotovost",
    ])
  })

  it("every slug produces a unique, org-scoped href", () => {
    const hrefs = FINANCE_NAV.map((item) => financeHref("acme-sro", item.slug))
    expect(hrefs.every((href) => href.startsWith("/acme-sro/finance/"))).toBe(
      true,
    )
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("has no slug that is a prefix of another — what makes the prefix match safe", () => {
    // `isActiveFinanceNav` matches on a prefix and needs no exact-match branch
    // (unlike `isActiveVykazyNav`, whose Rozvaha tab sits at the module root).
    // That is only sound while this holds, so it is asserted rather than
    // assumed — a leaf added later cannot quietly break it.
    for (const outer of FINANCE_NAV) {
      for (const inner of FINANCE_NAV) {
        if (outer === inner) continue
        expect(
          inner.slug.startsWith(`${outer.slug}/`),
          `${inner.slug} under ${outer.slug}`,
        ).toBe(false)
      }
    }
  })

  it("never points at the module root, which is a redirect", () => {
    expect(FINANCE_NAV.every((item) => item.slug.length > 0)).toBe(true)
  })
})

describe("isActiveFinanceNav", () => {
  const [dluhy, ucty] = FINANCE_NAV

  it("matches a tab on its own path and not on a sibling's", () => {
    expect(
      isActiveFinanceNav(
        dluhy!,
        "acme-sro",
        "/acme-sro/finance/dluhy-a-platby",
      ),
    ).toBe(true)
    expect(
      isActiveFinanceNav(
        dluhy!,
        "acme-sro",
        "/acme-sro/finance/ucty-a-hotovost",
      ),
    ).toBe(false)
    expect(
      isActiveFinanceNav(
        ucty!,
        "acme-sro",
        "/acme-sro/finance/ucty-a-hotovost",
      ),
    ).toBe(true)
  })

  it("lights nothing up on the module root itself", () => {
    for (const item of FINANCE_NAV) {
      expect(isActiveFinanceNav(item, "acme-sro", "/acme-sro/finance")).toBe(
        false,
      )
    }
  })

  it("stays active on a deeper path under its own tab", () => {
    expect(
      isActiveFinanceNav(
        ucty!,
        "acme-sro",
        "/acme-sro/finance/ucty-a-hotovost/221",
      ),
    ).toBe(true)
  })

  it("does not leak across organizations", () => {
    expect(
      isActiveFinanceNav(
        ucty!,
        "acme-sro",
        "/jina-firma/finance/ucty-a-hotovost",
      ),
    ).toBe(false)
  })
})
