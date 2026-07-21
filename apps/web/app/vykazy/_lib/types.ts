// Shared contract for the Výkazy builder (Rozvaha + Výkaz zisku a ztráty).
// Statutory forms per vyhláška č. 500/2002 Sb. This file holds NO org or
// personal data — only the form taxonomy shape and engine value types.

export type Rozsah = "plny" | "zkraceny"

// Value columns.
//   Rozvaha aktiva:  brutto, korekce, netto (derived), minule
//   Rozvaha pasiva:  bezne, minule
//   VZZ:             bezne, minule
export type ColKey = "brutto" | "korekce" | "netto" | "bezne" | "minule"

// input = editable leaf cell (rendered white); calc = computed (rendered grey).
type CellKind = "input" | "calc"

export interface VykazLine {
  /** Označení, e.g. "B.II.", "A.1.", "*", "**", "***", or "" (blank). */
  ozn: string
  /** Číslo řádku — unique within one statement. Formula refs use this token. */
  rada: string
  /** Czech label (column b of the printed form). */
  text: string
  /** input = editable leaf (white); calc = computed (grey). */
  kind: CellKind
  /**
   * calc lines only: a signed sum over other lines' `rada` in the SAME column,
   * tokens joined by + / - , e.g. "004+005+006" or "049-050".
   * Unknown ref evaluates to 0. Ignored for the derived netto column (rule 3).
   */
  formula?: string
  /** Render bold (subtotal / total rows). */
  bold?: boolean
  /** Indent depth for the text column (0 = flush left). */
  indent?: number
  /** Rozvaha aktiva only: korekce cell shows "x" (not applicable) and adds 0. */
  korekceNA?: boolean
  /** True when this line is present in the zkrácený rozsah of the form. */
  inZkraceny: boolean
}

export interface VykazStatement {
  /** Stable id, e.g. "rozvaha-aktiva" | "rozvaha-pasiva" | "vzz". */
  id: string
  /** Uppercase form heading, e.g. "ROZVAHA" or "VÝKAZ ZISKU A ZTRÁTY". */
  heading: string
  /** Columns present, in display order. */
  columns: ColKey[]
  lines: VykazLine[]
}

// -----------------------------------------------------------------------------
// Engine rules (implemented in engine.ts, consumed by every statement):
//
//  1. A leaf (kind="input") value in a column = the user's entered number
//     (absent = 0).
//  2. A calc (kind="calc") value in a column = evaluate `formula` as a signed
//     sum of the referenced lines' values IN THAT COLUMN. Missing ref = 0.
//  3. The rozvaha "netto" column is ALWAYS derived and IGNORES `formula`:
//         netto(line) = brutto(line) + korekce(line)
//     Korekce is entered as a negative number (as on the paper form), so this
//     both subtracts corrections and stays self-consistent:
//         Σ netto(children) === Σ brutto(children) + Σ korekce(children).
//  4. Evaluation is order-independent — resolve formulas topologically; a cycle
//     is a data error and must throw.
// -----------------------------------------------------------------------------

/** Per-line, per-column entered/derived values. Keyed by `rada`. */
export type VykazValues = Record<string, Partial<Record<ColKey, number>>>

// Reference chart-of-accounts row (see _data/osnova.ts). Phase 2 uses this to
// map accounts -> výkaz řádek. Phase 1 does not depend on it.
export interface OsnovaAccount {
  ucet: string
  nazev: string
  nameEn: string
  druh: "Rozvahový" | "Výsledovkový" | "Závěrkový"
  typ: "Aktivní" | "Pasivní" | "Nákladový" | "Výnosový" | ""
  opravkovy: boolean
}

// Org / form-header configuration (filled in by the user in the UI; never
// hardcoded). Mirrors the identification block at the top of the paper form.
export interface OrgConfig {
  nazev: string // Obchodní firma / název účetní jednotky
  ico: string
  sidlo: string // ulice + č.p.
  psc: string
  obec: string
  stat: string
  pravniForma: string
  predmetPodnikani: string
  rok: string // účetní období — rok
  mesic: string // účetní období — měsíc (12)
  keDni: string // rozvahový den, e.g. "31.12.2025"
  sestavenoDne: string
  schvalenoDne: string
  vTisicich: boolean // "v celých tisících Kč"
}
