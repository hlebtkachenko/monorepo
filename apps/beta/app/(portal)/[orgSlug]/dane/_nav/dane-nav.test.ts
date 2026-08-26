import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"

import { DANE_NAV, daneHref, isActiveDaneNav } from "./dane-nav"

describe("DANE_NAV", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of DANE_NAV) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("carries exactly one Souhrn entry (family: null) and one per family", () => {
    const souhrn = DANE_NAV.filter((item) => item.family === null)
    expect(souhrn).toHaveLength(1)
    expect(souhrn[0]!.slug).toBe("")

    const families = DANE_NAV.filter((item) => item.family !== null).map(
      (item) => item.family,
    )
    expect(new Set(families)).toEqual(
      new Set(["dph", "dan_z_prijmu", "mzdove_odvody", "ostatni"]),
    )
  })

  it("every slug produces a unique, org-scoped href", () => {
    const hrefs = DANE_NAV.map((item) => daneHref("acme-sro", item.slug))
    expect(hrefs.every((href) => href.startsWith("/acme-sro/dane"))).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("isActiveDaneNav", () => {
  const [souhrn, dph, danZPrijmu] = DANE_NAV

  it("matches Souhrn only on its exact path, never on a family subpath", () => {
    expect(isActiveDaneNav(souhrn!, "acme-sro", "/acme-sro/dane")).toBe(true)
    expect(isActiveDaneNav(souhrn!, "acme-sro", "/acme-sro/dane/dph")).toBe(
      false,
    )
  })

  it("matches a family tab on its own path, not on Souhrn or a sibling", () => {
    expect(isActiveDaneNav(dph!, "acme-sro", "/acme-sro/dane/dph")).toBe(true)
    expect(isActiveDaneNav(dph!, "acme-sro", "/acme-sro/dane")).toBe(false)
    expect(
      isActiveDaneNav(dph!, "acme-sro", "/acme-sro/dane/dan-z-prijmu"),
    ).toBe(false)
    expect(
      isActiveDaneNav(danZPrijmu!, "acme-sro", "/acme-sro/dane/dan-z-prijmu"),
    ).toBe(true)
  })
})
