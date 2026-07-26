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
 * What one row of the measuring replica costs on paper.
 *
 * The cost is AFFINE, not a ratio, and that is the whole trick. Every earlier
 * version divided the measured pixel height by a single px-per-mm figure, and
 * every one of them under-charged each row by a fixed sliver — the collapsed
 * border. On a sparse table that vanishes; over thirty rows it compounds into
 * two rows' worth and the last row on the page is torn in half.
 *
 * Measured off a Safari PDF of the rozvaha, whose printed cell heights come in
 * exactly three sizes, against the same rows in the replica at
 * PRINT_METRICS_WIDTH_PX:
 *
 *     replica   printed
 *     21.5px    17.60pt = 6.2089mm   (one line)
 *     38.0px    30.40pt = 10.7244mm  (two lines)
 *     54.5px    43.20pt = 15.2400mm  (three lines)
 *
 * Those three points are collinear to the micrometre, and the line is
 * `mm = px / 3.654 + 0.325`. The slope is the print scale; the intercept is a
 * fixed cost every row carries whatever its content does, a shade over the
 * 0.8pt collapsed border (0.282mm) that most plausibly explains it. Both WebKit
 * and Chromium report the same three pixel heights, so the replica side of the
 * calibration is engine-independent.
 *
 * Re-measure if the cell padding, font size or border width changes: print one
 * statement, read the printed heights of a one-line and a three-line row, and
 * fit a line through them and their replica heights.
 */
const PX_PER_MM = 3.654
const ROW_BORDER_MM = 0.325

/** Millimetres of paper one measured replica row (or the column header) costs. */
export function rowMm(px: number): number {
  return px / PX_PER_MM + ROW_BORDER_MM
}

/**
 * A4 portrait content box. Confirmed on the printed PDF, whose clip box runs
 * 34.02–807.02pt down the sheet, i.e. 272.7mm, matching the 12mm @page margins.
 */
const PRINT_CONTENT_HEIGHT_MM = 297 - 24

/**
 * Width the measuring replica is laid out at, in CSS px.
 *
 * A literal, NOT derived from PX_PER_MM: this is the width the calibration above
 * was taken at, so deriving it from the scale would silently re-wrap every row
 * the moment the scale is retuned and invalidate the very numbers that produced
 * it. Sizing it in px rather than mm is still the point — at print scale 186mm
 * of paper is a narrower box in CSS px than the screen gives it, so text has to
 * wrap as much in the measurement as it does on paper.
 */
export const PRINT_METRICS_WIDTH_PX = 690

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
 *
 * Measured at 24.27mm on the printed rozvaha (clip top 807.02pt, table top
 * 738.21pt). The rounding up to 26 is slack for a longer sídlo wrapping to an
 * extra line; the previous 44 was a guess that threw away most of a page-1 row
 * band for nothing.
 */
export const STATEMENT_HEADER_MM = 26

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
  const budget = PRINT_CONTENT_HEIGHT_MM - SAFETY_MM
  const headMm = rowMm(headHeight)
  const pages: number[][] = []
  let page: number[] = []
  let used = headMm + firstPageMm

  heights.forEach((height, index) => {
    // Never emit an empty page: a single row taller than the budget still has
    // to go somewhere, and it goes on a page of its own.
    if (page.length > 0 && used + rowMm(height) > budget) {
      pages.push(page)
      page = []
      used = headMm
    }
    page.push(index)
    used += rowMm(height)
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
