/**
 * Územní finanční orgány (ÚFO) — code → office name, for the identity card's
 * "Finanční úřad" row (spec §2.10: "taxOfficeCode → FÚ name via copied ÚFO
 * číselník").
 *
 * COPIED, not imported. The source is `apps/web/app/vykazy/_data/ufo.ts`, where
 * the same číselník feeds the DPPO export's `c_ufo_cil`; two Next apps cannot
 * import each other's route trees, and the alternative (promoting it to a
 * package) would be a workspace-graph change for fifteen constant rows. The
 * spec anticipates the copy by name.
 *
 * Codes verified against the Finanční správa / MOJE daně ÚFO číselník (platný
 * od 1. 1. 2013): the 14 krajské finanční úřady (451-464) plus the
 * Specializovaný finanční úřad (13). Stable since the 2013 reform.
 */

export type FinancniUrad = { readonly kod: string; readonly nazev: string }

export const FINANCNI_URADY: readonly FinancniUrad[] = [
  { kod: "451", nazev: "Finanční úřad pro hlavní město Prahu" },
  { kod: "452", nazev: "Finanční úřad pro Středočeský kraj" },
  { kod: "453", nazev: "Finanční úřad pro Jihočeský kraj" },
  { kod: "454", nazev: "Finanční úřad pro Plzeňský kraj" },
  { kod: "455", nazev: "Finanční úřad pro Karlovarský kraj" },
  { kod: "456", nazev: "Finanční úřad pro Ústecký kraj" },
  { kod: "457", nazev: "Finanční úřad pro Liberecký kraj" },
  { kod: "458", nazev: "Finanční úřad pro Královéhradecký kraj" },
  { kod: "459", nazev: "Finanční úřad pro Pardubický kraj" },
  { kod: "460", nazev: "Finanční úřad pro Kraj Vysočina" },
  { kod: "461", nazev: "Finanční úřad pro Jihomoravský kraj" },
  { kod: "462", nazev: "Finanční úřad pro Olomoucký kraj" },
  { kod: "463", nazev: "Finanční úřad pro Moravskoslezský kraj" },
  { kod: "464", nazev: "Finanční úřad pro Zlínský kraj" },
  { kod: "13", nazev: "Specializovaný finanční úřad" },
]

const BY_CODE = new Map(FINANCNI_URADY.map((urad) => [urad.kod, urad.nazev]))

/**
 * The office's name, or `null` when the code is not one of the fifteen.
 *
 * NULL RATHER THAN A GUESS, on purpose. ARES's `financniUrad` is a code from
 * the registry's own field and beta stores it verbatim (`varchar(4)`); if a
 * value ever arrives that is not a krajský ÚFO code — a územní pracoviště, a
 * future reorganisation — inventing a plausible office name for it would put a
 * wrong finanční úřad on an identity card that a client reads as authoritative.
 * The caller renders the raw code instead, which is honest and still actionable.
 */
export function financniUradName(code: string | null): string | null {
  if (code === null) return null
  return BY_CODE.get(code.trim()) ?? null
}
