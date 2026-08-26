import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"

import { VYKAZY_NAV, isActiveVykazyNav, vykazyHref } from "./vykazy-nav"

describe("VYKAZY_NAV", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of VYKAZY_NAV) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("carries exactly the three §2.5 statements, Rozvaha at the module root", () => {
    expect(VYKAZY_NAV.map((item) => item.slug)).toEqual(["", "vzz", "predvaha"])
  })

  it("pairs every tab with the dataset it renders, and never repeats one", () => {
    expect(VYKAZY_NAV.map((item) => item.dataset)).toEqual([
      "rozvaha",
      "vzz",
      "predvaha",
    ])
    expect(new Set(VYKAZY_NAV.map((item) => item.dataset)).size).toBe(3)
  })

  it("every slug produces a unique, org-scoped href", () => {
    const hrefs = VYKAZY_NAV.map((item) => vykazyHref("acme-sro", item.slug))
    expect(hrefs.every((href) => href.startsWith("/acme-sro/vykazy"))).toBe(
      true,
    )
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("isActiveVykazyNav", () => {
  const [rozvaha, vzz, predvaha] = VYKAZY_NAV

  it("matches Rozvaha only on its exact path, never on a sibling subpath", () => {
    expect(isActiveVykazyNav(rozvaha!, "acme-sro", "/acme-sro/vykazy")).toBe(
      true,
    )
    expect(
      isActiveVykazyNav(rozvaha!, "acme-sro", "/acme-sro/vykazy/vzz"),
    ).toBe(false)
    expect(
      isActiveVykazyNav(rozvaha!, "acme-sro", "/acme-sro/vykazy/predvaha"),
    ).toBe(false)
  })

  it("matches a sibling tab on its own path and not on the others", () => {
    expect(isActiveVykazyNav(vzz!, "acme-sro", "/acme-sro/vykazy/vzz")).toBe(
      true,
    )
    expect(isActiveVykazyNav(vzz!, "acme-sro", "/acme-sro/vykazy")).toBe(false)
    expect(
      isActiveVykazyNav(vzz!, "acme-sro", "/acme-sro/vykazy/predvaha"),
    ).toBe(false)
    expect(
      isActiveVykazyNav(predvaha!, "acme-sro", "/acme-sro/vykazy/predvaha"),
    ).toBe(true)
  })

  it("stays active on a deeper path under its own tab", () => {
    expect(
      isActiveVykazyNav(predvaha!, "acme-sro", "/acme-sro/vykazy/predvaha/221"),
    ).toBe(true)
  })
})
