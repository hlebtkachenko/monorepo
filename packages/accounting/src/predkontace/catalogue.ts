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
    legalBasis: [`${ZDPH} §92a`],
    confidence: "high",
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
  {
    id: "S-EXEMPT",
    label: "FV — exempt / zero-rated supply (osvobozeno, EU dodání, vývoz)",
    documentSide: "SALES",
    vatMode: "EXEMPT",
    legalBasis: [`${ZDPH} §51`, `${ZDPH} §63-71`],
    confidence: "high",
    entries: [
      { account: "311", side: "DEBIT", basis: "net" },
      {
        account: "604",
        side: "CREDIT",
        basis: "net",
        description: "Osvobozené plnění",
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
