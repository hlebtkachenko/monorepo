// Přiznání k DPH (DPHDP3) — the statutory line taxonomy, per zákon č. 235/2004 Sb.
// and the vendored EPO schema (packages/filing/schemas/fu/dphdp3/03.01.03).
// No org or personal data: only the form's řádky, their labels and the XML
// attribute each one writes to.
//
// Why this is NOT the `VykazLine` shape used by the rozvaha/VZZ (_lib/types.ts):
// a rozvaha line is one `rada` holding one number per column, with a `formula`
// that sums other lines in the SAME column. A DPH line is different in every one
// of those respects — it carries TWO values (základ + daň) written to two
// separate XML attributes, its "columns" are základ/daň rather than
// brutto/korekce/netto, and its totals foot ACROSS the two (ř.62 sums the daň of
// ř.1–13). Reusing VykazLine would have meant encoding all of that in a `formula`
// string the engine cannot evaluate.
//
// The derived lines (ř.62–65) are computed by `computeDphdp3Totals` in
// @workspace/filing, which implements them straight from the XSD annotations —
// they are marked `derived` here so the UI renders them read-only.

/** Which věta of the XML document a line's attributes belong to. */
type DphVeta = 1 | 2 | 3 | 4 | 5 | 6

interface DphdpLine {
  /** Číslo řádku as printed on the form ("1", "40", "62"). */
  r: string
  /** Czech label, column b of the paper form. */
  text: string
  /** Which věta carries this line's attributes. */
  veta: DphVeta
  /** XML attribute for the základ daně / hodnota column, when the line has one. */
  base?: string
  /** XML attribute for the daň column, when the line has one. */
  dan?: string
  /** Sazba the line is fixed to, for the ones that are split by rate. */
  sazba?: 21 | 12
  /** Computed by the filing engine — rendered read-only. */
  derived?: boolean
  /** Section heading rendered above this line. */
  sekce?: string
}

/**
 * ř.1–66. Attribute names are taken verbatim from the XSD; where the schema's own
 * documentation does not unambiguously assign a column (the "V plné výši" vs
 * "Krácený odpočet" pair on ř.40–47), only the unambiguous columns appear here and
 * the rest are entered through `DPH_MANUAL_FIELDS` below.
 */
const DPH_PRIZNANI: DphdpLine[] = [
  // I. Zdanitelná plnění
  { r: "1", text: "Dodání zboží nebo poskytnutí služby s místem plnění v tuzemsku", veta: 1, base: "obrat23", dan: "dan23", sazba: 21, sekce: "I. Zdanitelná plnění" }, // prettier-ignore
  { r: "2", text: "Dodání zboží nebo poskytnutí služby s místem plnění v tuzemsku", veta: 1, base: "obrat5", dan: "dan5", sazba: 12 }, // prettier-ignore
  { r: "3", text: "Pořízení zboží z jiného členského státu", veta: 1, base: "p_zb23", dan: "dan_pzb23", sazba: 21 }, // prettier-ignore
  { r: "4", text: "Pořízení zboží z jiného členského státu", veta: 1, base: "p_zb5", dan: "dan_pzb5", sazba: 12 }, // prettier-ignore
  { r: "5", text: "Přijetí služby s místem plnění podle § 9 odst. 1 od osoby registrované v jiném členském státě", veta: 1, base: "p_sl23_e", dan: "dan_psl23_e", sazba: 21 }, // prettier-ignore
  { r: "6", text: "Přijetí služby s místem plnění podle § 9 odst. 1 od osoby registrované v jiném členském státě", veta: 1, base: "p_sl5_e", dan: "dan_psl5_e", sazba: 12 }, // prettier-ignore
  { r: "7", text: "Dovoz zboží (§ 23)", veta: 1, base: "dov_zb23", dan: "dan_dzb23", sazba: 21 }, // prettier-ignore
  { r: "8", text: "Dovoz zboží (§ 23)", veta: 1, base: "dov_zb5", dan: "dan_dzb5", sazba: 12 }, // prettier-ignore
  { r: "9", text: "Pořízení nového dopravního prostředku (§ 19c)", veta: 1, base: "p_dop_nrg", dan: "dan_pdop_nrg" }, // prettier-ignore
  { r: "10", text: "Režim přenesení daňové povinnosti — odběratel zboží nebo příjemce služeb", veta: 1, base: "rez_pren23", dan: "dan_rpren23", sazba: 21 }, // prettier-ignore
  { r: "11", text: "Režim přenesení daňové povinnosti — odběratel zboží nebo příjemce služeb", veta: 1, base: "rez_pren5", dan: "dan_rpren5", sazba: 12 }, // prettier-ignore
  { r: "12", text: "Ostatní zdanitelná plnění, u kterých je povinen přiznat daň plátce při jejich přijetí (§ 108)", veta: 1, base: "p_sl23_z", dan: "dan_psl23_z", sazba: 21 }, // prettier-ignore
  { r: "13", text: "Ostatní zdanitelná plnění, u kterých je povinen přiznat daň plátce při jejich přijetí (§ 108)", veta: 1, base: "p_sl5_z", dan: "dan_psl5_z", sazba: 12 }, // prettier-ignore

  // II. Ostatní plnění a plnění s místem plnění mimo tuzemsko s nárokem na odpočet
  { r: "20", text: "Dodání zboží do jiného členského státu (§ 64)", veta: 2, base: "dod_zb", sekce: "II. Ostatní plnění a plnění s místem plnění mimo tuzemsko s nárokem na odpočet daně" }, // prettier-ignore
  { r: "21", text: "Poskytnutí služeb s místem plnění v jiném členském státě vymezených v § 102 odst. 1 písm. d)", veta: 2, base: "pln_sluzby" }, // prettier-ignore
  { r: "22", text: "Vývoz zboží (§ 66)", veta: 2, base: "pln_vyvoz" },
  { r: "23", text: "Dodání nového dopravního prostředku osobě neregistrované k dani v jiném členském státě", veta: 2, base: "dod_dop_nrg" }, // prettier-ignore
  { r: "24", text: "Zasílání zboží / vybraná plnění v režimu jednoho správního místa", veta: 2, base: "pln_zaslani" }, // prettier-ignore
  { r: "25", text: "Režim přenesení daňové povinnosti — dodavatel zboží nebo poskytovatel služeb", veta: 2, base: "pln_rez_pren" }, // prettier-ignore
  { r: "26", text: "Ostatní uskutečněná plnění s nárokem na odpočet daně", veta: 2, base: "pln_ost" }, // prettier-ignore

  // III. Doplňující údaje
  { r: "30", text: "Zjednodušený postup při dodání zboží formou třístranného obchodu (§ 17) — pořízení zboží prostřední osobou", veta: 3, base: "tri_pozb", sekce: "III. Doplňující údaje" }, // prettier-ignore
  { r: "31", text: "Zjednodušený postup při dodání zboží formou třístranného obchodu (§ 17) — dodání zboží prostřední osobou", veta: 3, base: "tri_dozb" }, // prettier-ignore
  { r: "32", text: "Dovoz zboží osvobozený podle § 71g", veta: 3, base: "dov_osv" }, // prettier-ignore
  { r: "33", text: "Oprava výše daně u pohledávek za dlužníkem v insolvenčním řízení (§ 46 a násl.) — věřitel", veta: 3, base: "opr_verit" }, // prettier-ignore
  { r: "34", text: "Oprava výše daně u pohledávek za dlužníkem v insolvenčním řízení (§ 46 a násl.) — dlužník", veta: 3, base: "opr_dluz" }, // prettier-ignore

  // IV. Nárok na odpočet daně — "V plné výši" only; see DPH_MANUAL_FIELDS for krácený
  { r: "40", text: "Z přijatých zdanitelných plnění od plátců", veta: 4, base: "pln23", dan: "odp_tuz23", sazba: 21, sekce: "IV. Nárok na odpočet daně (sloupec „V plné výši“)" }, // prettier-ignore
  { r: "41", text: "Z přijatých zdanitelných plnění od plátců", veta: 4, base: "pln5", dan: "odp_tuz5", sazba: 12 }, // prettier-ignore
  { r: "42", text: "Při dovozu zboží, kdy je správcem daně celní úřad", veta: 4, base: "dov_cu", dan: "odp_cu" }, // prettier-ignore
  { r: "43", text: "Ze zdanitelných plnění vykázaných na řádcích 3 až 13", veta: 4, base: "nar_zdp23", dan: "od_zdp23", sazba: 21 }, // prettier-ignore
  { r: "44", text: "Ze zdanitelných plnění vykázaných na řádcích 3 až 13", veta: 4, base: "nar_zdp5", dan: "od_zdp5", sazba: 12 }, // prettier-ignore
  { r: "45", text: "Korekce odpočtů daně podle § 75 odst. 4, § 77 a § 79", veta: 4, dan: "odp_rezim" }, // prettier-ignore
  { r: "46", text: "Odpočet daně celkem (součet řádků 40 až 45)", veta: 4, dan: "odp_sum_nar", derived: true }, // prettier-ignore
  { r: "47", text: "Hodnota pořízeného majetku vymezeného v § 4 odst. 4 písm. c)", veta: 4, base: "nar_maj", dan: "od_maj" }, // prettier-ignore

  // V. Krácení nároku na odpočet daně
  { r: "50", text: "Plnění osvobozená od daně bez nároku na odpočet daně", veta: 5, base: "plnosv_kf", sekce: "V. Krácení nároku na odpočet daně" }, // prettier-ignore
  { r: "51", text: "Hodnota plnění nezapočítávaných do výpočtu koeficientu", veta: 5, base: "pln_nkf" }, // prettier-ignore

  // VI. Výpočet daně
  { r: "60", text: "Úprava odpočtu daně (§ 78 až § 78e)", veta: 6, dan: "uprav_odp", sekce: "VI. Výpočet daně" }, // prettier-ignore
  { r: "61", text: "Vrácení daně (§ 84)", veta: 6, dan: "dan_vrac" },
  { r: "62", text: "Daň na výstupu", veta: 6, dan: "dan_zocelk", derived: true }, // prettier-ignore
  { r: "63", text: "Odpočet daně celkem", veta: 6, dan: "odp_zocelk", derived: true }, // prettier-ignore
  { r: "64", text: "Vlastní daň (ř. 62 − ř. 63)", veta: 6, dan: "dano_da", derived: true }, // prettier-ignore
  { r: "65", text: "Nadměrný odpočet (ř. 63 − ř. 62)", veta: 6, dan: "dano_no", derived: true }, // prettier-ignore
  { r: "66", text: "Rozdíl proti poslední známé dani (dodatečné přiznání)", veta: 6, dan: "dano" }, // prettier-ignore
]

/**
 * Fields that no doklad can produce and no engine can derive — they come from the
 * plátce's own §76 koeficient and from the krácený-odpočet column of ř.40–47.
 *
 * The krácený column is here rather than in `DPH_PRIZNANI` on purpose. The XSD
 * carries two parallel attribute families for ř.40–47 ("V plné výši" and "Krácený
 * odpočet") whose column roles its documentation does not settle, and the same
 * ambiguity is flagged in @workspace/filing's own adapter. Rather than guess a
 * column mapping and file a wrong return, these are entered explicitly under the
 * exact attribute name the XML will carry.
 */
export interface DphManualField {
  attr: string
  /** Řádek the field belongs to, for grouping in the UI. */
  r: string
  label: string
  veta: DphVeta
}

export const DPH_MANUAL_FIELDS: DphManualField[] = [
  { attr: "plnosv_nkf", r: "51", label: "ř. 51 — bez nároku na odpočet", veta: 5 }, // prettier-ignore
  { attr: "koef_p20_nov", r: "52", label: "ř. 52 — koeficient (%)", veta: 5 },
  { attr: "odp_uprav_kf", r: "52", label: "ř. 52 — odpočet v krácené výši", veta: 5 }, // prettier-ignore
  { attr: "koef_p20_vypor", r: "53", label: "ř. 53 — vypořádací koeficient (%)", veta: 5 }, // prettier-ignore
  { attr: "vypor_odp", r: "53", label: "ř. 53 — změna odpočtu", veta: 5 },
  { attr: "odp_tuz23_nar", r: "40", label: "ř. 40 — krácený odpočet (21 %)", veta: 4 }, // prettier-ignore
  { attr: "odp_tuz5_nar", r: "41", label: "ř. 41 — krácený odpočet (12 %)", veta: 4 }, // prettier-ignore
  { attr: "odp_cu_nar", r: "42", label: "ř. 42 — krácený odpočet", veta: 4 },
  { attr: "odkr_zdp23", r: "43", label: "ř. 43 — krácený odpočet (21 %)", veta: 4 }, // prettier-ignore
  { attr: "odkr_zdp5", r: "44", label: "ř. 44 — krácený odpočet (12 %)", veta: 4 }, // prettier-ignore
  { attr: "odp_rez_nar", r: "45", label: "ř. 45 — krácený odpočet", veta: 4 },
  { attr: "odp_sum_kr", r: "46", label: "ř. 46 — krácený odpočet celkem", veta: 4 }, // prettier-ignore
  { attr: "odkr_maj", r: "47", label: "ř. 47 — krácený odpočet", veta: 4 },
]

/** Every line that carries a value, keyed by řádek, for quick lookup. */
export const DPH_LINE_BY_R = new Map(DPH_PRIZNANI.map((l) => [l.r, l]))

/** Řádky an evidence row may be assigned to (i.e. everything not derived). */
export const DPH_ASSIGNABLE_LINES = DPH_PRIZNANI.filter((l) => !l.derived)
