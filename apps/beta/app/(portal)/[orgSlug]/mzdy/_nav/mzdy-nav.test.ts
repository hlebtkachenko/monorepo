import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"

import { isActiveMzdyNav, MZDY_NAV, mzdyHref } from "./mzdy-nav"

describe("MZDY_NAV", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of MZDY_NAV) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("carries all five spec §2.6 leaves, Přehled mezd at the module root", () => {
    expect(MZDY_NAV.map((item) => item.slug)).toEqual([
      "",
      "platby-a-terminy",
      "podklady",
      "zamestnanci",
      "vyplatnice",
    ])
  })

  it("every slug produces a unique, org-scoped href", () => {
    const hrefs = MZDY_NAV.map((item) => mzdyHref("acme-sro", item.slug))
    expect(hrefs.every((href) => href.startsWith("/acme-sro/mzdy"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("isActiveMzdyNav", () => {
  const [prehled, platby, podklady, zamestnanci, vyplatnice] = MZDY_NAV

  it("matches Přehled mezd only on its exact path, never on a sibling subpath", () => {
    expect(isActiveMzdyNav(prehled!, "acme-sro", "/acme-sro/mzdy")).toBe(true)
    expect(
      isActiveMzdyNav(prehled!, "acme-sro", "/acme-sro/mzdy/platby-a-terminy"),
    ).toBe(false)
    expect(
      isActiveMzdyNav(prehled!, "acme-sro", "/acme-sro/mzdy/podklady"),
    ).toBe(false)
  })

  it("matches a sibling tab on its own path and not on the others", () => {
    expect(
      isActiveMzdyNav(platby!, "acme-sro", "/acme-sro/mzdy/platby-a-terminy"),
    ).toBe(true)
    expect(isActiveMzdyNav(platby!, "acme-sro", "/acme-sro/mzdy")).toBe(false)
    expect(
      isActiveMzdyNav(podklady!, "acme-sro", "/acme-sro/mzdy/podklady"),
    ).toBe(true)
    expect(
      isActiveMzdyNav(zamestnanci!, "acme-sro", "/acme-sro/mzdy/zamestnanci"),
    ).toBe(true)
    expect(
      isActiveMzdyNav(vyplatnice!, "acme-sro", "/acme-sro/mzdy/vyplatnice"),
    ).toBe(true)
    expect(
      isActiveMzdyNav(zamestnanci!, "acme-sro", "/acme-sro/mzdy/vyplatnice"),
    ).toBe(false)
  })

  it("stays active on a deeper path under its own tab", () => {
    expect(
      isActiveMzdyNav(podklady!, "acme-sro", "/acme-sro/mzdy/podklady/123"),
    ).toBe(true)
    expect(
      isActiveMzdyNav(
        vyplatnice!,
        "acme-sro",
        "/acme-sro/mzdy/vyplatnice/upload",
      ),
    ).toBe(true)
  })
})
