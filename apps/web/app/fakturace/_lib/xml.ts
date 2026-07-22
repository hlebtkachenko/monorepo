// Local XML working file for /fakturace — the ONLY persistence (no server, no
// browser storage of the data). serializeDoc is a pure string builder;
// parseDoc validates + parses with fast-xml-parser (no DOM, no external-entity
// resolution) and coerces every field at the boundary, tolerating missing or
// extra nodes so a hand-edited or older file still loads.

import { XMLParser, XMLValidator } from "fast-xml-parser"

import type {
  BankInfo,
  FakturaceDoc,
  InvoiceMeta,
  Party,
  ServiceItem,
  ServiceKind,
  Sleva,
  SlevaMode,
  Zaloha,
} from "./types"
import { kindUnit } from "./types"

const SERVICE_KIND_SET = new Set<ServiceKind>([
  "mesicni",
  "jednorazova",
  "hodinova",
  "polozky",
  "mzdy",
  "zaverka",
  "smluvni",
])

// --- factory -----------------------------------------------------------------

function emptyParty(): Party {
  return {
    nazev: "",
    ico: "",
    dic: "",
    ulice: "",
    cislo: "",
    psc: "",
    obec: "",
    stat: "Česká republika",
    email: "",
    telefon: "",
    zapisRejstrik: "",
  }
}

function emptyBank(): BankInfo {
  return { cisloUctu: "", kodBanky: "", nazevBanky: "", iban: "", bic: "" }
}

function emptyMeta(): InvoiceMeta {
  return {
    cisloFaktury: "",
    variabilniSymbol: "",
    datumVystaveni: "",
    datumSplatnosti: "",
    datumUskutecneni: "",
    obdobi: "",
    zpusobUhrady: "Bankovní převod",
    vystavil: "",
    poznamkaFaktura: "",
    poznamkaReport: "",
  }
}

function emptySleva(): Sleva {
  return { mode: "none", percent: 0, fixed: 0, label: "Sleva" }
}

/** A fresh, fully blank document. */
export function emptyDoc(): FakturaceDoc {
  return {
    version: 1,
    supplier: emptyParty(),
    bank: emptyBank(),
    customer: emptyParty(),
    services: [],
    zalohy: [],
    sleva: emptySleva(),
    meta: emptyMeta(),
  }
}

/** Runtime-only id for a service / záloha row (React key; never serialized). */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function newService(kind: ServiceKind): ServiceItem {
  return {
    id: newId(),
    kind,
    popis: "",
    mnozstvi: 1,
    jednotka: kindUnit(kind),
    cena: 0,
    obdobi: "",
    poznamka: "",
  }
}

export function newZaloha(): Zaloha {
  return {
    id: newId(),
    cisloDokladu: "",
    datumUhrady: "",
    castka: 0,
    popis: "",
  }
}

// --- serialize (pure) --------------------------------------------------------

/** Escape the five XML-significant characters. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Drop characters illegal in XML 1.0 (control chars except tab/LF/CR). */
function stripControl(value: string): string {
  let out = ""
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    // Keep tab (0x09), LF (0x0A), CR (0x0D); drop the other C0 control chars
    // that XML 1.0 forbids.
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    out += ch
  }
  return out
}

function clean(value: string): string {
  return esc(stripControl(value))
}

/** A leaf element `<tag>text</tag>` (self-closing when empty). */
function leaf(tag: string, value: string | number): string {
  const text = typeof value === "number" ? String(value) : value
  const body = clean(text)
  return body === "" ? `<${tag}/>` : `<${tag}>${body}</${tag}>`
}

function partyXml(tag: string, p: Party): string {
  return [
    `<${tag}>`,
    leaf("nazev", p.nazev),
    leaf("ico", p.ico),
    leaf("dic", p.dic),
    leaf("ulice", p.ulice),
    leaf("cislo", p.cislo),
    leaf("psc", p.psc),
    leaf("obec", p.obec),
    leaf("stat", p.stat),
    leaf("email", p.email),
    leaf("telefon", p.telefon),
    leaf("zapisRejstrik", p.zapisRejstrik),
    `</${tag}>`,
  ].join("")
}

function bankXml(b: BankInfo): string {
  return [
    "<bank>",
    leaf("cisloUctu", b.cisloUctu),
    leaf("kodBanky", b.kodBanky),
    leaf("nazevBanky", b.nazevBanky),
    leaf("iban", b.iban),
    leaf("bic", b.bic),
    "</bank>",
  ].join("")
}

function servicesXml(items: ServiceItem[]): string {
  const rows = items
    .map((s) =>
      [
        `<service kind="${clean(s.kind)}">`,
        leaf("popis", s.popis),
        leaf("mnozstvi", s.mnozstvi),
        leaf("jednotka", s.jednotka),
        leaf("cena", s.cena),
        leaf("obdobi", s.obdobi),
        leaf("poznamka", s.poznamka),
        "</service>",
      ].join(""),
    )
    .join("")
  return `<services>${rows}</services>`
}

function zalohyXml(items: Zaloha[]): string {
  const rows = items
    .map((z) =>
      [
        "<zaloha>",
        leaf("cisloDokladu", z.cisloDokladu),
        leaf("datumUhrady", z.datumUhrady),
        leaf("castka", z.castka),
        leaf("popis", z.popis),
        "</zaloha>",
      ].join(""),
    )
    .join("")
  return `<zalohy>${rows}</zalohy>`
}

function slevaXml(s: Sleva): string {
  return [
    `<sleva mode="${clean(s.mode)}">`,
    leaf("percent", s.percent),
    leaf("fixed", s.fixed),
    leaf("label", s.label),
    "</sleva>",
  ].join("")
}

function metaXml(m: InvoiceMeta): string {
  return [
    "<meta>",
    leaf("cisloFaktury", m.cisloFaktury),
    leaf("variabilniSymbol", m.variabilniSymbol),
    leaf("datumVystaveni", m.datumVystaveni),
    leaf("datumSplatnosti", m.datumSplatnosti),
    leaf("datumUskutecneni", m.datumUskutecneni),
    leaf("obdobi", m.obdobi),
    leaf("zpusobUhrady", m.zpusobUhrady),
    leaf("vystavil", m.vystavil),
    leaf("poznamkaFaktura", m.poznamkaFaktura),
    leaf("poznamkaReport", m.poznamkaReport),
    "</meta>",
  ].join("")
}

/** Serialize the whole document to the `<fakturace-draft>` working file. */
export function serializeDoc(doc: FakturaceDoc): string {
  const body = [
    partyXml("supplier", doc.supplier),
    bankXml(doc.bank),
    partyXml("customer", doc.customer),
    servicesXml(doc.services),
    zalohyXml(doc.zalohy),
    slevaXml(doc.sleva),
    metaXml(doc.meta),
  ].join("")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<fakturace-draft version="1">${body}</fakturace-draft>\n`
}

// --- parse (DOMParser, boundary coercion) ------------------------------------

type XmlObj = Record<string, unknown>

function isObj(v: unknown): v is XmlObj {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Coerce a parsed node value to a plain string ("" for absent/empty/object). */
function str(v: unknown): string {
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return ""
}

function field(parent: XmlObj | null, tag: string): string {
  return parent ? str(parent[tag]) : ""
}

function num(parent: XmlObj | null, tag: string): number {
  const raw = field(parent, tag).trim().replace(",", ".")
  if (raw === "") return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function attr(parent: XmlObj | null, name: string): string {
  return parent ? str(parent[`@_${name}`]) : ""
}

function child(parent: XmlObj | null, tag: string): XmlObj | null {
  const v = parent?.[tag]
  return isObj(v) ? v : null
}

/** A repeated element is an array when >1, a bare object when exactly 1. */
function asArray(v: unknown): XmlObj[] {
  if (Array.isArray(v)) return v.filter(isObj)
  return isObj(v) ? [v] : []
}

function parseParty(el: XmlObj | null): Party {
  const base = emptyParty()
  if (!el) return base
  return {
    nazev: field(el, "nazev"),
    ico: field(el, "ico"),
    dic: field(el, "dic"),
    ulice: field(el, "ulice"),
    cislo: field(el, "cislo"),
    psc: field(el, "psc"),
    obec: field(el, "obec"),
    stat: field(el, "stat") || base.stat,
    email: field(el, "email"),
    telefon: field(el, "telefon"),
    zapisRejstrik: field(el, "zapisRejstrik"),
  }
}

function parseBank(el: XmlObj | null): BankInfo {
  if (!el) return emptyBank()
  return {
    cisloUctu: field(el, "cisloUctu"),
    kodBanky: field(el, "kodBanky"),
    nazevBanky: field(el, "nazevBanky"),
    iban: field(el, "iban"),
    bic: field(el, "bic"),
  }
}

function parseServices(root: XmlObj | null): ServiceItem[] {
  return asArray(child(root, "services")?.service).map((el) => {
    const kindAttr = attr(el, "kind")
    const kind = SERVICE_KIND_SET.has(kindAttr as ServiceKind)
      ? (kindAttr as ServiceKind)
      : "jednorazova"
    return {
      id: newId(),
      kind,
      popis: field(el, "popis"),
      mnozstvi: num(el, "mnozstvi"),
      jednotka: field(el, "jednotka") || kindUnit(kind),
      cena: num(el, "cena"),
      obdobi: field(el, "obdobi"),
      poznamka: field(el, "poznamka"),
    }
  })
}

function parseZalohy(root: XmlObj | null): Zaloha[] {
  return asArray(child(root, "zalohy")?.zaloha).map((el) => ({
    id: newId(),
    cisloDokladu: field(el, "cisloDokladu"),
    datumUhrady: field(el, "datumUhrady"),
    castka: num(el, "castka"),
    popis: field(el, "popis"),
  }))
}

function parseSleva(root: XmlObj | null): Sleva {
  const el = child(root, "sleva")
  const base = emptySleva()
  if (!el) return base
  const modeAttr = attr(el, "mode")
  const mode: SlevaMode =
    modeAttr === "percent" || modeAttr === "fixed" || modeAttr === "none"
      ? modeAttr
      : "none"
  return {
    mode,
    percent: num(el, "percent"),
    fixed: num(el, "fixed"),
    label: field(el, "label") || base.label,
  }
}

function parseMeta(root: XmlObj | null): InvoiceMeta {
  const el = child(root, "meta")
  const base = emptyMeta()
  if (!el) return base
  return {
    cisloFaktury: field(el, "cisloFaktury"),
    variabilniSymbol: field(el, "variabilniSymbol"),
    datumVystaveni: field(el, "datumVystaveni"),
    datumSplatnosti: field(el, "datumSplatnosti"),
    datumUskutecneni: field(el, "datumUskutecneni"),
    obdobi: field(el, "obdobi"),
    zpusobUhrady: field(el, "zpusobUhrady") || base.zpusobUhrady,
    vystavil: field(el, "vystavil"),
    poznamkaFaktura: field(el, "poznamkaFaktura"),
    poznamkaReport: field(el, "poznamkaReport"),
  }
}

const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every value a string (leading zeros in IČO / VS / account numbers must
  // survive); numeric fields are coerced explicitly in `num`.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

/** Parse a working-file XML string into a document. Throws on malformed XML;
 * every field otherwise coerces to a safe value, tolerating missing/extra nodes. */
export function parseDoc(xml: string): FakturaceDoc {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("Neplatný XML soubor.")
  }
  const tree = PARSER.parse(xml) as XmlObj
  const root = child(tree, "fakturace-draft")
  return {
    version: 1,
    supplier: parseParty(child(root, "supplier")),
    bank: parseBank(child(root, "bank")),
    customer: parseParty(child(root, "customer")),
    services: parseServices(root),
    zalohy: parseZalohy(root),
    sleva: parseSleva(root),
    meta: parseMeta(root),
  }
}

// --- file export / import ----------------------------------------------------

function sanitizeFilename(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  return ascii
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

/** Working-file name, keyed by invoice number / period so monthly files differ. */
export function docFilename(doc: FakturaceDoc): string {
  const base = [doc.meta.cisloFaktury || "faktura", doc.meta.obdobi]
    .filter(Boolean)
    .join("-")
  const slug = sanitizeFilename(base)
  return `${slug || "fakturace"}.xml`
}

/** Trigger a browser download of an XML string. */
export function downloadXml(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Read + parse a user-selected working file into a document. */
export async function importDocFile(file: File): Promise<FakturaceDoc> {
  return parseDoc(await file.text())
}
