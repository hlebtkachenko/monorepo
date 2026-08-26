import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"
import { IDENTITY_FIELDS } from "@/lib/ares/suggestions"

import { IDENTITY_FIELD_LABEL } from "../_components/labels"

import {
  isActiveNastaveniNav,
  nastaveniHref,
  NASTAVENI_DEFAULT_SLUG,
  NASTAVENI_NAV,
} from "./nastaveni-nav"

describe("NASTAVENI_NAV", () => {
  it("resolves every label key against the catalog", () => {
    for (const item of NASTAVENI_NAV) {
      const [namespace, key] = item.labelKey.split(".") as [
        keyof typeof betaCs,
        string,
      ]
      expect(betaCs[namespace]).toHaveProperty(key)
    }
  })

  it("renders only the tabs that have a page behind them", () => {
    // Lidé is PR 22. A tab that renders and then 404s is worse than one that
    // does not exist yet (the repo's no-dead-links / no-placeholder rules).
    expect(NASTAVENI_NAV.map((item) => item.slug)).toEqual([
      "spolecnost",
      "ucet",
    ])
  })

  it("lands on a tab that exists", () => {
    expect(
      NASTAVENI_NAV.some((item) => item.slug === NASTAVENI_DEFAULT_SLUG),
    ).toBe(true)
  })

  it("every slug produces a unique, org-scoped href", () => {
    const hrefs = NASTAVENI_NAV.map((item) =>
      nastaveniHref("acme-sro", item.slug),
    )
    expect(hrefs.every((href) => href.startsWith("/acme-sro/nastaveni/"))).toBe(
      true,
    )
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("isActiveNastaveniNav", () => {
  const [spolecnost, ucet] = NASTAVENI_NAV

  it("matches a tab on its own path and its subpaths", () => {
    expect(
      isActiveNastaveniNav(
        spolecnost!,
        "acme-sro",
        "/acme-sro/nastaveni/spolecnost",
      ),
    ).toBe(true)
    expect(
      isActiveNastaveniNav(ucet!, "acme-sro", "/acme-sro/nastaveni/ucet"),
    ).toBe(true)
  })

  it("does not light a sibling whose href is a string prefix", () => {
    expect(
      isActiveNastaveniNav(
        ucet!,
        "acme-sro",
        "/acme-sro/nastaveni/ucetni-neco",
      ),
    ).toBe(false)
    expect(
      isActiveNastaveniNav(spolecnost!, "acme-sro", "/acme-sro/nastaveni/ucet"),
    ).toBe(false)
  })

  it("does not match another organization's identical path", () => {
    expect(
      isActiveNastaveniNav(ucet!, "acme-sro", "/jina-firma/nastaveni/ucet"),
    ).toBe(false)
  })
})

describe("identity field labels", () => {
  it("names every writable field, and only writable fields", () => {
    // `satisfies Record<IdentityField, …>` already makes a missing label a
    // compile error; this is the runtime half — a label for a field that has
    // been REMOVED from the writable set would otherwise render an input the
    // server silently ignores.
    expect(Object.keys(IDENTITY_FIELD_LABEL).sort()).toEqual(
      [...IDENTITY_FIELDS].sort(),
    )
  })

  it("resolves every label against the catalog", () => {
    for (const key of Object.values(IDENTITY_FIELD_LABEL)) {
      const [namespace, name] = key.split(".") as [keyof typeof betaCs, string]
      expect(betaCs[namespace]).toHaveProperty(name)
    }
  })
})
