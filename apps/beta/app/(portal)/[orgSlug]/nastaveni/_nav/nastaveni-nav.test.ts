import { describe, expect, it } from "vitest"

import betaCs from "@/messages/cs.json"
import { IDENTITY_FIELDS } from "@/lib/ares/suggestions"
import { managesPeople } from "@/lib/auth/invite-policy"

import { IDENTITY_FIELD_LABEL, ROLE_LABEL_KEY } from "../_components/labels"

import {
  isActiveNastaveniNav,
  nastaveniHref,
  nastaveniNavFor,
  nastaveniDefaultSlug,
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
    expect(NASTAVENI_NAV.map((item) => item.slug)).toEqual([
      "spolecnost",
      "lide",
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

describe("nastaveniNavFor — spec §5 visibility", () => {
  it("shows Lidé to the roles that administer people, and only those", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(nastaveniNavFor({ role, employeeSeat: false }).map((item) => item.slug)).toContain("lide")
    }
    for (const role of ["member", "guest"] as const) {
      expect(nastaveniNavFor({ role, employeeSeat: false }).map((item) => item.slug)).not.toContain(
        "lide",
      )
    }
  })

  it("agrees with the invite matrix rather than restating it", () => {
    // The tab is derived from `managesPeople`, so a change to the matrix moves
    // the tab with it. This asserts the two cannot part company.
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const visible = nastaveniNavFor({ role, employeeSeat: false }).some((item) => item.slug === "lide")
      expect(visible).toBe(managesPeople({ kind: "organization", role }))
    }
  })

  it("never hides the tabs that belong to everyone", () => {
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const slugs = nastaveniNavFor({ role, employeeSeat: false }).map(
        (item) => item.slug,
      )
      expect(slugs).toContain("spolecnost")
      expect(slugs).toContain("ucet")
    }
  })

  /**
   * The employee seat (spec §2.6.1, PR 33). It is a `guest`, so Lidé was
   * already hidden; what this adds is Společnost — the company's identity card,
   * which is company data even though it is not a financial statement.
   */
  it("hides Společnost from the employee seat and keeps Účet", () => {
    const slugs = nastaveniNavFor({ role: "guest", employeeSeat: true }).map(
      (item) => item.slug,
    )
    expect(slugs).not.toContain("spolecnost")
    expect(slugs).not.toContain("lide")
    expect(slugs).toEqual(["ucet"])
  })

  it("lands the seat on Účet and everyone else on Společnost", () => {
    expect(nastaveniDefaultSlug({ role: "guest", employeeSeat: true })).toBe(
      "ucet",
    )
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      expect(nastaveniDefaultSlug({ role, employeeSeat: false })).toBe(
        NASTAVENI_DEFAULT_SLUG,
      )
    }
  })
})

describe("isActiveNastaveniNav", () => {
  const [spolecnost, , ucet] = NASTAVENI_NAV

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

describe("role labels — spec §2.6.1", () => {
  it("resolves every role against the catalog", () => {
    for (const key of Object.values(ROLE_LABEL_KEY)) {
      const [namespace, name] = key.split(".") as [keyof typeof betaCs, string]
      expect(betaCs[namespace]).toHaveProperty(name)
    }
  })

  it("uses the spec's display names, not the enum names", () => {
    // The whole argument for the recommendation is that "member" must not read
    // as the smaller of two options to somebody assigning it, so the exact
    // Czech strings are the contract — not a detail the catalog may drift on.
    expect(ROLE_LABEL_KEY).toEqual({
      owner: "nastaveni.roleOwner",
      admin: "nastaveni.roleAdmin",
      member: "nastaveni.roleMember",
      guest: "nastaveni.roleGuest",
    })
    expect(betaCs.nastaveni.roleOwner).toBe("Účetní")
    expect(betaCs.nastaveni.roleAdmin).toBe("Majitel společnosti")
    expect(betaCs.nastaveni.roleMember).toBe("Pracovník firmy (vedení)")
    expect(betaCs.nastaveni.roleGuest).toBe("Host")
  })
})
