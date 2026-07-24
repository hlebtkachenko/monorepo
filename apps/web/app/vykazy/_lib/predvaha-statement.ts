// Obratová předvaha as a full, print-ready statement built from the deník rows.
// Pure: rows in, an ordered list of render lines (per-account rows interleaved
// with SU / třída / grand subtotals) out. No React, no I/O.
//
// Three column pairs, each a Má dáti / Dal side:
//   - Počáteční stav (PS)  — opening balances, taken from the deník rows whose
//     counter-account is 701 (Počáteční účet rozvažný). A row touching 701 on
//     either side is an opening entry; BOTH its sides book to PS.
//   - Obrat                — period turnover: every non-opening row.
//   - Konečný stav (KS)     — gross cumulative per side: ksMD = psMD + obratMD,
//     ksDal = psDal + obratDal (the net account balance is ksMD − ksDal).
//
// Because opening balances balance (Σ psMD = Σ psDal) and every posting is
// double-entry (Σ obratMD = Σ obratDal), all three pairs balance MD = Dal at the
// grand total — the předvaha's built-in correctness check.

import { OSNOVA } from "../_data/osnova"
import type { DenikRow } from "./denik"

/** The Počáteční účet rozvažný — its postings are opening balances, not turnover. */
const OPENING_ACCOUNT_PREFIX = "701"

export interface Totals {
  psMD: number
  psDal: number
  obratMD: number
  obratDal: number
  ksMD: number
  ksDal: number
}

export type PredvahaLine =
  | { kind: "ucet"; ucet: string; nazev: string; totals: Totals }
  | { kind: "su"; label: string; totals: Totals }
  | { kind: "trida"; label: string; totals: Totals }
  | { kind: "grand"; label: string; totals: Totals }
  | { kind: "celkem"; label: string; totals: Totals }

export interface PredvahaStatement {
  lines: PredvahaLine[]
  total: Totals
  /** All three column pairs balance MD = Dal (books are internally consistent). */
  balanced: boolean
  empty: boolean
}

interface Accum {
  psMD: number
  psDal: number
  obratMD: number
  obratDal: number
}

function emptyAccum(): Accum {
  return { psMD: 0, psDal: 0, obratMD: 0, obratDal: 0 }
}

function toTotals(a: Accum): Totals {
  return {
    psMD: a.psMD,
    psDal: a.psDal,
    obratMD: a.obratMD,
    obratDal: a.obratDal,
    ksMD: a.psMD + a.obratMD,
    ksDal: a.psDal + a.obratDal,
  }
}

function addInto(target: Accum, src: Accum): void {
  target.psMD += src.psMD
  target.psDal += src.psDal
  target.obratMD += src.obratMD
  target.obratDal += src.obratDal
}

/** Trída (účtová třída) is the leading digit; SU (syntetický účet) the first 3. */
function grandGroupLabel(trida: string): string {
  if (trida <= "4") return "Rozvahové účty"
  if (trida <= "6") return "Výsledkové účty"
  return "Závěrkové účty"
}

/** Account-name lookup from the směrná účtová osnova: exact 6-digit match first,
 *  then the 3-digit synthetic prefix (first OSNOVA hit per synthetic wins). */
function buildNameLookup(): (ucet: string) => string {
  const exact = new Map<string, string>()
  const bySynteticky = new Map<string, string>()
  for (const acc of OSNOVA) {
    exact.set(acc.ucet, acc.nazev)
    const syn = acc.ucet.slice(0, 3)
    if (!bySynteticky.has(syn)) bySynteticky.set(syn, acc.nazev)
  }
  return (ucet) => exact.get(ucet) ?? bySynteticky.get(ucet.slice(0, 3)) ?? ""
}

export function buildPredvahaStatement(rows: DenikRow[]): PredvahaStatement {
  const perAccount = new Map<string, Accum>()

  const bump = (ucet: string): Accum => {
    let entry = perAccount.get(ucet)
    if (!entry) {
      entry = emptyAccum()
      perAccount.set(ucet, entry)
    }
    return entry
  }

  for (const row of rows) {
    const md = row.md.trim()
    const dal = row.dal.trim()
    const { castka } = row
    if (!castka) continue

    // A row is an opening entry iff either leg posts to 701; then both legs are
    // Počáteční stav rather than Obrat (including 701's own side).
    const opening =
      md.startsWith(OPENING_ACCOUNT_PREFIX) ||
      dal.startsWith(OPENING_ACCOUNT_PREFIX)

    if (md) {
      const acc = bump(md)
      if (opening) acc.psMD += castka
      else acc.obratMD += castka
    }
    if (dal) {
      const acc = bump(dal)
      if (opening) acc.psDal += castka
      else acc.obratDal += castka
    }
  }

  const resolveName = buildNameLookup()

  const sorted = [...perAccount.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "cs"),
  )

  const lines: PredvahaLine[] = []
  const total = emptyAccum()

  let suAccum = emptyAccum()
  let tridaAccum = emptyAccum()
  let grandAccum = emptyAccum()
  let curSU: string | null = null
  let curTrida: string | null = null
  let curGrand: string | null = null

  const flushSU = () => {
    if (curSU !== null) {
      lines.push({
        kind: "su",
        label: `celkem SU ${curSU}`,
        totals: toTotals(suAccum),
      })
    }
    suAccum = emptyAccum()
  }
  const flushTrida = () => {
    if (curTrida !== null) {
      lines.push({
        kind: "trida",
        label: `za třídu ${curTrida}`,
        totals: toTotals(tridaAccum),
      })
    }
    tridaAccum = emptyAccum()
  }
  const flushGrand = () => {
    if (curGrand !== null) {
      // curGrand already holds the grand-group label (set from grandGroupLabel
      // when the account opened it) — emit it directly, do not re-derive.
      lines.push({
        kind: "grand",
        label: curGrand,
        totals: toTotals(grandAccum),
      })
    }
    grandAccum = emptyAccum()
  }

  for (const [ucet, accum] of sorted) {
    const su = ucet.slice(0, 3)
    const trida = ucet.slice(0, 1)
    const grand = grandGroupLabel(trida)

    // Control break, finest first: close the SU, then the třída, then the grand
    // group before opening the account's own groups.
    if (curSU !== null && curSU !== su) flushSU()
    if (curTrida !== null && curTrida !== trida) flushTrida()
    if (curGrand !== null && curGrand !== grand) flushGrand()

    curSU = su
    curTrida = trida
    curGrand = grand

    lines.push({
      kind: "ucet",
      ucet,
      nazev: resolveName(ucet),
      totals: toTotals(accum),
    })
    addInto(suAccum, accum)
    addInto(tridaAccum, accum)
    addInto(grandAccum, accum)
    addInto(total, accum)
  }

  // Flush the final open groups.
  flushSU()
  flushTrida()
  flushGrand()

  const grand = toTotals(total)
  if (sorted.length > 0) {
    lines.push({ kind: "celkem", label: "Celkový obrat účtů", totals: grand })
  }

  const balanced =
    Math.abs(grand.psMD - grand.psDal) < 0.01 &&
    Math.abs(grand.obratMD - grand.obratDal) < 0.01 &&
    Math.abs(grand.ksMD - grand.ksDal) < 0.01

  return { lines, total: grand, balanced, empty: sorted.length === 0 }
}

/** Serialize the předvaha to CSV (semicolon-delimited, BOM, comma decimals) for
 *  Czech Excel. Account rows keep their Účet + Název; subtotal rows carry their
 *  label in the Účet column. */
export function predvahaCsv(statement: PredvahaStatement): string {
  const num = (n: number): string => n.toFixed(2).replace(".", ",")
  const header = [
    "Účet",
    "Název",
    "PS Má dáti",
    "PS Dal",
    "Obrat Má dáti",
    "Obrat Dal",
    "KS Má dáti",
    "KS Dal",
  ]
  const rowCells = (t: Totals): string[] => [
    num(t.psMD),
    num(t.psDal),
    num(t.obratMD),
    num(t.obratDal),
    num(t.ksMD),
    num(t.ksDal),
  ]
  const lines: string[][] = [header]
  for (const line of statement.lines) {
    if (line.kind === "ucet") {
      lines.push([line.ucet, line.nazev, ...rowCells(line.totals)])
    } else {
      lines.push([line.label, "", ...rowCells(line.totals)])
    }
  }
  const body = lines
    .map((cells) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
    .join("\r\n")
  return `\uFEFF${body}\r\n`
}
