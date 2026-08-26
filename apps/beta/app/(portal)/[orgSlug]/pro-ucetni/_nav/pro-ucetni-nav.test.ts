import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"

import {
  isActiveProUcetniNav,
  proUcetniLandingHref,
  proUcetniNav,
} from "./pro-ucetni-nav"

const ORG_SLUG = "acme-sro"

describe("proUcetniNav", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of proUcetniNav(ORG_SLUG)) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("carries all four §3 sections in the spec's order, no dead entries", () => {
    expect(proUcetniNav(ORG_SLUG).map((item) => item.href)).toEqual([
      `/${ORG_SLUG}/pro-ucetni/zpracovani`,
      `/${ORG_SLUG}/pro-ucetni/uzaverka`,
      `/${ORG_SLUG}/pro-ucetni/zadavani`,
      `/${ORG_SLUG}/pro-ucetni/ukoly`,
    ])
  })

  it("every href is unique and org-scoped", () => {
    const hrefs = proUcetniNav(ORG_SLUG).map((item) => item.href)
    expect(
      hrefs.every((href) => href.startsWith(`/${ORG_SLUG}/pro-ucetni/`)),
    ).toBe(true)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("the landing href is the section's first entry", () => {
    expect(proUcetniLandingHref(ORG_SLUG)).toBe(
      `/${ORG_SLUG}/pro-ucetni/zpracovani`,
    )
  })
})

describe("isActiveProUcetniNav", () => {
  it("matches a tab on its own path and any subpath, not on its sibling", () => {
    const [zpracovani, uzaverka, zadavani, ukoly] = proUcetniNav(ORG_SLUG)

    expect(isActiveProUcetniNav(zpracovani!.href, zpracovani!.href)).toBe(true)
    expect(
      isActiveProUcetniNav(ukoly!.href, `${ukoly!.href}/nejaka-podstranka`),
    ).toBe(true)
    // Měsíční uzávěrka stays active on a batch's own preview page.
    expect(
      isActiveProUcetniNav(
        uzaverka!.href,
        `${uzaverka!.href}/0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6`,
      ),
    ).toBe(true)
    expect(isActiveProUcetniNav(zpracovani!.href, ukoly!.href)).toBe(false)
    expect(isActiveProUcetniNav(zadavani!.href, ukoly!.href)).toBe(false)
    expect(isActiveProUcetniNav(uzaverka!.href, zadavani!.href)).toBe(false)
  })
})
