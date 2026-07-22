// Shared contract for the /fakturace invoicing tool. Standalone, login-free,
// no platform coupling and NO org or personal data hardcoded — every field is
// filled by the user. Amounts are plain Kč numbers as entered; exact money math
// (banker's rounding, matching the ISDOC writer) happens in calc.ts.
//
// The whole editable state is one FakturaceDoc, (de)serialized to the local XML
// working file (xml.ts) and mapped to ISDOC / the report at export time.

/** Supplier or customer identification block (dodavatel / odběratel). */
export interface Party {
  nazev: string // Obchodní firma / jméno
  ico: string
  dic: string // Neplátce: usually empty. Kept for completeness.
  ulice: string // ulice + č.p./č.o.
  cislo: string // číslo popisné/orientační (kept separate for ISDOC BuildingNumber)
  psc: string
  obec: string
  stat: string
  email: string
  telefon: string
  // Generic register note — covers živnostenský rejstřík (OSVČ) AND obchodní
  // rejstřík (spisová značka), per §435 NOZ. Free text.
  zapisRejstrik: string
}

/** Supplier bank details for a transfer-payment invoice. */
export interface BankInfo {
  cisloUctu: string // číslo účtu (local format), e.g. "123456789/0800"
  kodBanky: string // kód banky, e.g. "0800"
  nazevBanky: string
  iban: string
  bic: string
}

/** Type of facturing a service line belongs to (drives step-3 grouping). */
export type ServiceKind =
  | "mesicni" // měsíční paušál
  | "jednorazova" // jednorázová služba
  | "hodinova" // hodinová práce
  | "polozky" // účtování po řádcích / položkách
  | "mzdy" // mzdy / personalistika (HR)
  | "zaverka" // roční závěrka
  | "smluvni" // smluvní práce

/** One billed service line. `mnozstvi × cena` = line total (Kč). */
export interface ServiceItem {
  id: string
  kind: ServiceKind
  popis: string // description
  mnozstvi: number // qty: hours / months / lines / headcount / 1
  jednotka: string // unit label: hod, měs, ks, položka, zaměstnanec…
  cena: number // unit price, Kč
  /** Optional per-line period (paušál 06/2025 vs roční závěrka 2024); falls
   * back to meta.obdobi when empty. */
  obdobi: string
  /** Report-only note — carries the actual work detail for flat-fee lines. */
  poznamka: string
}

/**
 * One prepaid advance already paid by the customer, deducted from the final
 * invoice ("odečet uhrazených záloh"). Carries the advance-document number and
 * payment date so the customer's účetní can reconcile it against their
 * poskytnutá záloha (314).
 */
export interface Zaloha {
  id: string
  cisloDokladu: string // číslo zálohové faktury / dokladu
  datumUhrady: string // datum úhrady zálohy
  castka: number // Kč
  popis: string
}

export type SlevaMode = "none" | "percent" | "fixed"

/** Whole-invoice discount, applied to the services subtotal before záloha
 * deduction. `percent` of the subtotal, or a `fixed` Kč amount. */
export interface Sleva {
  mode: SlevaMode
  percent: number // when mode === "percent"
  fixed: number // Kč, when mode === "fixed"
  label: string // free label rendered on the invoice
}

/** Invoice-level metadata (identity of the document + its dates). */
export interface InvoiceMeta {
  cisloFaktury: string
  variabilniSymbol: string
  datumVystaveni: string // datum vystavení
  datumSplatnosti: string // datum splatnosti
  // Neplátce has no "zdanitelné plnění"; this is the accounting supply date
  // (okamžik uskutečnění účetního případu, §11 z. o účetnictví).
  datumUskutecneni: string // Datum uskutečnění plnění
  obdobi: string // global fallback fakturační období, e.g. "Červen 2025"
  zpusobUhrady: string // e.g. "Bankovní převod"
  vystavil: string // osoba, která doklad vystavila (§11)
  poznamkaFaktura: string // extra free text on the invoice
  poznamkaReport: string // extra free text on the report
}

/** The full editable document — matches the exported XML working file. */
export interface FakturaceDoc {
  version: 1
  supplier: Party
  bank: BankInfo
  customer: Party
  services: ServiceItem[]
  zalohy: Zaloha[]
  sleva: Sleva
  meta: InvoiceMeta
}

/** Display metadata for each service kind (label + default unit). Order here is
 * the render order of the groups on the services step + the report. */
export const SERVICE_KINDS: {
  kind: ServiceKind
  label: string
  jednotka: string
}[] = [
  { kind: "mesicni", label: "Měsíční paušál", jednotka: "měs" },
  { kind: "hodinova", label: "Hodinová práce", jednotka: "hod" },
  { kind: "polozky", label: "Účtování po položkách", jednotka: "položka" },
  { kind: "mzdy", label: "Mzdy / personalistika", jednotka: "zaměstnanec" },
  { kind: "zaverka", label: "Roční závěrka", jednotka: "ks" },
  { kind: "jednorazova", label: "Jednorázová služba", jednotka: "ks" },
  { kind: "smluvni", label: "Smluvní práce", jednotka: "ks" },
]

/** Czech label for one service kind. */
export function kindLabel(kind: ServiceKind): string {
  return SERVICE_KINDS.find((k) => k.kind === kind)?.label ?? kind
}

/** Default unit label for one service kind. */
export function kindUnit(kind: ServiceKind): string {
  return SERVICE_KINDS.find((k) => k.kind === kind)?.jednotka ?? "ks"
}
