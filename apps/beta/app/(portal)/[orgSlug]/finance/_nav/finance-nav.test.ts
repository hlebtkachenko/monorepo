/**
 * The Finance module's nav model (spec §2.4), on the same terms as
 * `vykazy/_nav/vykazy-nav.test.ts`: the tab row is data, so its drift check is a
 * unit test rather than a comment.
 *
 * Two things are asserted and only one of them is about routing. The first is
 * that every entry POINTS AT A ROUTE THAT EXISTS — §0.3 forbids a "coming soon"
 * stub, and a tab row is the easiest place in the app to acquire one. The second
 * is the active-match rule, which is where a prefix bug would light two tabs at
 * once.
 */
import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import betaMessages from "@/messages/cs.json"

import { FINANCE_NAV, financeHref, isActiveFinanceNav } from "./finance-nav"

const MODULE_DIR = resolve(import.meta.dirname, "..")

describe("FINANCE_NAV", () => {
  it("carries only leaves that have a route on disk", () => {
    const routes = new Set(
      readdirSync(MODULE_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
        .map((entry) => entry.name),
    )

    for (const item of FINANCE_NAV) {
      expect(routes.has(item.slug), `${item.slug} has a route`).toBe(true)
    }
  })

  it("names a Czech label for every entry", () => {
    const messages = betaMessages as Record<string, Record<string, string>>
    for (const item of FINANCE_NAV) {
      const [namespace, key] = item.labelKey.split(".")
      expect(messages[namespace!]?.[key!], item.labelKey).toBeTruthy()
    }
  })

  it("gives every entry a distinct, non-empty slug", () => {
    const slugs = FINANCE_NAV.map((item) => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    // No leaf takes the module root. `finance/page.tsx` redirects into the
    // first leaf, and an empty slug would be a strict PREFIX of every sibling's
    // href — the trap `isActiveVykazyNav` has to special-case.
    expect(slugs).not.toContain("")
  })

  it("builds org-scoped hrefs", () => {
    expect(financeHref("acme", "dluhy-a-platby")).toBe(
      "/acme/finance/dluhy-a-platby",
    )
  })

  it("carries the Úvěry a leasingy leaf", () => {
    expect(FINANCE_NAV.map((item) => item.slug)).toContain("uvery")
  })

  it("lights exactly one tab, on the leaf and on a route beneath it", () => {
    for (const item of FINANCE_NAV) {
      const href = financeHref("acme", item.slug)
      const active = FINANCE_NAV.filter((candidate) =>
        isActiveFinanceNav(candidate, "acme", href),
      )
      expect(active, `${item.slug} lights one tab`).toEqual([item])

      const nested = FINANCE_NAV.filter((candidate) =>
        isActiveFinanceNav(candidate, "acme", `${href}/detail`),
      )
      expect(nested, `${item.slug}/detail lights one tab`).toEqual([item])
    }
  })

  it("lights nothing on the module root or in another organization", () => {
    for (const pathname of ["/acme/finance", "/jina/finance/dluhy-a-platby"]) {
      expect(
        FINANCE_NAV.filter((item) =>
          isActiveFinanceNav(item, "acme", pathname),
        ),
      ).toEqual([])
    }
  })
})

describe("isActiveFinanceNav", () => {
  const uvery = FINANCE_NAV.find((item) => item.slug === "uvery")!
  const dluhy = FINANCE_NAV.find((item) => item.slug === "dluhy-a-platby")!

  it("matches a leaf on its own path and on a route beneath it", () => {
    expect(
      isActiveFinanceNav(uvery, "acme-sro", "/acme-sro/finance/uvery"),
    ).toBe(true)
    expect(
      isActiveFinanceNav(uvery, "acme-sro", "/acme-sro/finance/uvery/detail"),
    ).toBe(true)
  })

  it("never matches a sibling leaf or the module root", () => {
    expect(
      isActiveFinanceNav(uvery, "acme-sro", "/acme-sro/finance/dluhy-a-platby"),
    ).toBe(false)
    expect(isActiveFinanceNav(uvery, "acme-sro", "/acme-sro/finance")).toBe(
      false,
    )
    expect(
      isActiveFinanceNav(dluhy, "acme-sro", "/acme-sro/finance/uvery"),
    ).toBe(false)
  })

  it("never matches another organization's identically-shaped path", () => {
    expect(
      isActiveFinanceNav(uvery, "acme-sro", "/jina-sro/finance/uvery"),
    ).toBe(false)
  })
})
