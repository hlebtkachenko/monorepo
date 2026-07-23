// Bespoke <vykaz-prace> report XML — the full monthly work breakdown for the
// customer's účetní (no standard schema fits, and the customer reads the PDF;
// this is the machine-readable companion Hleb asked for). Pure string builder,
// unit-testable in node. Groups every service line by facturing type with per-
// group subtotals, then the invoice summary (services − sleva − zálohy = k úhradě).

import type { FakturaceDoc, Party } from "./types"
import { kindLabel } from "./types"
import { computeTotals } from "./calc"

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function stripControl(value: string): string {
  let out = ""
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    out += ch
  }
  return out
}

function clean(value: string): string {
  return esc(stripControl(value))
}

function leaf(tag: string, value: string | number): string {
  const text = typeof value === "number" ? String(value) : value
  const body = clean(text)
  return body === "" ? `<${tag}/>` : `<${tag}>${body}</${tag}>`
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}

function partyXml(tag: string, p: Party): string {
  return [
    `<${tag}>`,
    leaf("nazev", p.nazev),
    leaf("ico", p.ico),
    leaf("dic", p.dic),
    leaf("adresa", [p.ulice, p.cislo].filter(Boolean).join(" ")),
    leaf("psc", p.psc),
    leaf("obec", p.obec),
    `</${tag}>`,
  ].join("")
}

/** Serialize the document as a `<vykaz-prace>` report. */
export function serializeReport(doc: FakturaceDoc): string {
  const totals = computeTotals(doc)

  const groups = totals.groups
    .map((g) => {
      const items = g.items
        .map((lc) =>
          [
            "<polozka>",
            leaf("popis", lc.item.popis),
            leaf("obdobi", lc.item.obdobi || doc.meta.obdobi),
            leaf("mnozstvi", lc.item.mnozstvi),
            leaf("jednotka", lc.item.jednotka),
            leaf("cena", money(lc.item.cena)),
            leaf("cenaCelkem", money(lc.gross)),
            leaf("sleva", money(lc.discount)),
            leaf("celkem", money(lc.net)),
            leaf("poznamka", lc.item.poznamka),
            "</polozka>",
          ].join(""),
        )
        .join("")
      return [
        `<skupina kind="${clean(g.kind)}" nazev="${clean(kindLabel(g.kind))}">`,
        items,
        leaf("mezisoucet", money(g.subtotalNet)),
        "</skupina>",
      ].join("")
    })
    .join("")

  const metrics = doc.reportMetrics
    .map((m) =>
      [
        "<metrika>",
        leaf("popis", m.label),
        leaf("hodnota", m.value),
        "</metrika>",
      ].join(""),
    )
    .join("")

  const filings = doc.filings
    .map((f) =>
      [
        "<hlaseni>",
        leaf("nazev", f.nazev),
        leaf("datum", f.datum),
        "</hlaseni>",
      ].join(""),
    )
    .join("")

  const body = [
    partyXml("dodavatel", doc.supplier),
    partyXml("odberatel", doc.customer),
    "<faktura>",
    leaf("cislo", doc.meta.cisloFaktury),
    leaf("vystaveni", doc.meta.datumVystaveni),
    leaf("obdobi", doc.meta.obdobi),
    "</faktura>",
    `<skupiny>${groups}</skupiny>`,
    `<prehledCinnosti>${metrics}</prehledCinnosti>`,
    `<podanaHlaseni>${filings}</podanaHlaseni>`,
    "<souhrn>",
    leaf("sluzbyCelkem", money(totals.servicesGross)),
    leaf("sleva", money(totals.slevaTotal)),
    leaf("zaklad", money(totals.servicesNet)),
    leaf("zalohy", money(totals.zalohyApplied)),
    leaf("kUhrade", money(totals.kUhrade)),
    leaf("hodinCelkem", totals.hoursTotal),
    "</souhrn>",
    leaf("poznamka", doc.meta.poznamkaReport),
  ].join("")

  return `<?xml version="1.0" encoding="UTF-8"?>\n<vykaz-prace>${body}</vykaz-prace>\n`
}
