// Static číselník Územní finanční orgány (ufo) — the c_ufo codes EPO expects in
// DPPO VetaD `c_ufo_cil`. The vendored XSD references this external číselník
// ("Pro hodnotu této položky použijte číselník Územní finanční orgány (ufo)")
// with a kritická kontrola "musí být vyplněno číslo existujícího FÚ", so a free
// text field would fail on upload — the user must pick from the known set.
//
// Codes verified 2026-07 against the Finanční správa / MOJE daně ÚFO číselník
// (platný od 1.1.2013): the 14 krajské finanční úřady (451–464) + the
// Specializovaný finanční úřad (13). Stable since the 2013 reform.
// Sources: podpora.mojedane.gov.cz (Informace k číselníku ÚFO), financnisprava.gov.cz.

export interface FinancniUrad {
  /** c_ufo code inserted into VetaD `c_ufo_cil`. */
  kod: string
  /** Official office name (column b of the EPO selector). */
  nazev: string
}

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
