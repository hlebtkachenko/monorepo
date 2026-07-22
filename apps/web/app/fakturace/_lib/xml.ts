// Local XML working file for /fakturace — the ONLY persistence (no server).
// serializeDoc is a pure string builder (node-testable); parseDoc uses the
// browser DOMParser and coerces every field at the boundary, tolerating missing
// or extra nodes so a hand-edited or older file still loads. localStorage mirrors
// the current draft (crash recovery) and the parties (reused across months).

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

const DOC_STORAGE_KEY = "fakturace-doc"
const PARTIES_STORAGE_KEY = "fakturace-parties"

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
export function newId(): string {
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

function text(parent: Element | null, tag: string): string {
  if (!parent) return ""
  const node = parent.getElementsByTagName(tag)[0]
  return node?.textContent ?? ""
}

function num(parent: Element | null, tag: string): number {
  const raw = text(parent, tag).trim().replace(",", ".")
  if (raw === "") return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function child(parent: Element | null, tag: string): Element | null {
  return parent?.getElementsByTagName(tag)[0] ?? null
}

function parseParty(el: Element | null): Party {
  const base = emptyParty()
  if (!el) return base
  return {
    nazev: text(el, "nazev"),
    ico: text(el, "ico"),
    dic: text(el, "dic"),
    ulice: text(el, "ulice"),
    cislo: text(el, "cislo"),
    psc: text(el, "psc"),
    obec: text(el, "obec"),
    stat: text(el, "stat") || base.stat,
    email: text(el, "email"),
    telefon: text(el, "telefon"),
    zapisRejstrik: text(el, "zapisRejstrik"),
  }
}

function parseBank(el: Element | null): BankInfo {
  if (!el) return emptyBank()
  return {
    cisloUctu: text(el, "cisloUctu"),
    kodBanky: text(el, "kodBanky"),
    nazevBanky: text(el, "nazevBanky"),
    iban: text(el, "iban"),
    bic: text(el, "bic"),
  }
}

function parseServices(root: Element): ServiceItem[] {
  const container = child(root, "services")
  if (!container) return []
  const out: ServiceItem[] = []
  const rows = container.getElementsByTagName("service")
  for (let i = 0; i < rows.length; i++) {
    const el = rows[i]!
    const kindAttr = el.getAttribute("kind") ?? ""
    const kind = SERVICE_KIND_SET.has(kindAttr as ServiceKind)
      ? (kindAttr as ServiceKind)
      : "jednorazova"
    out.push({
      id: newId(),
      kind,
      popis: text(el, "popis"),
      mnozstvi: num(el, "mnozstvi"),
      jednotka: text(el, "jednotka") || kindUnit(kind),
      cena: num(el, "cena"),
      obdobi: text(el, "obdobi"),
      poznamka: text(el, "poznamka"),
    })
  }
  return out
}

function parseZalohy(root: Element): Zaloha[] {
  const container = child(root, "zalohy")
  if (!container) return []
  const out: Zaloha[] = []
  const rows = container.getElementsByTagName("zaloha")
  for (let i = 0; i < rows.length; i++) {
    const el = rows[i]!
    out.push({
      id: newId(),
      cisloDokladu: text(el, "cisloDokladu"),
      datumUhrady: text(el, "datumUhrady"),
      castka: num(el, "castka"),
      popis: text(el, "popis"),
    })
  }
  return out
}

function parseSleva(root: Element): Sleva {
  const el = child(root, "sleva")
  const base = emptySleva()
  if (!el) return base
  const modeAttr = el.getAttribute("mode") ?? ""
  const mode: SlevaMode =
    modeAttr === "percent" || modeAttr === "fixed" || modeAttr === "none"
      ? modeAttr
      : "none"
  return {
    mode,
    percent: num(el, "percent"),
    fixed: num(el, "fixed"),
    label: text(el, "label") || base.label,
  }
}

function parseMeta(root: Element): InvoiceMeta {
  const el = child(root, "meta")
  const base = emptyMeta()
  if (!el) return base
  return {
    cisloFaktury: text(el, "cisloFaktury"),
    variabilniSymbol: text(el, "variabilniSymbol"),
    datumVystaveni: text(el, "datumVystaveni"),
    datumSplatnosti: text(el, "datumSplatnosti"),
    datumUskutecneni: text(el, "datumUskutecneni"),
    obdobi: text(el, "obdobi"),
    zpusobUhrady: text(el, "zpusobUhrady") || base.zpusobUhrady,
    vystavil: text(el, "vystavil"),
    poznamkaFaktura: text(el, "poznamkaFaktura"),
    poznamkaReport: text(el, "poznamkaReport"),
  }
}

/** Parse a working-file XML string into a document. Throws only on malformed
 * XML (a `<parsererror>` node); every field otherwise coerces to a safe value. */
export function parseDoc(xml: string): FakturaceDoc {
  const dom = new DOMParser().parseFromString(xml, "application/xml")
  if (dom.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Neplatný XML soubor.")
  }
  const root = dom.documentElement
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

// --- localStorage ------------------------------------------------------------

export function saveLocal(doc: FakturaceDoc): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DOC_STORAGE_KEY, serializeDoc(doc))
  } catch {
    // storage full / unavailable — non-fatal.
  }
}

export function loadLocal(): FakturaceDoc | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DOC_STORAGE_KEY)
    if (!raw) return null
    return parseDoc(raw)
  } catch {
    return null
  }
}

/** Persist ONLY the parties (supplier + bank + customer) so they survive a
 * services reset and can seed next month's invoice. */
export function saveParties(doc: FakturaceDoc): void {
  if (typeof window === "undefined") return
  try {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<fakturace-parties>",
      partyXml("supplier", doc.supplier),
      bankXml(doc.bank),
      partyXml("customer", doc.customer),
      "</fakturace-parties>",
    ].join("")
    window.localStorage.setItem(PARTIES_STORAGE_KEY, xml)
  } catch {
    // non-fatal
  }
}

export function loadParties(): Pick<
  FakturaceDoc,
  "supplier" | "bank" | "customer"
> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(PARTIES_STORAGE_KEY)
    if (!raw) return null
    const dom = new DOMParser().parseFromString(raw, "application/xml")
    if (dom.getElementsByTagName("parsererror").length > 0) return null
    const root = dom.documentElement
    return {
      supplier: parseParty(child(root, "supplier")),
      bank: parseBank(child(root, "bank")),
      customer: parseParty(child(root, "customer")),
    }
  } catch {
    return null
  }
}
