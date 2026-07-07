/**
 * Curated předkontace catalogue — the high-confidence core scenarios,
 * transcribed and normalized from the KB
 * (accountingAfframe/30-predkontace/{sales,purchase}/*.json) into the
 * single-movement form the posting engine expands. This is law-grounded domain
 * CONFIG (not a DB seed, per the EPIC-1 decision): the advisor review verifies
 * each row against ZDPH / Decree 500/2002 / ČÚS. Tenants and the agent layer may
 * also pass ad-hoc PredkontaceScenario objects to the expander.
 *
 * Standard taxable supplies are written in the compact compound form (gross on
 * the receivable/payable, net + VAT on the contra accounts). Reverse-charge /
 * import templates self-assess VAT on 343↔343 (basis self_assessed_vat),
 * computed at posting from base × rate (the koeficient/self-assessment is
 * injected at posting, never stored on the doc).
 *
 * Synthetic account numbers are the směrná-osnova defaults; a tenant whose chart
 * uses analytics passes `accountOverrides` to the expander.
 */

import type { PredkontaceScenario } from "./types"

const ZDPH = "Act 235/2004 Sb."
const DECREE = "Decree 500/2002 Sb."

export const SALES_SCENARIOS: readonly PredkontaceScenario[] = [
  {
    id: "S-GOODS-21",
    label: "FV — domestic goods — plátce — 21%",
    documentSide: "SALES",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §13`, `${DECREE} §20`],
    confidence: "high",
    dapRow: "1",
    khSection: "A4_or_A5",
    entries: [
      {
        account: "311",
        side: "DEBIT",
        basis: "gross",
        description: "Pohledávka",
      },
      {
        account: "604",
        side: "CREDIT",
        basis: "net",
        description: "Tržby za zboží",
      },
      {
        account: "343",
        side: "CREDIT",
        basis: "vat",
        description: "DPH na výstupu 21%",
      },
    ],
  },
  {
    id: "S-GOODS-12",
    label: "FV — domestic goods — plátce — 12%",
    documentSide: "SALES",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §13`, `${ZDPH} §47`],
    confidence: "high",
    dapRow: "2",
    khSection: "A4_or_A5",
    entries: [
      { account: "311", side: "DEBIT", basis: "gross" },
      { account: "604", side: "CREDIT", basis: "net" },
      {
        account: "343",
        side: "CREDIT",
        basis: "vat",
        description: "DPH na výstupu 12%",
      },
    ],
  },
  {
    id: "S-SERVICES-21",
    label: "FV — domestic services — plátce — 21%",
    documentSide: "SALES",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §14`],
    confidence: "high",
    dapRow: "1",
    khSection: "A4_or_A5",
    entries: [
      { account: "311", side: "DEBIT", basis: "gross" },
      {
        account: "602",
        side: "CREDIT",
        basis: "net",
        description: "Tržby za služby",
      },
      { account: "343", side: "CREDIT", basis: "vat" },
    ],
  },
  {
    id: "S-SERVICES-12",
    label: "FV — domestic services — plátce — 12%",
    documentSide: "SALES",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §14`, `${ZDPH} §47`],
    confidence: "high",
    dapRow: "2",
    khSection: "A4_or_A5",
    entries: [
      { account: "311", side: "DEBIT", basis: "gross" },
      { account: "602", side: "CREDIT", basis: "net" },
      { account: "343", side: "CREDIT", basis: "vat" },
    ],
  },
  {
    id: "S-PDP",
    label: "FV — domestic reverse charge (PDP) — seller side",
    documentSide: "SALES",
    vatMode: "REVERSE_CHARGE",
    legalBasis: [`${ZDPH} §92a`, `${ZDPH} §101c`],
    confidence: "high",
    // §92a seller supply is declared in oddíl A.1 of the kontrolní hlášení + DAP ř. 25.
    dapRow: "25",
    khSection: "A1",
    entries: [
      {
        account: "311",
        side: "DEBIT",
        basis: "net",
        description: "Pohledávka (bez DPH — daň odvádí odběratel)",
      },
      { account: "602", side: "CREDIT", basis: "net" },
    ],
  },
  // The next three all book identically (311 / 604 net, no VAT) but are legally
  // distinct plnění that land on DIFFERENT DAP rows and differ on the souhrnné
  // hlášení obligation — kept as separate scenarios so the VAT-return layer can
  // route them (advisor finding: a §64 EU supply must NOT be misfiled as generic
  // domestic exempt, which would silently omit the §102 SH obligation).
  {
    id: "S-EXEMPT-NO-CREDIT",
    label: "FV — exempt supply without credit (§51 — pojištění, nájem, …)",
    documentSide: "SALES",
    vatMode: "EXEMPT",
    legalBasis: [`${ZDPH} §51`],
    confidence: "high",
    dapRow: "50",
    requiresRecapitulativeStatement: false,
    entries: [
      { account: "311", side: "DEBIT", basis: "net" },
      {
        // §51 exempt-without-credit is predominantly a service (pojištění, nájem,
        // finanční, zdravotní) → 602, not 604 (goods).
        account: "602",
        side: "CREDIT",
        basis: "net",
        description: "Osvobozené plnění bez nároku na odpočet",
      },
    ],
  },
  {
    id: "S-EU-GOODS-DELIVERY",
    label:
      "FV — intra-EU supply of goods to a VAT-registered acquirer (§64, zero-rated)",
    documentSide: "SALES",
    // REVERSE_CHARGE — an issued §64 EU supply captures as REVERSE_CHARGE +
    // vat_jurisdiction='EU' (the mode decideVat emits, classify.ts), so this
    // scenario's vat_mode must match or expand.ts throws on the mismatch (#541).
    // The POSTINGS stay base-only (311/604 net, NO 343 daň leg): the expander is
    // driven by `entries`, not by vatMode — an issued EU supply is osvobozeno s
    // nárokem, no output VAT (unlike a RECEIVED reverse-charge, which self-
    // assesses on 343↔343). The §66 export sibling (S-EXPORT) is a separate
    // vatMode conflation tracked in GH #566, out of scope here.
    vatMode: "REVERSE_CHARGE",
    legalBasis: [`${ZDPH} §64`, `${ZDPH} §102`],
    confidence: "high",
    dapRow: "20",
    requiresRecapitulativeStatement: true,
    entries: [
      { account: "311", side: "DEBIT", basis: "net" },
      {
        account: "604",
        side: "CREDIT",
        basis: "net",
        description: "Dodání zboží do EU (osvobozeno s nárokem)",
      },
    ],
  },
  {
    id: "S-EXPORT",
    label: "FV — export of goods to a third country (§66, zero-rated)",
    documentSide: "SALES",
    vatMode: "EXEMPT",
    legalBasis: [`${ZDPH} §66`],
    confidence: "high",
    dapRow: "22",
    requiresRecapitulativeStatement: false,
    entries: [
      { account: "311", side: "DEBIT", basis: "net" },
      {
        account: "604",
        side: "CREDIT",
        basis: "net",
        description: "Vývoz zboží (osvobozeno s nárokem)",
      },
    ],
  },
  {
    // Issued credit note (dobropis vydaný) — opravný daňový doklad lowering the
    // supplier's tax base. Reverses a standard sale: cut the receivable (311),
    // cut the revenue (604/602 via override), reverse the output VAT (343).
    // Mirror of P-CREDIT-NOTE-STD; the caller flips the negative document
    // totals to positive before posting.
    id: "S-CREDIT-NOTE-STD",
    label: "FV dobropis — snížení základu daně (§42) — 21/12 %",
    documentSide: "SALES",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §42`, `${ZDPH} §45`],
    confidence: "high",
    entries: [
      {
        account: "311",
        side: "CREDIT",
        basis: "gross",
        description: "Snížení pohledávky (dobropis)",
      },
      {
        account: "604",
        side: "DEBIT",
        basis: "net",
        description: "Snížení tržeb (dobropis)",
      },
      {
        account: "343",
        side: "DEBIT",
        basis: "vat",
        description: "Oprava DPH na výstupu (§42)",
      },
    ],
  },
] as const

export const PURCHASE_SCENARIOS: readonly PredkontaceScenario[] = [
  {
    id: "P-GOODS-21",
    label: "FP — domestic goods — plátce buyer + seller — 21%",
    documentSide: "PURCHASE",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §72-73`],
    confidence: "high",
    entries: [
      {
        account: "504",
        side: "DEBIT",
        basis: "net",
        description: "Náklady na prodané zboží",
      },
      {
        account: "343",
        side: "DEBIT",
        basis: "vat",
        description: "DPH na vstupu 21%",
      },
      {
        account: "321",
        side: "CREDIT",
        basis: "gross",
        description: "Závazek vůči dodavateli",
      },
    ],
  },
  {
    id: "P-SERVICES-21",
    label: "FP — domestic services — plátce — 21%",
    documentSide: "PURCHASE",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §72-73`],
    confidence: "high",
    entries: [
      {
        account: "518",
        side: "DEBIT",
        basis: "net",
        description: "Ostatní služby",
      },
      { account: "343", side: "DEBIT", basis: "vat" },
      { account: "321", side: "CREDIT", basis: "gross" },
    ],
  },
  {
    id: "P-GOODS-NONDEDUCT",
    label: "FP — domestic goods — neplátce buyer (VAT folds into cost)",
    documentSide: "PURCHASE",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §75`],
    confidence: "high",
    entries: [
      {
        account: "504",
        side: "DEBIT",
        basis: "gross",
        description: "Náklady včetně neodpočtené DPH",
      },
      { account: "321", side: "CREDIT", basis: "gross" },
    ],
  },
  {
    id: "P-PDP",
    label: "FP — domestic reverse charge (PDP) — buyer self-assessment §92e",
    documentSide: "PURCHASE",
    vatMode: "REVERSE_CHARGE",
    legalBasis: [`${ZDPH} §92a`, `${ZDPH} §92e`],
    confidence: "high",
    entries: [
      {
        account: "518",
        side: "DEBIT",
        basis: "net",
        description: "Přijatá služba (PDP)",
      },
      { account: "321", side: "CREDIT", basis: "net" },
      {
        account: "343",
        side: "DEBIT",
        basis: "self_assessed_vat",
        description: "DPH na vstupu (samovyměření)",
      },
      {
        account: "343",
        side: "CREDIT",
        basis: "self_assessed_vat",
        description: "DPH na výstupu (samovyměření)",
      },
    ],
  },
  {
    id: "P-EU-GOODS",
    label: "FP — EU intra-community goods acquisition — plátce (samovyměření)",
    documentSide: "PURCHASE",
    vatMode: "REVERSE_CHARGE",
    legalBasis: [`${ZDPH} §16`, `${ZDPH} §25`],
    confidence: "medium",
    entries: [
      {
        account: "504",
        side: "DEBIT",
        basis: "net",
        description: "Pořízení zboží z EU",
      },
      { account: "321", side: "CREDIT", basis: "net" },
      {
        account: "343",
        side: "DEBIT",
        basis: "self_assessed_vat",
        description: "DPH na vstupu (samovyměření)",
      },
      {
        account: "343",
        side: "CREDIT",
        basis: "self_assessed_vat",
        description: "DPH na výstupu (samovyměření)",
      },
    ],
  },
  {
    id: "P-IMPORT",
    label: "FP — import from 3rd country — plátce (simplified self-assessment)",
    documentSide: "PURCHASE",
    vatMode: "IMPORT",
    legalBasis: [`${ZDPH} §23`, `${ZDPH} §73`],
    confidence: "medium",
    entries: [
      {
        account: "504",
        side: "DEBIT",
        basis: "net",
        description: "Pořízení dovozem (bez cla)",
      },
      { account: "321", side: "CREDIT", basis: "net" },
      {
        account: "343",
        side: "DEBIT",
        basis: "self_assessed_vat",
        description: "DPH na vstupu (dovoz)",
      },
      {
        account: "343",
        side: "CREDIT",
        basis: "self_assessed_vat",
        description: "DPH na výstupu (dovoz)",
      },
    ],
  },
  {
    id: "P-OUTSIDE-VAT",
    label: "FP — supply outside VAT (pojistné, neplátce dodavatel)",
    documentSide: "PURCHASE",
    vatMode: "OUTSIDE_VAT",
    legalBasis: [`${ZDPH} §51`],
    confidence: "high",
    entries: [
      {
        account: "548",
        side: "DEBIT",
        basis: "gross",
        description: "Ostatní provozní náklad",
      },
      { account: "321", side: "CREDIT", basis: "gross" },
    ],
  },
  {
    // Received credit note (dobropis) — opravný daňový doklad that lowers the tax
    // base. Reverses a standard purchase: cut the payable (321), cut the cost
    // (504/501/518 via override), reverse the input VAT (343). The caller flips
    // the negative document totals to positive before posting.
    id: "P-CREDIT-NOTE-STD",
    label: "FP dobropis — snížení základu daně (§42) — 21/12 %",
    documentSide: "PURCHASE",
    vatMode: "STANDARD",
    legalBasis: [`${ZDPH} §42`, `${ZDPH} §74`],
    confidence: "high",
    entries: [
      {
        account: "321",
        side: "DEBIT",
        basis: "gross",
        description: "Snížení závazku vůči dodavateli",
      },
      {
        account: "504",
        side: "CREDIT",
        basis: "net",
        description: "Snížení nákladu (dobropis)",
      },
      {
        account: "343",
        side: "CREDIT",
        basis: "vat",
        description: "Oprava odpočtu DPH (§74)",
      },
    ],
  },
  {
    // Received supply exempt / outside the scope of Czech VAT (e.g. international
    // passenger air transport, §70 — place of supply under §10a, so no §24
    // self-assessment). Whole gross is expensed; no input VAT. Override 518 to
    // the category account (e.g. 512 cestovné) as needed.
    id: "P-EXEMPT-RECEIVED",
    label: "FP — přijaté osvobozené / mimo předmět DPH (bez odpočtu)",
    documentSide: "PURCHASE",
    vatMode: "EXEMPT",
    legalBasis: [`${ZDPH} §51`, `${ZDPH} §70`],
    confidence: "high",
    entries: [
      {
        account: "518",
        side: "DEBIT",
        basis: "gross",
        description: "Náklad (osvobozené plnění, bez odpočtu)",
      },
      {
        account: "321",
        side: "CREDIT",
        basis: "gross",
        description: "Závazek vůči dodavateli",
      },
    ],
  },
] as const

/** All catalogue scenarios indexed by id. */
export const PREDKONTACE_BY_ID: ReadonlyMap<string, PredkontaceScenario> =
  new Map([...SALES_SCENARIOS, ...PURCHASE_SCENARIOS].map((s) => [s.id, s]))

/** Look up a catalogue scenario by id, or throw. */
export function getScenario(id: string): PredkontaceScenario {
  const s = PREDKONTACE_BY_ID.get(id)
  if (!s) {
    throw new Error(`accounting: no předkontace scenario "${id}"`)
  }
  return s
}
