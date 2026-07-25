"use client"

// Explicit print pagination for the výkaz tables.
//
// CSS alone cannot do this. `break-inside: avoid` on a <tr> and a repeating
// `thead { display: table-header-group }` are the standard answer, and Chrome
// honours both — but Safari honours NEITHER: it splits a wrapped row across the
// fold (leaving an orphan line of text with empty number cells on the next page)
// and never repeats the column header. Since the statements are printed to PDF
// from whatever browser the účetní jednotka happens to use, the layout cannot
// depend on that.
//
// So the rows are chunked into pages here and each chunk is printed as its own
// complete table with its own header, separated by a hard `break-before: page`
// — which every browser honours. Nothing keys off a fixed row index: the chunk
// boundaries come from the rows' MEASURED heights at print geometry, so a
// statement of any length and any amount of text wrapping paginates correctly.

import { useCallback, useEffect, useState } from "react"

/**
 * How many CSS px of the measuring replica one millimetre of paper is worth.
 *
 * CALIBRATED, not derived. Two earlier versions each derived it from a DPI and
 * each was wrong in a different direction: 96 (the screen figure) over-filled
 * every page by a row, 90 under-filled it by several. Both readings had support —
 * a cell set to `text-[11px]` really does print at 8.8pt, which is exactly
 * 11 × 72/90 — but the FONT scaling and the ROW height do not follow the same
 * factor, and it is the row height that decides how many rows fit.
 *
 * So this is measured off the printed artefact instead. In a Safari PDF of the
 * rozvaha, consecutive single-line rows sit 5.93mm apart, and the same row
 * measures 22px in the replica: 22 / 5.93 = 3.71 px per mm, i.e. an effective
 * 94.2 dpi, between the two theories and equal to neither.
 *
 * Verified against that PDF end to end: with this figure the algorithm fills
 * page 1 with řádky 001–028 and stops before 029, which is exactly where the
 * printed page ended.
 *
 * Re-measure if the cell padding or font size changes: print one statement, read
 * the pitch between two single-line rows, and divide the replica's row height by
 * it.
 */
const PX_PER_MM = 3.71

/**
 * A4 portrait content box. Confirmed on the printed PDF, whose text ran from
 * 12.8mm to 283.6mm down the sheet, so both margins are the 12mm @page asks for.
 */
const PRINT_CONTENT_WIDTH_MM = 210 - 24
const PRINT_CONTENT_HEIGHT_MM = 297 - 24

/**
 * Width the measuring replica is laid out at, in CSS px. Sizing it in px rather
 * than in mm is the point: at print scale the same 186mm of paper is a NARROWER
 * box in CSS px than the screen would give it, so text wraps as much in the
 * measurement as it does on paper. Sized in mm it wrapped less, and every
 * measured row came out shorter than the row that printed.
 */
export const PRINT_METRICS_WIDTH_PX = Math.floor(
  PRINT_CONTENT_WIDTH_MM * PX_PER_MM,
)

/**
 * Slack left at the bottom of every page. Absorbs rounding between the measured
 * layout and the printed one, so a page that is estimated to fit exactly never
 * spills one row over and reintroduces the split-row defect. One row is ~6mm, so
 * this is about one row of insurance and no more — the calibration above is what
 * makes the fit accurate, and padding is not a substitute for it.
 */
const SAFETY_MM = 6

/**
 * Height the tiskopis title block (StatementHeader) takes on the first printed
 * page. Fixed content — heading, "ke dni", the Rok | Měsíc | IČ mini-table and
 * the účetní jednotka box — so unlike the rows it does not vary with the data.
 */
export const STATEMENT_HEADER_MM = 44

/**
 * Split row indices into pages that fit A4.
 *
 * @param heights        measured height of each row, in CSS px at print width
 * @param headHeight     measured height of the column header (repeats per page)
 * @param firstPageMm    height already used on page 1 by content above the table
 */
export function chunkRows(
  heights: number[],
  headHeight: number,
  firstPageMm = 0,
): number[][] {
  const budget = (PRINT_CONTENT_HEIGHT_MM - SAFETY_MM) * PX_PER_MM
  const pages: number[][] = []
  let page: number[] = []
  let used = headHeight + firstPageMm * PX_PER_MM

  heights.forEach((height, index) => {
    // Never emit an empty page: a single row taller than the budget still has
    // to go somewhere, and it goes on a page of its own.
    if (page.length > 0 && used + height > budget) {
      pages.push(page)
      page = []
      used = headHeight
    }
    page.push(index)
    used += height
  })
  if (page.length > 0) pages.push(page)
  return pages
}

/**
 * Measure a hidden replica of the table rendered at print geometry (the
 * `.print-metrics` container) and return the row + header heights.
 *
 * Re-measures whenever `signature` changes (row set, rozsah, unit toggle) and
 * once web fonts have loaded, since a font swap changes every wrapped row.
 */
export function usePrintMetrics(signature: string): {
  measureRef: (node: HTMLTableElement | null) => void
  heights: number[]
  headHeight: number
} {
  const [table, setTable] = useState<HTMLTableElement | null>(null)
  const [metrics, setMetrics] = useState<{
    heights: number[]
    headHeight: number
  }>({ heights: [], headHeight: 0 })

  const measureRef = useCallback((node: HTMLTableElement | null) => {
    setTable(node)
  }, [])

  useEffect(() => {
    if (!table) return
    let cancelled = false

    const measure = () => {
      if (cancelled) return
      const body = table.tBodies[0]
      if (!body) return
      setMetrics({
        headHeight: table.tHead?.getBoundingClientRect().height ?? 0,
        heights: Array.from(
          body.rows,
          (row) => row.getBoundingClientRect().height,
        ),
      })
    }

    measure()
    void document.fonts?.ready.then(measure)
    return () => {
      cancelled = true
    }
  }, [table, signature])

  return { measureRef, ...metrics }
}
