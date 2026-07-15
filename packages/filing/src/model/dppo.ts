// Typed DPPO (Přiznání k dani z příjmů právnických osob) model — the seam the UI
// binds to. Structure mirrors the vendored XSD
// (packages/filing/schemas/fu/dppo/05.01.01/dppdp9_epo2.xsd): a hlavička (VetaD) +
// poplatník (VetaP) + the II. oddíl daňová část (VetaO), all held as per-attribute
// string records so ANY attribute round-trips losslessly and the accounting adapter
// fills only the subset it computes. DPPO is the largest CZ form (53 věty, 626
// attributes) — the many přílohy věty (účetní závěrka VetaUA…VetaUU, spojené osoby
// VetaA/VetaCF, …) are NOT modeled field-by-field; they round-trip verbatim through
// `extraVety` so an uploaded real return re-exports unchanged and XSD-valid. Amount
// strings are whole koruna (XSD fractionDigits=0); the writer emits them verbatim,
// the validator is the gate.

import { z } from "zod"

/** Schema version pinned to the vendored XSD (DPPDP9). */
export const DPPO_VERSION = "05.01.01"

/** One věta as a raw attribute→value record (whole-koruna amount strings). */
const VetaRecordSchema = z.record(z.string(), z.string())

/**
 * A verbatim passthrough věta (a příloha the model does not type field-by-field).
 * Captured on read and re-emitted on write in the XSD sequence order, so every
 * attribute of an uploaded return round-trips losslessly.
 */
export const DppoExtraVetaSchema = z.object({
  tag: z.string(),
  attrs: VetaRecordSchema,
})

export const DppoSchema = z.object({
  /** Optional schema version echoed onto <DPPDP9 verzePis>. */
  verze: z.string().default(DPPO_VERSION),
  /**
   * VetaD — hlavička. Codes + dates + účetní-závěrka scope flags. Required by the
   * XSD: `typ_dapdpp`, `typ_zo`, `typ_popldpp`, `c_ufo_cil`, `zdobd_od`, `zdobd_do`,
   * `dapdpp_forma` (the writer injects the fixed `dokument`="DP9" / `k_uladis`="DPP").
   */
  header: VetaRecordSchema,
  /** VetaP — poplatník (identity + adresa + zástupce). Optional in the XSD (0..1). */
  payer: VetaRecordSchema.optional(),
  /** VetaO — II. oddíl, daň z příjmů (ř.10–360). Required in the XSD (1..1). */
  vetaO: VetaRecordSchema.optional(),
  /**
   * Every other věta of the document (přílohy), verbatim, in XSD sequence order.
   * The accounting/adapter path leaves this empty; an uploaded return keeps all of
   * its přílohy here so re-export is lossless.
   */
  extraVety: z.array(DppoExtraVetaSchema).default([]),
})

export type Dppo = z.infer<typeof DppoSchema>
export type DppoInput = z.input<typeof DppoSchema>
export type DppoExtraVeta = z.infer<typeof DppoExtraVetaSchema>

/**
 * The přílohy věty of DPPDP9, in the XSD `<xs:sequence>` order (everything after
 * VetaD/VetaP/VetaO). Read collects occurrences of each into `extraVety`; write
 * re-emits them in this order, so the document stays schema-ordered and XSD-valid.
 */
export const DPPO_EXTRA_VETA_TAGS = [
  "VetaU",
  "VetaE",
  "VetaF",
  "VetaG",
  "VetaV",
  "VetaI",
  "VetaJ",
  "VetaL",
  "VetaM",
  "VetaN",
  "VetaQ",
  "VetaS",
  "VetaR",
  "VetaW",
  "VetaT",
  "VetaZ",
  "VetaUA",
  "VetaUB",
  "VetaUD",
  "VetaUE",
  "VetaUF",
  "VetaUG",
  "VetaUH",
  "VetaUI",
  "VetaUJ",
  "VetaUK",
  "VetaUL",
  "VetaUN",
  "VetaUO",
  "VetaUP",
  "VetaUQ",
  "VetaUR",
  "VetaUS",
  "VetaUT",
  "VetaUV",
  "VetaUU",
  "VetaA",
  "VetaB",
  "VetaC",
  "VetaCA",
  "VetaCB",
  "VetaCC",
  "VetaCD",
  "VetaCE",
  "VetaCF",
  "VetaH",
  "VetaUZ",
  "VetaU1",
  "VetaU2",
  "VetaNP",
] as const

/** VetaD attributes that carry a date (D.M.YYYY) — normalized by the writer. */
export const DPPO_HEADER_DATE_ATTRS = [
  "zdobd_od",
  "zdobd_do",
  "zdobd_od_hr",
  "d_zjist",
] as const
