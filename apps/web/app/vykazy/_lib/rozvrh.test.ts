// Účtový rozvrh import: the CSV contract, and the name / opravkovy precedence
// against the směrná osnova. The precedence is the point of the feature — an
// analytical account must show the unit's own name, and an exact osnova hit must
// still beat a synthetic-prefix fallback from the rozvrh.

import { describe, expect, it } from "vitest"

import {
  buildNameLookup,
  buildOpravkovyLookup,
  buildPlacementLookup,
  isLeafRada,
  leafOptions,
  parseRozvrhCsv,
  rozvrhCsv,
  rozvrhCsvTemplate,
} from "./rozvrh"

const HEADER = "Účet;Název;Oprávkový"

describe("parseRozvrhCsv", () => {
  it("parses the documented columns", () => {
    const result = parseRozvrhCsv(
      [
        HEADER,
        "221003;Bankovní účet EUR: Raiffeisenbank;Ne",
        "391001;Opravná položka k pohledávkám;Ano",
      ].join("\r\n"),
    )
    expect(result.headerOk).toBe(true)
    expect(result.accounts).toEqual([
      {
        ucet: "221003",
        nazev: "Bankovní účet EUR: Raiffeisenbank",
        opravkovy: false,
      },
      {
        ucet: "391001",
        nazev: "Opravná položka k pohledávkám",
        opravkovy: true,
      },
    ])
  })

  it("imports the full rozvrh sheet without reporting its extra columns", () => {
    // The Excel sheet carries columns this app has no use for. They must not be
    // dropped into the account objects, and must not be reported as unknown —
    // a warning on every import of the real file is noise that hides real ones.
    const result = parseRozvrhCsv(
      [
        "Účet;Název;Název EN;Druh;Typ;Podtyp;Oprávkový;Zdroj",
        "391001;Opravná položka;Allowance;Rozvahový;Aktivní;Nesledovat saldo;Ano;Analytika 2025",
      ].join("\r\n"),
    )
    expect(result.ignoredColumns).toEqual([])
    expect(result.accounts).toEqual([
      { ucet: "391001", nazev: "Opravná položka", opravkovy: true },
    ])
  })

  it("accepts a BOM, a comma delimiter and quoted fields", () => {
    const result = parseRozvrhCsv(
      ["\uFEFFÚčet,Název", '475017,"Byt 17, Roman"'].join("\n"),
    )
    expect(result.headerOk).toBe(true)
    expect(result.accounts).toEqual([
      { ucet: "475017", nazev: "Byt 17, Roman" },
    ])
  })

  it("reports missing required headers and parses nothing", () => {
    const result = parseRozvrhCsv(
      ["Účet;Druh", "221003;Rozvahový"].join("\r\n"),
    )
    expect(result.headerOk).toBe(false)
    expect(result.missingHeaders).toEqual(["Název"])
    expect(result.accounts).toEqual([])
  })

  it("keeps the first of a duplicated account and reports the line", () => {
    const result = parseRozvrhCsv(
      ["Účet;Název", "221003;První", "221003;Druhý"].join("\r\n"),
    )
    expect(result.accounts).toEqual([{ ucet: "221003", nazev: "První" }])
    expect(result.duplicates).toEqual([
      "řádek 3: účet 221003 je uveden vícekrát",
    ])
  })

  it("reports every dropped row rather than losing it silently", () => {
    // Adding an account to the sheet and forgetting its name is the realistic
    // mistake; it must not import as a quiet "loaded 1 account".
    const result = parseRozvrhCsv(
      [
        "Účet;Název;Použití 2025",
        "221003;Banka EUR;POUŽITO 2025",
        ";Bez účtu;",
        "999000;;",
        "",
      ].join("\r\n"),
    )
    expect(result.accounts).toEqual([{ ucet: "221003", nazev: "Banka EUR" }])
    expect(result.skipped).toEqual([
      "řádek 3: chybí číslo účtu",
      "řádek 4: účet 999000 nemá název",
    ])
    expect(result.ignoredColumns).toEqual(["Použití 2025"])
  })

  it("round-trips its own template", () => {
    const result = parseRozvrhCsv(rozvrhCsvTemplate())
    expect(result.headerOk).toBe(true)
    expect(result.accounts).toHaveLength(4)
    expect(result.accounts[2]?.opravkovy).toBe(true)
    // The last example carries a placement override, so it must survive too.
    expect(result.accounts[3]).toMatchObject({
      ucet: "395002",
      vykaz: "rozvaha-pasiva",
      rada: "062",
    })
    expect(result.skipped).toEqual([])
    expect(result.rejectedPlacements).toEqual([])
    expect(result.ignoredColumns).toEqual([])
  })
})

describe("rozvrhCsv", () => {
  it("round-trips a chart edited in the app", () => {
    // What the page exports must import again unchanged, so a name fixed on
    // screen can be carried back into the sheet the chart came from.
    const accounts = [
      { ucet: "475017", nazev: "Byt 17, Roman", opravkovy: false },
      { ucet: "221003", nazev: 'Banka "EUR"; devizová', opravkovy: false },
      { ucet: "390001", nazev: "Opravná položka", opravkovy: true },
    ]
    const result = parseRozvrhCsv(rozvrhCsv(accounts))
    expect(result.headerOk).toBe(true)
    expect(result.skipped).toEqual([])
    // Sorted by account number, so the file is stable across exports.
    expect(result.accounts).toEqual([
      { ucet: "221003", nazev: 'Banka "EUR"; devizová', opravkovy: false },
      { ucet: "390001", nazev: "Opravná položka", opravkovy: true },
      { ucet: "475017", nazev: "Byt 17, Roman", opravkovy: false },
    ])
  })
})

describe("buildNameLookup", () => {
  it("falls back to the osnova synthetic with no rozvrh loaded", () => {
    const name = buildNameLookup()
    expect(name("475017")).toBe("Dlouhodobé přijaté zálohy a závdavky")
    expect(name("221000")).toBe("Peněžní prostředky na účtech")
    expect(name("999999")).toBe("")
  })

  it("prefers the rozvrh's own name for an analytical account", () => {
    const name = buildNameLookup([
      { ucet: "475017", nazev: "Byt 17, Roman" },
      { ucet: "221003", nazev: "Bankovní účet EUR" },
    ])
    expect(name("475017")).toBe("Byt 17, Roman")
    expect(name("221003")).toBe("Bankovní účet EUR")
  })

  it("never lends an analytika's name to an unlisted sibling", () => {
    // The rozvrh knows only 221003. Neither the synthetic nor another analytika
    // of 221 may inherit "Bankovní účet EUR" — that account is one specific
    // bank account, and the statutory name is generic but never false.
    const name = buildNameLookup([
      { ucet: "221003", nazev: "Bankovní účet EUR" },
    ])
    expect(name("221003")).toBe("Bankovní účet EUR")
    expect(name("221000")).toBe("Peněžní prostředky na účtech")
    expect(name("221009")).toBe("Peněžní prostředky na účtech")
  })

  it("ignores a rozvrh row with an empty name", () => {
    const name = buildNameLookup([{ ucet: "221000", nazev: "" }])
    expect(name("221000")).toBe("Peněžní prostředky na účtech")
  })
})

describe("buildOpravkovyLookup", () => {
  it("reads the osnova, exact then synthetic, when no rozvrh is loaded", () => {
    const isOpravkovy = buildOpravkovyLookup()
    expect(isOpravkovy("082000")).toBe(true)
    expect(isOpravkovy("022000")).toBe(false)
    // An analytika of 08x is an oprávkový účet because 08x is one.
    expect(isOpravkovy("082001")).toBe(true)
    expect(isOpravkovy("022001")).toBe(false)
    expect(isOpravkovy("999999")).toBe(false)
  })

  it("lets the rozvrh override the osnova's synthetic answer", () => {
    const isOpravkovy = buildOpravkovyLookup([
      { ucet: "082001", nazev: "Nikoli oprávky", opravkovy: false },
    ])
    expect(isOpravkovy("082001")).toBe(false)
    expect(isOpravkovy("082002")).toBe(true)
  })

  it("lets the rozvrh flag an analytical account", () => {
    const isOpravkovy = buildOpravkovyLookup([
      { ucet: "082001", nazev: "Oprávky: Toyota", opravkovy: true },
      { ucet: "022001", nazev: "Toyota SDK5", opravkovy: false },
    ])
    expect(isOpravkovy("082001")).toBe(true)
    expect(isOpravkovy("022001")).toBe(false)
    expect(isOpravkovy("082000")).toBe(true)
  })
})

describe("placement overrides", () => {
  it("parses a Výkaz + Řádek pair on an analytický účet", () => {
    const result = parseRozvrhCsv(
      [
        "Účet;Název;Oprávkový;Výkaz;Řádek",
        "395002;Vnitřní zúčtování: závazky;Ne;Pasiva;006",
      ].join("\n"),
    )
    expect(result.rejectedPlacements).toEqual([])
    expect(result.accounts[0]).toMatchObject({
      ucet: "395002",
      vykaz: "rozvaha-pasiva",
      rada: "006",
    })
  })

  it("refuses to place a syntetický účet, which the vyhláška owns", () => {
    const result = parseRozvrhCsv(
      ["Účet;Název;Výkaz;Řádek", "395;Vnitřní zúčtování;Pasiva;006"].join("\n"),
    )
    expect(result.accounts[0]?.vykaz).toBeUndefined()
    expect(result.rejectedPlacements).toHaveLength(1)
    expect(result.rejectedPlacements[0]).toContain("syntetický")
  })

  it("refuses a calculated řádek, which would double-count the account", () => {
    // Aktiva ř.001 is AKTIVA CELKEM: the sum of its children, not a leaf.
    const result = parseRozvrhCsv(
      ["Účet;Název;Výkaz;Řádek", "311001;Odběratelé A;Aktiva;001"].join("\n"),
    )
    expect(result.accounts[0]?.vykaz).toBeUndefined()
    expect(result.rejectedPlacements[0]).toContain("001")
  })

  it("refuses half a placement", () => {
    const result = parseRozvrhCsv(
      ["Účet;Název;Výkaz;Řádek", "311001;Odběratelé A;Aktiva;"].join("\n"),
    )
    expect(result.accounts[0]?.vykaz).toBeUndefined()
    expect(result.rejectedPlacements).toHaveLength(1)
  })

  it("round-trips a placement through the CSV", () => {
    const csv = rozvrhCsv([
      { ucet: "395002", nazev: "Vnitřní zúčtování: závazky", vykaz: "rozvaha-pasiva", rada: "006" }, // prettier-ignore
      { ucet: "311001", nazev: "Odběratelé A" },
    ])
    const back = parseRozvrhCsv(csv)
    expect(back.rejectedPlacements).toEqual([])
    expect(back.accounts.find((a) => a.ucet === "395002")).toMatchObject({
      vykaz: "rozvaha-pasiva",
      rada: "006",
    })
    expect(
      back.accounts.find((a) => a.ucet === "311001")?.vykaz,
    ).toBeUndefined()
  })

  it("offers only leaf řádky as placement targets", () => {
    const options = leafOptions("rozvaha-aktiva", "D")
    expect(options.some((o) => o.rada === "001")).toBe(false)
    expect(options.some((o) => o.rada === "005")).toBe(true)
    expect(isLeafRada("rozvaha-aktiva", "001")).toBe(false)
    expect(isLeafRada("rozvaha-aktiva", "005")).toBe(true)
  })
})

describe("buildPlacementLookup", () => {
  it("answers only for the exact account that carries the override", () => {
    const placementOf = buildPlacementLookup([
      {
        ucet: "395002",
        nazev: "Závazky",
        vykaz: "rozvaha-pasiva",
        rada: "006",
      },
    ])
    expect(placementOf("395002")).toEqual({
      vykaz: "rozvaha-pasiva",
      rada: "006",
    })
    // A sibling analytika of the same synthetic keeps the law mapping.
    expect(placementOf("395001")).toBeUndefined()
  })

  it("drops an override that no longer names a leaf", () => {
    const placementOf = buildPlacementLookup([
      { ucet: "311001", nazev: "Odběratelé A", vykaz: "rozvaha-aktiva", rada: "001" }, // prettier-ignore
      { ucet: "311002", nazev: "Odběratelé B", vykaz: "rozvaha-aktiva", rada: "999" }, // prettier-ignore
    ])
    expect(placementOf("311001")).toBeUndefined()
    expect(placementOf("311002")).toBeUndefined()
  })

  it("is empty when nothing is loaded", () => {
    expect(buildPlacementLookup()("311001")).toBeUndefined()
  })
})
