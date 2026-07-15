// Typed DPHKH1 (Kontrolní hlášení) model — the UI seam. Structure mirrors the
// vendored XSD (packages/filing/schemas/fu/dphkh1/03.01.14/dphkh1_epo2.xsd): a typed
// hlavička (VetaD) + poplatník (VetaP), then the row věty A.1/A.2/A.4/A.5/B.1/B.2/B.3
// and the optional VetaC checksums. The row structure maps cleanly from the accounting
// KH output. Amount strings are haléře ("1000.00", XSD fractionDigits=2); the writer
// emits them verbatim, xmllint-wasm against the XSD is the gate.

import { z } from "zod"

/** Schema version pinned to the vendored XSD. */
export const DPHKH1_VERSION = "03.01.14"

/** VetaD — hlavička. */
export const Dphkh1HeaderSchema = z.object({
  dokument: z.string().default("KH1"),
  k_uladis: z.string().default("DPH"),
  /** Forma (maxLen 1): "B" řádné, "O" opravné, "N" následné. */
  khdph_forma: z.string().default("B"),
  rok: z.string(),
  mesic: z.string().optional(),
  ctvrt: z.string().optional(),
  zdobd_od: z.string().optional(),
  zdobd_do: z.string().optional(),
})

/** VetaP — poplatník (same identity shape as DPHDP3). */
export const Dphkh1PayerSchema = z.object({
  c_ufo: z.string(),
  c_pracufo: z.string().optional(),
  dic: z.string(),
  typ_ds: z.string().default("P"),
  zkrobchjm: z.string().optional(),
  jmeno: z.string().optional(),
  prijmeni: z.string().optional(),
  titul: z.string().optional(),
  naz_obce: z.string().optional(),
  ulice: z.string().optional(),
  c_pop: z.string().optional(),
  c_orient: z.string().optional(),
  psc: z.string().optional(),
  stat: z.string().optional(),
  email: z.string().optional(),
  c_telef: z.string().optional(),
})

/** Rate-bucket amounts shared by A.2/A.4/A.5/B.1/B.2/B.3 (1 = 21 %, 2 = 12 %, 3 = legacy). */
const rateBuckets = {
  zakl_dane1: z.string().optional(),
  dan1: z.string().optional(),
  zakl_dane2: z.string().optional(),
  dan2: z.string().optional(),
  zakl_dane3: z.string().optional(),
  dan3: z.string().optional(),
}

/** A.1 — uskutečněná plnění v režimu PDP, DODAVATEL (§92): base only, §92 kód. */
export const Dphkh1A1RowSchema = z.object({
  c_radku: z.string().optional(),
  dic_odb: z.string(),
  c_evid_dd: z.string(),
  duzp: z.string(),
  zakl_dane1: z.string(),
  kod_pred_pl: z.string(),
})

/** A.2 — přijatá plnění, příjemce přiznává daň (§16/§9(1)/§108). */
export const Dphkh1A2RowSchema = z.object({
  c_radku: z.string().optional(),
  k_stat: z.string().optional(),
  vatid_dod: z.string().optional(),
  c_evid_dd: z.string().optional(),
  dppd: z.string(),
  ...rateBuckets,
})

/** A.4 — uskutečněná zdanitelná plnění > 10 000 Kč s DIČ. */
export const Dphkh1A4RowSchema = z.object({
  c_radku: z.string().optional(),
  dic_odb: z.string(),
  c_evid_dd: z.string(),
  dppd: z.string(),
  ...rateBuckets,
  /** Kód režimu plnění (maxLen 1): "0" běžný, "1" §89 zvláštní, "2" §90. */
  kod_rezim_pl: z.string().default("0"),
  /** §44 oprava daně u pohledávek (maxLen 1): "N" ne, "A" ano, "P". */
  zdph_44: z.string().default("N"),
})

/** A.5 / B.3 — souhrnný řádek za plnění ≤ 10 000 Kč. */
export const Dphkh1AggregateSchema = z.object(rateBuckets)

/** B.1 — přijatá plnění v režimu PDP, ODBĚRATEL (§92 domestic). */
export const Dphkh1B1RowSchema = z.object({
  c_radku: z.string().optional(),
  dic_dod: z.string(),
  c_evid_dd: z.string(),
  duzp: z.string(),
  ...rateBuckets,
  kod_pred_pl: z.string(),
})

/** B.2 — přijatá zdanitelná plnění > 10 000 Kč s DIČ. */
export const Dphkh1B2RowSchema = z.object({
  c_radku: z.string().optional(),
  dic_dod: z.string(),
  c_evid_dd: z.string(),
  dppd: z.string(),
  ...rateBuckets,
  /** Poměr (maxLen 1): "N" ne, "A" ano (§75 poměrný nárok). */
  pomer: z.string().default("N"),
  zdph_44: z.string().default("N"),
})

export const Dphkh1Schema = z.object({
  verze: z.string().default(DPHKH1_VERSION),
  header: Dphkh1HeaderSchema,
  payer: Dphkh1PayerSchema,
  a1: z.array(Dphkh1A1RowSchema).optional(),
  a2: z.array(Dphkh1A2RowSchema).optional(),
  a4: z.array(Dphkh1A4RowSchema).optional(),
  a5: Dphkh1AggregateSchema.optional(),
  b1: z.array(Dphkh1B1RowSchema).optional(),
  b2: z.array(Dphkh1B2RowSchema).optional(),
  b3: Dphkh1AggregateSchema.optional(),
  /** VetaC — kontrolní součty vs DPH přiznání. */
  c: z.record(z.string(), z.string()).optional(),
})

export type Dphkh1 = z.infer<typeof Dphkh1Schema>
export type Dphkh1Input = z.input<typeof Dphkh1Schema>
export type Dphkh1Header = z.infer<typeof Dphkh1HeaderSchema>
export type Dphkh1Payer = z.infer<typeof Dphkh1PayerSchema>
export type Dphkh1A1Row = z.infer<typeof Dphkh1A1RowSchema>
export type Dphkh1A2Row = z.infer<typeof Dphkh1A2RowSchema>
export type Dphkh1A4Row = z.infer<typeof Dphkh1A4RowSchema>
export type Dphkh1B1Row = z.infer<typeof Dphkh1B1RowSchema>
export type Dphkh1B2Row = z.infer<typeof Dphkh1B2RowSchema>
export type Dphkh1Aggregate = z.infer<typeof Dphkh1AggregateSchema>
