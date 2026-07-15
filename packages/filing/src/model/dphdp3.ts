// Typed DPHDP3 (Přiznání k DPH) model — the seam the UI binds to. Structure mirrors
// the vendored XSD (packages/filing/schemas/fu/dphdp3/03.01.03/dphdp3_epo2.xsd):
// a typed hlavička (VetaD) + poplatník (VetaP), plus the value věty (Veta1..6) held
// as per-attribute string records so ANY attribute round-trips losslessly and the
// accounting adapter fills the subset it knows. Amount strings are whole koruna
// (XSD fractionDigits=0); the writer emits them verbatim, the validator is the gate.

import { z } from "zod"

/** Schema version pinned to the vendored XSD. */
export const DPHDP3_VERSION = "03.01.03"

/** VetaD — hlavička. Codes/dates only (no amounts). */
export const Dphdp3HeaderSchema = z.object({
  /** Typ dokumentu — "DP3". */
  dokument: z.string().default("DP3"),
  /** Kód uladis — "DPH". */
  k_uladis: z.string().default("DPH"),
  /** Forma přiznání (maxLen 1): "B" řádné, "O" opravné, "D" dodatečné, "E" opr.+dod. */
  dapdph_forma: z.string().default("B"),
  /** Typ plátce (maxLen 1): "P" plátce. */
  typ_platce: z.string().default("P"),
  /** Rok zdaňovacího období (YYYY). */
  rok: z.string(),
  /** Měsíc 1–12 (monthly filers). */
  mesic: z.string().optional(),
  /** Čtvrtletí 1–4 (quarterly filers). */
  ctvrt: z.string().optional(),
  /** Období od (ISO or D.M.YYYY). */
  zdobd_od: z.string().optional(),
  /** Období do. */
  zdobd_do: z.string().optional(),
  /** Převažující ekonomická činnost (CZ-NACE), digits. */
  c_okec: z.string().optional(),
})

/** VetaP — poplatník. */
export const Dphdp3PayerSchema = z.object({
  /** Kód finančního úřadu (3-digit). */
  c_ufo: z.string(),
  /** Kód pracoviště FÚ (optional). */
  c_pracufo: z.string().optional(),
  /** DIČ — digits only, no "CZ" prefix (writer strips it). */
  dic: z.string(),
  /** Typ daňového subjektu (maxLen 1): "P" právnická, "F" fyzická. */
  typ_ds: z.string().default("P"),
  /** Obchodní jméno / název (≤255). */
  zkrobchjm: z.string().optional(),
  /** Jméno / příjmení / titul (fyzická osoba). */
  jmeno: z.string().optional(),
  prijmeni: z.string().optional(),
  titul: z.string().optional(),
  /** Adresa. */
  naz_obce: z.string().optional(),
  ulice: z.string().optional(),
  c_pop: z.string().optional(),
  c_orient: z.string().optional(),
  psc: z.string().optional(),
  stat: z.string().optional(),
  email: z.string().optional(),
  c_telef: z.string().optional(),
})

/** One value věta as a raw attribute→value record (whole-koruna amount strings). */
const VetaRecordSchema = z.record(z.string(), z.string())

export const Dphdp3Schema = z.object({
  /** Optional schema version echoed onto <DPHDP3 verzePis>. */
  verze: z.string().default(DPHDP3_VERSION),
  header: Dphdp3HeaderSchema,
  payer: Dphdp3PayerSchema,
  /** Zdanitelná plnění na výstupu (ř.1–13). */
  veta1: VetaRecordSchema.optional(),
  /** Ostatní plnění s nárokem na odpočet (ř.20–26). */
  veta2: VetaRecordSchema.optional(),
  /** Doplňující údaje (ř.30–34). */
  veta3: VetaRecordSchema.optional(),
  /** Nárok na odpočet daně (ř.40–47). */
  veta4: VetaRecordSchema.optional(),
  /** Osvobozená plnění bez nároku + krácení/vypořádání odpočtu (ř.50–53). */
  veta5: VetaRecordSchema.optional(),
  /** Výpočet daňové povinnosti (ř.61–66). */
  veta6: VetaRecordSchema.optional(),
})

export type Dphdp3 = z.infer<typeof Dphdp3Schema>
export type Dphdp3Input = z.input<typeof Dphdp3Schema>
export type Dphdp3Header = z.infer<typeof Dphdp3HeaderSchema>
export type Dphdp3Payer = z.infer<typeof Dphdp3PayerSchema>
