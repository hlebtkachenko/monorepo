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

const HEADER = "Účet;Název;Název EN;Druh;Typ;Oprávkový"

describe("parseRozvrhCsv", () => {
  it("parses the documented columns", () => {
    const result = parseRozvrhCsv(
      [
        HEADER,
        "221003;Bankovní účet EUR: Raiffeisenbank;EUR account;Rozvahový;Aktivní;Ne",
        "391001;Opravná položka k pohledávkám;;Rozvahový;Aktivní;Ano",
      ].join("\r\n"),
    )
    expect(result.headerOk).toBe(true)
    expect(result.accounts).toEqual([
      {
        ucet: "221003",
        nazev: "Bankovní účet EUR: Raiffeisenbank",
        nameEn: "EUR account",
        druh: "Rozvahový",
        typ: "Aktivní",
        opravkovy: false,
      },
      {
        ucet: "391001",
        nazev: "Opravná položka k pohledávkám",
        druh: "Rozvahový",
        typ: "Aktivní",
        opravkovy: true,
      },
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

  it("accepts the sheet's Alternativní název 1 as the English name", () => {
    const result = parseRozvrhCsv(
      ["Účet;Název;Alternativní název 1", "013000;Software;Software"].join(
        "\r\n",
      ),
    )
    expect(result.accounts[0]?.nameEn).toBe("Software")
  })

  it("reports missing required headers and parses nothing", () => {
    const result = parseRozvrhCsv(
      ["Účet;Druh", "221003;Rozvahový"].join("\r\n"),
    )
    expect(result.headerOk).toBe(false)
    expect(result.missingHeaders).toEqual(["Název"])
    expect(result.accounts).toEqual([])
  })

  it("keeps the first of a duplicated account and reports it", () => {
    const result = parseRozvrhCsv(
      ["Účet;Název", "221003;První", "221003;Druhý"].join("\r\n"),
    )
    expect(result.accounts).toEqual([{ ucet: "221003", nazev: "První" }])
    expect(result.duplicates).toEqual(["221003"])
  })

  it("skips rows with no account or no name, and lists unknown columns", () => {
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
    expect(result.ignoredColumns).toEqual(["Použití 2025"])
  })

  it("round-trips its own template", () => {
    const result = parseRozvrhCsv(rozvrhCsvTemplate())
    expect(result.headerOk).toBe(true)
    expect(result.accounts).toHaveLength(3)
    expect(result.accounts[2]?.opravkovy).toBe(true)
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

  it("lets an exact osnova hit beat a rozvrh synthetic fallback", () => {
    // The rozvrh knows only 221003; 221000 must keep its statutory name rather
    // than inherit "Bankovní účet EUR" through the 221 prefix.
    const name = buildNameLookup([
      { ucet: "221003", nazev: "Bankovní účet EUR" },
    ])
    expect(name("221000")).toBe("Peněžní prostředky na účtech")
    expect(name("221009")).toBe("Bankovní účet EUR")
  })
})

describe("buildOpravkovyLookup", () => {
  it("reads the osnova when no rozvrh is loaded", () => {
    const isOpravkovy = buildOpravkovyLookup()
    expect(isOpravkovy("082000")).toBe(true)
    expect(isOpravkovy("022000")).toBe(false)
    expect(isOpravkovy("082001")).toBe(false)
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
