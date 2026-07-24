// Which lines a given rozsah of the form contains, straight from § 3a vyhlášky
// č. 500/2002 Sb. Membership is DERIVED from the line's označení instead of a
// hand-maintained flag, so the rule is reviewable against the statute text and
// cannot drift line by line.
//
// § 3a odst. 2 (rozvaha ve zkráceném rozsahu):
//   a) malá ÚJ bez auditu — "pouze položky označené písmeny a římskými
//      číslicemi" together with „C.II.1.", „C.II.2." a „C.II.3."
//   b) mikro ÚJ bez auditu — "pouze položky označené písmeny"
// § 3a odst. 4 (výkaz zisku a ztráty ve zkráceném rozsahu):
//   "pouze položky označené římskými číslicemi, písmeny a výpočtové položky";
//   the same subset for both malá and mikro (the statute makes no distinction),
//   and it may be used only by a malá / mikro ÚJ that is not an obchodní
//   společnost and has no audit duty.
//
// The AKTIVA / PASIVA CELKEM rows carry an empty `ozn` and are always present.

import type { Rozsah, VykazLine } from "./types"

/** "A.", "B.", "D." — a položka označená písmenem (incl. the combined "B.+C."). */
const LETTER = /^[A-Z]\.(\+[A-Z]\.)?$/
/** "B.I.", "C.IV." — písmeno + římská číslice. */
const LETTER_ROMAN = /^[A-Z]\.[IVX]+\.$/
/** "I.", "VII." — a VZZ položka označená římskou číslicí. */
const ROMAN = /^[IVX]+\.$/
/** "*", "**", "***" — VZZ výpočtové položky. */
const VYPOCTOVA = /^\*{1,3}$/
/**
 * The three arabic položky § 3a odst. 2 písm. a) names on top of the letters and
 * roman numerals. They are AKTIVA položky ("C.II.1. Dlouhodobé pohledávky",
 * "C.II.2. Krátkodobé pohledávky", "C.II.3. Časové rozlišení aktiv"); the pasiva
 * side has unrelated položky under the same označení, which stay out.
 */
const MALA_EXTRA_AKTIVA = new Set(["C.II.1.", "C.II.2.", "C.II.3."])

function isTotal(ozn: string): boolean {
  return ozn === ""
}

/** Is `line` printed in `rozsah` of the rozvaha (`side` = the statement id)? */
export function inRozvahaRozsah(
  line: VykazLine,
  rozsah: Rozsah,
  side: string,
): boolean {
  if (rozsah === "plny") return true
  const ozn = line.ozn
  if (isTotal(ozn) || LETTER.test(ozn)) return true
  if (rozsah === "mikro") return false
  if (LETTER_ROMAN.test(ozn)) return true
  return side === "rozvaha-aktiva" && MALA_EXTRA_AKTIVA.has(ozn)
}

/** Is `line` printed in `rozsah` of the výkaz zisku a ztráty? */
export function inVzzRozsah(line: VykazLine, rozsah: Rozsah): boolean {
  if (rozsah === "plny") return true
  const ozn = line.ozn
  return LETTER.test(ozn) || ROMAN.test(ozn) || VYPOCTOVA.test(ozn)
}

/** Dispatch on the statement id ("rozvaha-aktiva" | "rozvaha-pasiva" | "vzz"). */
export function inRozsah(
  statementId: string,
  line: VykazLine,
  rozsah: Rozsah,
): boolean {
  return statementId === "vzz"
    ? inVzzRozsah(line, rozsah)
    : inRozvahaRozsah(line, rozsah, statementId)
}

/** Short label for the toolbar toggle. */
export const ROZSAH_SHORT: Record<Rozsah, string> = {
  plny: "plný",
  mala: "zkrácený (malá)",
  mikro: "zkrácený (mikro)",
}

/** Label printed under the form heading. */
export const ROZSAH_LABEL: Record<Rozsah, string> = {
  plny: "v plném rozsahu",
  mala: "ve zkráceném rozsahu (malá ÚJ)",
  mikro: "ve zkráceném rozsahu (mikro ÚJ)",
}
