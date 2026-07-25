import { describe, expect, it } from "vitest"

import { coerceTemplates, upsertTemplate } from "./org-templates"
import type { OrgConfig } from "./types"

const org = (nazev: string): OrgConfig => ({
  nazev,
  ico: "09613528",
  sidlo: "Primátorská 296/38",
  psc: "18000",
  obec: "Praha",
  stat: "Česká republika",
  pravniForma: "Společnost s.r.o.",
  predmetPodnikani: "Výroba, obchod a služby",
  rok: "2025",
  mesic: "12",
  keDni: "31.12.2025",
  sestavenoDne: "30.04.2026",
  schvalenoDne: "25.07.2026",
  vTisicich: true,
})

describe("coerceTemplates", () => {
  it("round-trips a saved template", () => {
    const saved = [{ name: "Firma", org: org("Firma") }]
    expect(coerceTemplates(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })

  it("drops entries with no usable name", () => {
    expect(
      coerceTemplates([
        { name: "  ", org: org("A") },
        { org: org("B") },
        { name: 7, org: org("C") },
      ]),
    ).toEqual([])
  })

  it("trims the name and fills a missing org with the empty block", () => {
    const [only] = coerceTemplates([{ name: "  Firma  " }])
    expect(only?.name).toBe("Firma")
    expect(only?.org.nazev).toBe("")
    // coerceOrg's own defaults survive the trip.
    expect(only?.org.vTisicich).toBe(true)
  })

  it("returns nothing for a non-array payload", () => {
    expect(coerceTemplates(null)).toEqual([])
    expect(coerceTemplates({ name: "Firma" })).toEqual([])
  })
})

describe("upsertTemplate", () => {
  it("replaces the template of the same name rather than duplicating it", () => {
    const first = upsertTemplate([], { name: "Firma", org: org("Firma") })
    const second = upsertTemplate(first, {
      name: "Firma",
      org: { ...org("Firma"), rok: "2026" },
    })
    expect(second).toHaveLength(1)
    expect(second[0]?.org.rok).toBe("2026")
  })

  it("sorts by name using Czech collation", () => {
    let list = upsertTemplate([], { name: "Zeta", org: org("Zeta") })
    list = upsertTemplate(list, { name: "Čapek", org: org("Čapek") })
    list = upsertTemplate(list, { name: "Adam", org: org("Adam") })
    expect(list.map((t) => t.name)).toEqual(["Adam", "Čapek", "Zeta"])
  })

  it("stores the trimmed name", () => {
    const list = upsertTemplate([], { name: "  Firma  ", org: org("Firma") })
    expect(list[0]?.name).toBe("Firma")
  })
})
