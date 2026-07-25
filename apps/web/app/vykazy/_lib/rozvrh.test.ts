// Účtový rozvrh import: the CSV contract, and the name / opravkovy precedence
// against the směrná osnova. The precedence is the point of the feature — an
// analytical account must show the unit's own name, and an exact osnova hit must
// still beat a synthetic-prefix fallback from the rozvrh.

import { describe, expect, it } from "vitest"

import {
  buildNameLookup,
  buildOpravkovyLookup,
  parseRozvrhCsv,
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
    expect(result.accounts).toHaveLength(3)
    expect(result.accounts[2]?.opravkovy).toBe(true)
    expect(result.skipped).toEqual([])
    expect(result.ignoredColumns).toEqual([])
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
