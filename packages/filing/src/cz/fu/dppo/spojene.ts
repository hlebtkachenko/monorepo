// Samostatná příloha k položce 12 I. oddílu — přehled transakcí se spojenými
// osobami (VetaA), § 23 odst. 7 ZDP.
//
// One věta per spojená osoba, `maxOccurs="unbounded"`, no řádek index: EPO keys
// the rows by the pair (naz_spojos, stat_spojos) and rejects a duplicate.
//
// THE COLUMN TRAP. Every amount is a pair of XSD attributes `<name>_sl1` /
// `<name>_sl2`, and the two columns do NOT mean the same thing across rows —
// the XSD documents each one separately and they fall into five distinct kinds:
//
//   Služby            sl1 = Výnos                     sl2 = Náklad
//   Dlouhodobý majetek sl1 = Výnos (prodej)           sl2 = Pořizovací cena (nákup)
//   Úvěrové nástroje  sl1 = Přijaté                   sl2 = Vyplacené
//   Vlastní kapitál   sl1 = Zvýšení                   sl2 = Snížení
//   Pohledávky/závazky sl1 = Stav konec aktuálního    sl2 = Stav konec minulého
//
// So `DppoSpojeneTransakce` names each row's two columns by what they actually
// mean and never exposes `sl1`/`sl2` to a caller. Putting a náklad in the výnos
// column is the class of error that filed a whole VZZ into the rozvaha věta.
//
// Two emission rules taken from a real submitted DPPDP9, neither stated by the
// XSD: a pair with any activity emits BOTH halves (the idle one as "0"), a pair
// with no activity emits neither; and all five A/N flags are always present.

import type { DppoExtraVeta } from "../../../model/dppo"

const SPOJENA_OSOBA_VETA = "VetaA"

/**
 * The amount columns a transaction row can have, v celých tis. Kč.
 *
 * No row uses more than two of these — `DppoSpojeneTransakce` picks the right
 * pair per row, so only the two that apply are assignable.
 */
export interface DppoSpojeneCastky {
  /** Výnos (prodej) — majetek prodaný spojené osobě. */
  prodej?: number
  /** Pořizovací cena (nákup) — majetek pořízený od spojené osoby. */
  nakup?: number
  vynos?: number
  naklad?: number
  prijate?: number
  vyplacene?: number
  /** Zvýšení ostatních složek vlastního kapitálu. */
  zvyseni?: number
  snizeni?: number
  /** Stav ke konci aktuálního období. */
  aktualni?: number
  /** Stav ke konci minulého období. */
  minule?: number
}

type Sloupce<
  A extends keyof DppoSpojeneCastky,
  B extends keyof DppoSpojeneCastky,
> = Pick<DppoSpojeneCastky, A | B>

/** Objem transakcí s jednou spojenou osobou, po řádcích tiskopisu. */
export interface DppoSpojeneTransakce {
  nehmotnyMajetek?: Sloupce<"prodej", "nakup">
  hmotnyMajetek?: Sloupce<"prodej", "nakup">
  zasoby?: Sloupce<"prodej", "nakup">
  licencniPoplatky?: Sloupce<"vynos", "naklad">
  sluzby?: Sloupce<"vynos", "naklad">
  najem?: Sloupce<"vynos", "naklad">
  uroky?: Sloupce<"vynos", "naklad">
  uveroveNastroje?: Sloupce<"prijate", "vyplacene">
  financniMajetek?: Sloupce<"prodej", "nakup">
  podilyNaZisku?: Sloupce<"prijate", "vyplacene">
  ostatniVlastniKapital?: Sloupce<"zvyseni", "snizeni">
  dlouhodobePohledavky?: Sloupce<"aktualni", "minule">
  kratkodobePohledavky?: Sloupce<"aktualni", "minule">
  dlouhodobeZavazky?: Sloupce<"aktualni", "minule">
  kratkodobeZavazky?: Sloupce<"aktualni", "minule">
  ostatniTransakce?: Sloupce<"vynos", "naklad">
}

export interface DppoSpojenaOsoba {
  /**
   * Obchodní firma včetně dodatku právní formy; u fyzické osoby jméno a
   * příjmení. Kritická kontrola: musí být vyplněno.
   */
  nazev: string
  /** IČ nebo identifikátor pro daňové účely, byl-li přidělen. */
  ic?: string
  /** Dvoumístný kód státu podle číselníku CZEM ("CZ"). Kritická kontrola. */
  stat: string
  /** Vnitroskupinové sdružování finančních prostředků (cash-pooling). */
  cashpooling?: boolean
  /** Poskytnuté bezúplatné plnění (mimo reklamní předměty dle § 25/1 t). */
  bezuplatnePoskytnute?: boolean
  bezuplatnePrijate?: boolean
  /** Přijatá finanční nebo bankovní záruka (§ 2029–2039 obč. zák.). */
  zarukaPrijata?: boolean
  zarukaPoskytnuta?: boolean
  transakce?: DppoSpojeneTransakce
}

/**
 * The sixteen transaction rows, in tiskopis order, with the XSD attribute prefix
 * and the meaning of each of its two columns.
 *
 * `sl1` / `sl2` are the field names on `DppoSpojeneCastky`, so the builder and a
 * UI both read the column labels from here instead of restating them.
 */
export const DPPO_SPOJENE_TRANSAKCE: {
  key: keyof DppoSpojeneTransakce
  attr: string
  label: string
  sl1: keyof DppoSpojeneCastky
  sl1Label: string
  sl2: keyof DppoSpojeneCastky
  sl2Label: string
}[] = [
  { key: "nehmotnyMajetek", attr: "nehm", label: "Dlouhodobý nehmotný majetek", sl1: "prodej", sl1Label: "Výnos (prodej)", sl2: "nakup", sl2Label: "Pořizovací cena (nákup)" }, // prettier-ignore
  { key: "hmotnyMajetek", attr: "hmot", label: "Dlouhodobý hmotný majetek", sl1: "prodej", sl1Label: "Výnos (prodej)", sl2: "nakup", sl2Label: "Pořizovací cena (nákup)" }, // prettier-ignore
  { key: "zasoby", attr: "zasoby", label: "Zásoby materiálu, výrobků a zboží", sl1: "prodej", sl1Label: "Výnos (prodej)", sl2: "nakup", sl2Label: "Pořizovací cena (nákup)" }, // prettier-ignore
  { key: "licencniPoplatky", attr: "licence", label: "Licenční poplatek (vč. software)", sl1: "vynos", sl1Label: "Výnos", sl2: "naklad", sl2Label: "Náklad" }, // prettier-ignore
  { key: "sluzby", attr: "sluzby", label: "Služby", sl1: "vynos", sl1Label: "Výnos", sl2: "naklad", sl2Label: "Náklad" }, // prettier-ignore
  { key: "najem", attr: "najem", label: "Nájem", sl1: "vynos", sl1Label: "Výnos", sl2: "naklad", sl2Label: "Náklad" }, // prettier-ignore
  { key: "uroky", attr: "urok", label: "Úroky", sl1: "vynos", sl1Label: "Výnos", sl2: "naklad", sl2Label: "Náklad" }, // prettier-ignore
  { key: "uveroveNastroje", attr: "uver", label: "Úvěrové finanční nástroje", sl1: "prijate", sl1Label: "Přijaté", sl2: "vyplacene", sl2Label: "Vyplacené" }, // prettier-ignore
  { key: "financniMajetek", attr: "fin", label: "Dlouhodobý finanční majetek", sl1: "prodej", sl1Label: "Výnos (prodej)", sl2: "nakup", sl2Label: "Pořizovací cena (nákup)" }, // prettier-ignore
  { key: "podilyNaZisku", attr: "podil", label: "Podíly na zisku", sl1: "prijate", sl1Label: "Přijaté", sl2: "vyplacene", sl2Label: "Vyplacené" }, // prettier-ignore
  { key: "ostatniVlastniKapital", attr: "ost_vlkap", label: "Ostatní složky vlastního kapitálu", sl1: "zvyseni", sl1Label: "Zvýšení", sl2: "snizeni", sl2Label: "Snížení" }, // prettier-ignore
  { key: "dlouhodobePohledavky", attr: "dlpohl", label: "Dlouhodobé pohledávky", sl1: "aktualni", sl1Label: "Stav ke konci aktuálního období", sl2: "minule", sl2Label: "Stav ke konci minulého období" }, // prettier-ignore
  { key: "kratkodobePohledavky", attr: "krpohl", label: "Krátkodobé pohledávky", sl1: "aktualni", sl1Label: "Stav ke konci aktuálního období", sl2: "minule", sl2Label: "Stav ke konci minulého období" }, // prettier-ignore
  { key: "dlouhodobeZavazky", attr: "dlzav", label: "Dlouhodobé závazky", sl1: "aktualni", sl1Label: "Stav ke konci aktuálního období", sl2: "minule", sl2Label: "Stav ke konci minulého období" }, // prettier-ignore
  { key: "kratkodobeZavazky", attr: "krzav", label: "Krátkodobé závazky", sl1: "aktualni", sl1Label: "Stav ke konci aktuálního období", sl2: "minule", sl2Label: "Stav ke konci minulého období" }, // prettier-ignore
  { key: "ostatniTransakce", attr: "ost_trans", label: "Celkový objem ostatních transakcí", sl1: "vynos", sl1Label: "Výnos", sl2: "naklad", sl2Label: "Náklad" }, // prettier-ignore
]

/** The five A/N flags, in tiskopis order. */
export const DPPO_SPOJENE_PRIZNAKY: {
  key: DppoSpojenyPriznak
  attr: string
  label: string
}[] = [
  { key: "cashpooling", attr: "cashpool", label: "Cash-pooling (vnitroskupinové sdružování finančních prostředků)" }, // prettier-ignore
  { key: "bezuplatnePoskytnute", attr: "bezupl_pos", label: "Poskytnuté bezúplatné plnění" }, // prettier-ignore
  { key: "bezuplatnePrijate", attr: "bezupl_prij", label: "Přijaté bezúplatné plnění" }, // prettier-ignore
  { key: "zarukaPrijata", attr: "fbzar_prij", label: "Přijatá finanční nebo bankovní záruka" }, // prettier-ignore
  { key: "zarukaPoskytnuta", attr: "fbzar_pos", label: "Poskytnutá finanční nebo bankovní záruka" }, // prettier-ignore
]

export type DppoSpojenyPriznak =
  | "cashpooling"
  | "bezuplatnePoskytnute"
  | "bezuplatnePrijate"
  | "zarukaPrijata"
  | "zarukaPoskytnuta"

function ano(value: boolean | undefined): string {
  return value ? "A" : "N"
}

/** Whole thousands as EPO wants them: an integer, no decimals, no grouping. */
function tis(value: number | undefined): string {
  return String(Math.round(value ?? 0))
}

/** True when the entry carries nothing worth filing a list for. */
function isPrazdna(osoba: DppoSpojenaOsoba): boolean {
  if (osoba.nazev.trim() !== "" || (osoba.ic ?? "").trim() !== "") return false
  if (DPPO_SPOJENE_PRIZNAKY.some(({ key }) => osoba[key])) return false
  return !DPPO_SPOJENE_TRANSAKCE.some(({ key, sl1, sl2 }) => {
    const pair = osoba.transakce?.[key] as DppoSpojeneCastky | undefined
    return pair?.[sl1] !== undefined || pair?.[sl2] !== undefined
  })
}

/**
 * Build one VetaA per spojená osoba.
 *
 * Entirely blank entries are dropped (a repeating UI table carries them), but an
 * entry with content and no název is kept and flagged by `checkDppo` instead:
 * silently discarding a transaction the poplatník typed in would be worse than
 * filing a row EPO queries.
 */
export function buildSpojeneVety(
  osoby: readonly DppoSpojenaOsoba[],
): DppoExtraVeta[] {
  const vety: DppoExtraVeta[] = []
  for (const osoba of osoby) {
    if (isPrazdna(osoba)) continue

    const attrs: Record<string, string> = {}
    const nazev = osoba.nazev.trim()
    if (nazev) attrs.naz_spojos = nazev
    const ic = osoba.ic?.trim()
    if (ic) attrs.ic_spojos = ic
    const stat = osoba.stat.trim().toUpperCase()
    if (stat) attrs.stat_spojos = stat

    // Every flag is always present, "N" when not ticked, as the filed return
    // carries them: an absent flag reads as unanswered rather than as "ne".
    for (const { key, attr } of DPPO_SPOJENE_PRIZNAKY) {
      attrs[attr] = ano(osoba[key])
    }

    for (const { key, attr, sl1, sl2 } of DPPO_SPOJENE_TRANSAKCE) {
      const pair = osoba.transakce?.[key] as DppoSpojeneCastky | undefined
      if (pair?.[sl1] === undefined && pair?.[sl2] === undefined) continue
      // Both halves ship together, as the filed return does: an idle column of
      // an active row is a reported zero, not an absent figure.
      attrs[`${attr}_sl1`] = tis(pair?.[sl1])
      attrs[`${attr}_sl2`] = tis(pair?.[sl2])
    }

    vety.push({ tag: SPOJENA_OSOBA_VETA, attrs })
  }
  return vety
}

/**
 * `spoj_zahr` (VetaD) — whether transakce se spojenými osobami happened, and
 * with whom. Its value set is not A/N: "T" tuzemská, "Z" zahraniční, "A" obojí,
 * "N" žádné.
 *
 * Derived from the states of the listed osoby, which is exactly what the codes
 * distinguish. The declaration is broader than the příloha (the samostatná
 * příloha is filed only when the Pokyny's podmínky are met), so a caller that
 * knows better passes its own value instead.
 */
export function spojZahr(osoby: readonly DppoSpojenaOsoba[]): string {
  let tuzemska = false
  let zahranicni = false
  for (const osoba of osoby) {
    if (isPrazdna(osoba)) continue
    if (osoba.stat.trim().toUpperCase() === "CZ") tuzemska = true
    else zahranicni = true
  }
  if (tuzemska && zahranicni) return "A"
  if (tuzemska) return "T"
  if (zahranicni) return "Z"
  return "N"
}
