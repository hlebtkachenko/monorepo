import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"

import {
  DOKUMENTY_NAV,
  dokumentyHref,
  isActiveDokumentyNav,
} from "./dokumenty-nav"

describe("DOKUMENTY_NAV", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of DOKUMENTY_NAV) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("carries exactly the three §2.2 tabs, Vše first", () => {
    expect(DOKUMENTY_NAV.map((item) => item.slug)).toEqual([
      "",
      "firma",
      "stavby",
    ])
  })

  it("every slug produces a unique, org-scoped href", () => {
    const hrefs = DOKUMENTY_NAV.map((item) =>
      dokumentyHref("acme-sro", item.slug),
    )
    expect(hrefs.every((href) => href.startsWith("/acme-sro/dokumenty"))).toBe(
      true,
    )
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("isActiveDokumentyNav", () => {
  const [vse, firma, stavby] = DOKUMENTY_NAV

  it("matches Vše only on its exact path, never on a sibling subpath", () => {
    expect(isActiveDokumentyNav(vse!, "acme-sro", "/acme-sro/dokumenty")).toBe(
      true,
    )
    expect(
      isActiveDokumentyNav(vse!, "acme-sro", "/acme-sro/dokumenty/firma"),
    ).toBe(false)
    expect(
      isActiveDokumentyNav(vse!, "acme-sro", "/acme-sro/dokumenty/stavby"),
    ).toBe(false)
  })

  it("matches a sibling tab on its own path, not on Vše or the other sibling", () => {
    expect(
      isActiveDokumentyNav(firma!, "acme-sro", "/acme-sro/dokumenty/firma"),
    ).toBe(true)
    expect(
      isActiveDokumentyNav(firma!, "acme-sro", "/acme-sro/dokumenty"),
    ).toBe(false)
    expect(
      isActiveDokumentyNav(firma!, "acme-sro", "/acme-sro/dokumenty/stavby"),
    ).toBe(false)
    expect(
      isActiveDokumentyNav(stavby!, "acme-sro", "/acme-sro/dokumenty/stavby"),
    ).toBe(true)
  })
})
