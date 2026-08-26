import type { BetaMessageKey } from "@/i18n/messages"
import type { StatementLineView } from "@/lib/data/projections"

/**
 * The top strip of Rozvaha and Výsledovka (spec §2.5: "top strip: bilanční
 * suma, vlastní kapitál, cizí zdroje" / "výsledek hospodaření headline").
 *
 * IT IS A LOOKUP, NOT A CALCULATION — the single most important property of
 * this file. Every tile below is ONE published `statement_line`, read off the
 * batch by its statutory `označení` and rendered verbatim. Nothing is summed,
 * nothing is subtracted, and no tile exists whose value the office did not
 * publish as a line of the form (spec §0.2: the portal never derives an
 * accounting fact).
 *
 * WHY `ozn` AND NOT `row_code`. The repo's own statutory taxonomy says it
 * outright (`apps/web/app/vykazy/_data/rozvaha.ts`): "the vyhláška prescribes
 * položky and their označení, NOT řádek numbers — those are a form
 * convention". Two exporters can number the same form differently; both print
 * `A.` next to Vlastní kapitál because vyhláška č. 500/2002 Sb. says so. Keying
 * on `ozn` is therefore keying on the law, and keying on `row_code` would be
 * keying on whichever software produced the file.
 *
 * THE ONE EXCEPTION, STATED. Bilanční suma has no označení at all — AKTIVA
 * CELKEM is printed with a blank column (a), which no lookup can distinguish
 * from a spacer row. It is taken as the FIRST aktiva line in printed order,
 * which every Czech rozvaha opens with. That is a convention, not a statute,
 * so it is written here where it can be seen rather than buried in a component.
 *
 * A MISSING LINE IS A MISSING TILE. A short-form rozvaha, or a batch the office
 * published without the pasiva side, simply renders fewer tiles — never a zero
 * and never a computed stand-in (§0.4, "empty beats stale", at tile
 * granularity).
 */

export type StatementHighlight = {
  readonly labelKey: BetaMessageKey
  /** `numeric(14,2)` as a string, exactly as published. Never null. */
  readonly value: string
}

/** Označení of Vlastní kapitál on the rozvaha pasiva (vyhláška, příloha 1). */
const OZN_VLASTNI_KAPITAL = "A."

/**
 * Označení of Cizí zdroje — the aggregate line the printed form labels
 * `B.+C.` (Rezervy + Závazky), as the repo's own rozvaha taxonomy spells it.
 */
const OZN_CIZI_ZDROJE = "B.+C."

/** Označení of Výsledek hospodaření za účetní období on the VZZ. */
const OZN_VYSLEDEK_HOSPODARENI = "***"

/** Compare označení ignoring the whitespace an exporter may pad it with. */
function byOzn(
  lines: readonly StatementLineView[],
  ozn: string,
): StatementLineView | undefined {
  return lines.find((line) => (line.ozn ?? "").trim() === ozn)
}

function tile(
  labelKey: BetaMessageKey,
  value: string | null | undefined,
): StatementHighlight | null {
  return value === null || value === undefined ? null : { labelKey, value }
}

/**
 * Bilanční suma (aktiva netto), vlastní kapitál and cizí zdroje — in that
 * order, and only the ones the batch actually carries.
 *
 * The two sides arrive as separate arrays because they are separate
 * `statement_kind`s with separate column shapes; bilanční suma is read off
 * AKTIVA rather than PASIVA so the tile and the table under it show the same
 * number from the same side of the form.
 */
export function rozvahaHighlights(
  aktiva: readonly StatementLineView[],
  pasiva: readonly StatementLineView[],
): StatementHighlight[] {
  return [
    tile("vykazy.highlightBilancniSuma", aktiva[0]?.netto),
    tile(
      "vykazy.highlightVlastniKapital",
      byOzn(pasiva, OZN_VLASTNI_KAPITAL)?.bezne,
    ),
    tile("vykazy.highlightCiziZdroje", byOzn(pasiva, OZN_CIZI_ZDROJE)?.bezne),
  ].filter((highlight): highlight is StatementHighlight => highlight !== null)
}

/** Výsledek hospodaření za účetní období, běžné období. */
export function vzzHighlights(
  lines: readonly StatementLineView[],
): StatementHighlight[] {
  return [
    tile(
      "vykazy.highlightVysledekHospodareni",
      byOzn(lines, OZN_VYSLEDEK_HOSPODARENI)?.bezne,
    ),
  ].filter((highlight): highlight is StatementHighlight => highlight !== null)
}
