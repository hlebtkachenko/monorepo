// ROZVAHA (balance sheet) line taxonomy — plný rozsah, per vyhláška č. 500/2002
// Sb., příloha č. 1, ve znění účinném od 1. 1. 2024 (poslední novela 443/2023
// Sb.). No org or personal data — only the statutory položky, formulas and
// rendering flags.
//
// Two statements: rozvahaAktiva(cr) (brutto / korekce / netto / minulé) and
// rozvahaPasiva(cr) (běžné / minulé). Engine rules live in ../_lib/types.ts:
//   - kind "calc"  -> value = signed sum of `formula` refs in the SAME column.
//   - kind "input" -> user-entered leaf (netto still auto-derived on aktiva).
//   - aktiva netto is ALWAYS derived (netto = brutto + korekce); `formula` is
//     supplied for brutto/korekce/minulé aggregation and ignored for netto.
//   - korekceNA -> aktiva korekce cell shows "x" (not applicable, adds 0).
//
// Časové rozlišení: § 3 odst. 3 a 4 vyhlášky give the účetní jednotka a choice
// between two mutually exclusive layouts, and the rozvaha contains only the
// chosen one:
//   "C" -> "C.II.3. Časové rozlišení aktiv" + "C.III. Časové rozlišení pasiv"
//   "D" -> "D. Časové rozlišení aktiv"     + "D. Časové rozlišení pasiv"
// Both are written out below, but the exported forms are BUILT PER VARIANT
// (rozvahaAktiva(cr) / rozvahaPasiva(cr)): the deselected block is dropped from
// the lines and from the aggregate formulas, so it cannot contribute to a total
// that no visible řádek explains.
//
// Čísla řádků: the vyhláška prescribes položky and their označení, NOT řádek
// numbers — those are a form convention. The numbering used here is the plain
// sequential one over the statutory položky (aktiva 001–081, pasiva 001–068),
// with both časové-rozlišení variants numbered in place.
import type { CasoveRozliseni, VykazLine, VykazStatement } from "../_lib/types"

/**
 * One statutory row: [označení, číslo řádku, text, formula, flags].
 *
 * `formula` is "" for a leaf (kind "input") and a signed sum of other řádky for
 * an aggregate (kind "calc"). `flags` is a set of single letters:
 *   k — korekce cell is not applicable (prints "x")
 *   C — line exists only in the "C" časové-rozlišení variant
 *   D — line exists only in the "D" časové-rozlišení variant
 *
 * `indent` is the depth of the označení ("B." 0, "B.I." 1, "B.I.1." 2, …) and
 * `bold` marks aggregates plus top-level položky. Both are derived rather than
 * hand-set, so a row cannot end up formatted unlike its siblings.
 */
type Row = readonly [
  ozn: string,
  rada: string,
  text: string,
  formula: string,
  flags?: string,
]

function depthOf(ozn: string): number {
  if (ozn === "" || ozn === "B.+C.") return 0
  return ozn.split(".").filter(Boolean).length - 1
}

function toLines(rows: readonly Row[]): VykazLine[] {
  return rows.map(([ozn, rada, text, formula, flags = ""]) => {
    const indent = depthOf(ozn)
    const line: VykazLine = {
      ozn,
      rada,
      text,
      kind: formula === "" ? "input" : "calc",
      indent,
    }
    if (formula !== "") line.formula = formula
    if (formula !== "" || indent === 0) line.bold = true
    if (flags.includes("k")) line.korekceNA = true
    if (flags.includes("C")) line.crVariant = "C"
    if (flags.includes("D")) line.crVariant = "D"
    return line
  })
}

const AKTIVA_ROWS: readonly Row[] = [
  ["", "001", "AKTIVA CELKEM", "002+003+037+078"],
  ["A.", "002", "Pohledávky za upsaný základní kapitál", ""],
  ["B.", "003", "Stálá aktiva", "004+014+027"],
  ["B.I.", "004", "Dlouhodobý nehmotný majetek", "005+006+009+010+011"],
  ["B.I.1.", "005", "Nehmotné výsledky vývoje", ""],
  ["B.I.2.", "006", "Ocenitelná práva", "007+008"],
  ["B.I.2.1.", "007", "Software", ""],
  ["B.I.2.2.", "008", "Ostatní ocenitelná práva", ""],
  ["B.I.3.", "009", "Goodwill", ""],
  ["B.I.4.", "010", "Ostatní dlouhodobý nehmotný majetek", ""],
  [
    "B.I.5.",
    "011",
    "Poskytnuté zálohy na dlouhodobý nehmotný majetek a nedokončený dlouhodobý nehmotný majetek",
    "012+013",
  ],
  ["B.I.5.1.", "012", "Poskytnuté zálohy na dlouhodobý nehmotný majetek", ""],
  ["B.I.5.2.", "013", "Nedokončený dlouhodobý nehmotný majetek", ""],
  ["B.II.", "014", "Dlouhodobý hmotný majetek", "015+018+019+020+024"],
  ["B.II.1.", "015", "Pozemky a stavby", "016+017"],
  ["B.II.1.1.", "016", "Pozemky", ""],
  ["B.II.1.2.", "017", "Stavby", ""],
  ["B.II.2.", "018", "Hmotné movité věci a jejich soubory", ""],
  ["B.II.3.", "019", "Oceňovací rozdíl k nabytému majetku", ""],
  ["B.II.4.", "020", "Ostatní dlouhodobý hmotný majetek", "021+022+023"],
  ["B.II.4.1.", "021", "Pěstitelské celky trvalých porostů", ""],
  ["B.II.4.2.", "022", "Dospělá zvířata a jejich skupiny", ""],
  ["B.II.4.3.", "023", "Jiný dlouhodobý hmotný majetek", ""],
  [
    "B.II.5.",
    "024",
    "Poskytnuté zálohy na dlouhodobý hmotný majetek a nedokončený dlouhodobý hmotný majetek",
    "025+026",
  ],
  ["B.II.5.1.", "025", "Poskytnuté zálohy na dlouhodobý hmotný majetek", ""],
  ["B.II.5.2.", "026", "Nedokončený dlouhodobý hmotný majetek", ""],
  [
    "B.III.",
    "027",
    "Dlouhodobý finanční majetek",
    "028+029+030+031+032+033+034",
  ],
  ["B.III.1.", "028", "Podíly - ovládaná nebo ovládající osoba", ""],
  ["B.III.2.", "029", "Zápůjčky a úvěry - ovládaná nebo ovládající osoba", ""],
  ["B.III.3.", "030", "Podíly - podstatný vliv", ""],
  ["B.III.4.", "031", "Zápůjčky a úvěry - podstatný vliv", ""],
  ["B.III.5.", "032", "Ostatní dlouhodobé cenné papíry a podíly", ""],
  ["B.III.6.", "033", "Zápůjčky a úvěry - ostatní", ""],
  ["B.III.7.", "034", "Ostatní dlouhodobý finanční majetek", "035+036"],
  ["B.III.7.1.", "035", "Jiný dlouhodobý finanční majetek", ""],
  ["B.III.7.2.", "036", "Poskytnuté zálohy na dlouhodobý finanční majetek", ""],
  ["C.", "037", "Oběžná aktiva", "038+046+072+075"],
  ["C.I.", "038", "Zásoby", "039+040+041+044+045"],
  ["C.I.1.", "039", "Materiál", ""],
  ["C.I.2.", "040", "Nedokončená výroba a polotovary", ""],
  ["C.I.3.", "041", "Výrobky a zboží", "042+043"],
  ["C.I.3.1.", "042", "Výrobky", ""],
  ["C.I.3.2.", "043", "Zboží", ""],
  ["C.I.4.", "044", "Mladá a ostatní zvířata a jejich skupiny", ""],
  ["C.I.5.", "045", "Poskytnuté zálohy na zásoby", ""],
  ["C.II.", "046", "Pohledávky", "047+057+068"],
  ["C.II.1.", "047", "Dlouhodobé pohledávky", "048+049+050+051+052", "k"],
  ["C.II.1.1.", "048", "Pohledávky z obchodních vztahů", "", "k"],
  ["C.II.1.2.", "049", "Pohledávky - ovládaná nebo ovládající osoba", "", "k"],
  ["C.II.1.3.", "050", "Pohledávky - podstatný vliv", "", "k"],
  ["C.II.1.4.", "051", "Odložená daňová pohledávka", "", "k"],
  ["C.II.1.5.", "052", "Pohledávky - ostatní", "053+054+055+056", "k"],
  ["C.II.1.5.1.", "053", "Pohledávky za společníky", "", "k"],
  ["C.II.1.5.2.", "054", "Dlouhodobé poskytnuté zálohy", "", "k"],
  ["C.II.1.5.3.", "055", "Dohadné účty aktivní", "", "k"],
  ["C.II.1.5.4.", "056", "Jiné pohledávky", "", "k"],
  ["C.II.2.", "057", "Krátkodobé pohledávky", "058+059+060+061"],
  ["C.II.2.1.", "058", "Pohledávky z obchodních vztahů", ""],
  ["C.II.2.2.", "059", "Pohledávky - ovládaná nebo ovládající osoba", ""],
  ["C.II.2.3.", "060", "Pohledávky - podstatný vliv", ""],
  ["C.II.2.4.", "061", "Pohledávky - ostatní", "062+063+064+065+066+067"],
  ["C.II.2.4.1.", "062", "Pohledávky za společníky", ""],
  ["C.II.2.4.2.", "063", "Sociální zabezpečení a zdravotní pojištění", ""],
  ["C.II.2.4.3.", "064", "Stát - daňové pohledávky", ""],
  ["C.II.2.4.4.", "065", "Krátkodobé poskytnuté zálohy", ""],
  ["C.II.2.4.5.", "066", "Dohadné účty aktivní", ""],
  ["C.II.2.4.6.", "067", "Jiné pohledávky", ""],
  ["C.II.3.", "068", "Časové rozlišení aktiv", "069+070+071", "kC"],
  ["C.II.3.1.", "069", "Náklady příštích období", "", "kC"],
  ["C.II.3.2.", "070", "Komplexní náklady příštích období", "", "kC"],
  ["C.II.3.3.", "071", "Příjmy příštích období", "", "kC"],
  ["C.III.", "072", "Krátkodobý finanční majetek", "073+074"],
  ["C.III.1.", "073", "Podíly - ovládaná nebo ovládající osoba", ""],
  ["C.III.2.", "074", "Ostatní krátkodobý finanční majetek", ""],
  ["C.IV.", "075", "Peněžní prostředky", "076+077", "k"],
  ["C.IV.1.", "076", "Peněžní prostředky v pokladně", "", "k"],
  ["C.IV.2.", "077", "Peněžní prostředky na účtech", "", "k"],
  ["D.", "078", "Časové rozlišení aktiv", "079+080+081", "kD"],
  ["D.1.", "079", "Náklady příštích období", "", "kD"],
  ["D.2.", "080", "Komplexní náklady příštích období", "", "kD"],
  ["D.3.", "081", "Příjmy příštích období", "", "kD"],
]

const PASIVA_ROWS: readonly Row[] = [
  ["", "001", "PASIVA CELKEM", "002+023+066"],
  ["A.", "002", "Vlastní kapitál", "003+007+015+018+021+022"],
  ["A.I.", "003", "Základní kapitál", "004+005+006"],
  ["A.I.1.", "004", "Základní kapitál", ""],
  ["A.I.2.", "005", "Vlastní podíly (-)", ""],
  ["A.I.3.", "006", "Změny základního kapitálu", ""],
  ["A.II.", "007", "Ážio a kapitálové fondy", "008+009"],
  ["A.II.1.", "008", "Ážio", ""],
  ["A.II.2.", "009", "Kapitálové fondy", "010+011+012+013+014"],
  ["A.II.2.1.", "010", "Ostatní kapitálové fondy", ""],
  [
    "A.II.2.2.",
    "011",
    "Oceňovací rozdíly z přecenění majetku a závazků (+/-)",
    "",
  ],
  [
    "A.II.2.3.",
    "012",
    "Oceňovací rozdíly z přecenění při přeměnách obchodních korporací (+/-)",
    "",
  ],
  ["A.II.2.4.", "013", "Rozdíly z přeměn obchodních korporací (+/-)", ""],
  [
    "A.II.2.5.",
    "014",
    "Rozdíly z ocenění při přeměnách obchodních korporací (+/-)",
    "",
  ],
  ["A.III.", "015", "Fondy ze zisku", "016+017"],
  ["A.III.1.", "016", "Ostatní rezervní fondy", ""],
  ["A.III.2.", "017", "Statutární a ostatní fondy", ""],
  ["A.IV.", "018", "Výsledek hospodaření minulých let (+/-)", "019+020"],
  [
    "A.IV.1.",
    "019",
    "Nerozdělený zisk nebo neuhrazená ztráta minulých let (+/-)",
    "",
  ],
  ["A.IV.2.", "020", "Jiný výsledek hospodaření minulých let (+/-)", ""],
  ["A.V.", "021", "Výsledek hospodaření běžného účetního období (+/-)", ""],
  ["A.VI.", "022", "Rozhodnuto o zálohové výplatě podílu na zisku (-)", ""],
  ["B.+C.", "023", "Cizí zdroje", "024+029"],
  ["B.", "024", "Rezervy", "025+026+027+028"],
  ["B.1.", "025", "Rezerva na důchody a podobné závazky", ""],
  ["B.2.", "026", "Rezerva na daň z příjmů", ""],
  ["B.3.", "027", "Rezervy podle zvláštních právních předpisů", ""],
  ["B.4.", "028", "Ostatní rezervy", ""],
  ["C.", "029", "Závazky", "030+045+063"],
  ["C.I.", "030", "Dlouhodobé závazky", "031+034+035+036+037+038+039+040+041"],
  ["C.I.1.", "031", "Vydané dluhopisy", "032+033"],
  ["C.I.1.1.", "032", "Vyměnitelné dluhopisy", ""],
  ["C.I.1.2.", "033", "Ostatní dluhopisy", ""],
  ["C.I.2.", "034", "Závazky k úvěrovým institucím", ""],
  ["C.I.3.", "035", "Dlouhodobé přijaté zálohy", ""],
  ["C.I.4.", "036", "Závazky z obchodních vztahů", ""],
  ["C.I.5.", "037", "Dlouhodobé směnky k úhradě", ""],
  ["C.I.6.", "038", "Závazky - ovládaná nebo ovládající osoba", ""],
  ["C.I.7.", "039", "Závazky - podstatný vliv", ""],
  ["C.I.8.", "040", "Odložený daňový závazek", ""],
  ["C.I.9.", "041", "Závazky - ostatní", "042+043+044"],
  ["C.I.9.1.", "042", "Závazky ke společníkům", ""],
  ["C.I.9.2.", "043", "Dohadné účty pasivní", ""],
  ["C.I.9.3.", "044", "Jiné závazky", ""],
  ["C.II.", "045", "Krátkodobé závazky", "046+049+050+051+052+053+054+055"],
  ["C.II.1.", "046", "Vydané dluhopisy", "047+048"],
  ["C.II.1.1.", "047", "Vyměnitelné dluhopisy", ""],
  ["C.II.1.2.", "048", "Ostatní dluhopisy", ""],
  ["C.II.2.", "049", "Závazky k úvěrovým institucím", ""],
  ["C.II.3.", "050", "Krátkodobé přijaté zálohy", ""],
  ["C.II.4.", "051", "Závazky z obchodních vztahů", ""],
  ["C.II.5.", "052", "Krátkodobé směnky k úhradě", ""],
  ["C.II.6.", "053", "Závazky - ovládaná nebo ovládající osoba", ""],
  ["C.II.7.", "054", "Závazky - podstatný vliv", ""],
  ["C.II.8.", "055", "Závazky ostatní", "056+057+058+059+060+061+062"],
  ["C.II.8.1.", "056", "Závazky ke společníkům", ""],
  ["C.II.8.2.", "057", "Krátkodobé finanční výpomoci", ""],
  ["C.II.8.3.", "058", "Závazky k zaměstnancům", ""],
  [
    "C.II.8.4.",
    "059",
    "Závazky ze sociálního zabezpečení a zdravotního pojištění",
    "",
  ],
  ["C.II.8.5.", "060", "Stát - daňové závazky a dotace", ""],
  ["C.II.8.6.", "061", "Dohadné účty pasivní", ""],
  ["C.II.8.7.", "062", "Jiné závazky", ""],
  ["C.III.", "063", "Časové rozlišení pasiv", "064+065", "C"],
  ["C.III.1.", "064", "Výdaje příštích období", "", "C"],
  ["C.III.2.", "065", "Výnosy příštích období", "", "C"],
  ["D.", "066", "Časové rozlišení pasiv", "067+068", "D"],
  ["D.1.", "067", "Výdaje příštích období", "", "D"],
  ["D.2.", "068", "Výnosy příštích období", "", "D"],
]

/**
 * Aggregates that name the časové-rozlišení block, per variant. Under "C" the
 * rozvaha has no "D." položka at all, so the totals must not reference it (and
 * vice versa) — otherwise a value left on the deselected block would still reach
 * AKTIVA / PASIVA CELKEM while no visible řádek explains it.
 */
const AKTIVA_CR_FORMULAS: Record<CasoveRozliseni, Record<string, string>> = {
  C: { "001": "002+003+037", "046": "047+057+068" },
  D: { "001": "002+003+037+078", "046": "047+057" },
}

const PASIVA_CR_FORMULAS: Record<CasoveRozliseni, Record<string, string>> = {
  C: { "001": "002+023", "029": "030+045+063" },
  D: { "001": "002+023+066", "029": "030+045" },
}

function build(
  id: string,
  columns: VykazStatement["columns"],
  rows: readonly Row[],
  formulas: Record<string, string>,
  cr: CasoveRozliseni,
): VykazStatement {
  return {
    id,
    heading: "ROZVAHA",
    columns,
    lines: toLines(rows)
      .filter((line) => line.crVariant === undefined || line.crVariant === cr)
      .map((line) =>
        formulas[line.rada] === undefined
          ? line
          : { ...line, formula: formulas[line.rada] },
      ),
  }
}

// Built once per variant: the statement object identity has to stay stable so
// the React memo in VykazTable is not defeated on every render.
const AKTIVA: Record<CasoveRozliseni, VykazStatement> = {
  C: build(
    "rozvaha-aktiva",
    ["brutto", "korekce", "netto", "minule"],
    AKTIVA_ROWS,
    AKTIVA_CR_FORMULAS.C,
    "C",
  ),
  D: build(
    "rozvaha-aktiva",
    ["brutto", "korekce", "netto", "minule"],
    AKTIVA_ROWS,
    AKTIVA_CR_FORMULAS.D,
    "D",
  ),
}

const PASIVA: Record<CasoveRozliseni, VykazStatement> = {
  C: build(
    "rozvaha-pasiva",
    ["bezne", "minule"],
    PASIVA_ROWS,
    PASIVA_CR_FORMULAS.C,
    "C",
  ),
  D: build(
    "rozvaha-pasiva",
    ["bezne", "minule"],
    PASIVA_ROWS,
    PASIVA_CR_FORMULAS.D,
    "D",
  ),
}

/**
 * The same položka in the other časové-rozlišení layout, per statement — e.g.
 * aktiva "D.1. Náklady příštích období" (079) is "C.II.3.1." (069). Symmetric,
 * so one lookup serves both directions; a řádek outside the two blocks is absent.
 */
export const CR_COUNTERPART: Record<string, Record<string, string>> = {
  "rozvaha-aktiva": {
    "068": "078",
    "069": "079",
    "070": "080",
    "071": "081",
    "078": "068",
    "079": "069",
    "080": "070",
    "081": "071",
  },
  "rozvaha-pasiva": {
    "063": "066",
    "064": "067",
    "065": "068",
    "066": "063",
    "067": "064",
    "068": "065",
  },
}

/** The aktiva form as the chosen časové-rozlišení layout prints it. */
export function rozvahaAktiva(cr: CasoveRozliseni): VykazStatement {
  return AKTIVA[cr]
}

/** The pasiva form as the chosen časové-rozlišení layout prints it. */
export function rozvahaPasiva(cr: CasoveRozliseni): VykazStatement {
  return PASIVA[cr]
}
