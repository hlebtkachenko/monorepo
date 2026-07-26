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
 * The cost is a function of the row's LINE COUNT, not of its pixel height, and
 * getting that wrong is what tore rows across the fold for three iterations.
 * Every earlier version scaled pixels to millimetres by one factor. That cannot
 * work here, because the replica does not wrap at print's line height: an extra
 * wrapped line costs 16.5px in the replica but only 2.26mm on paper, roughly
 * half what the same factor would predict. So a factor fitted on one-line rows
 * over-charges tall rows, one fitted on tall rows under-charges the page, and
 * nothing in between is right for both.
 *
 * Measured off a Safari PDF of the rozvaha, comparing the printed ADVANCE from
 * one row's text to the next (not the drawn cell box, which double-counts the
 * collapsed border) against the same rows in the replica:
 *
 *     replica   printed advance
 *     21.5px    16.8pt = 5.9267mm   (one line)
 *     38.0px    23.2pt = 8.1844mm   (two lines)
 *     54.5px    29.6pt = 10.4422mm  (three lines)
 *     71.0px    36.0pt = 12.7000mm  (four lines)
 *
 * Both sides are exactly arithmetic: 16.5px per line in the replica, 6.4pt on
 * paper. Recovering the line count and rebuilding the height from it reproduces
 * all four to the micrometre. WebKit and Chromium report the same replica
 * pixels, so that side is engine-independent.
 *
 * Re-measure if the cell padding, font size or line height changes: print one
 * statement, read the pitch between two consecutive single-line rows and between
 * a single- and a double-line row, and take the difference.
 */
const REPLICA_BASE_PX = 21.5
const REPLICA_LINE_PX = 16.5
const ROW_BASE_MM = 5.9267
const ROW_LINE_MM = 2.2578

/** Millimetres of paper one measured replica row (or the column header) costs. */
export function rowMm(px: number): number {
  const extraLines = Math.max(
    0,
    Math.round((px - REPLICA_BASE_PX) / REPLICA_LINE_PX),
  )
  return ROW_BASE_MM + extraLines * ROW_LINE_MM
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
 * Measured from TEXT positions on the printed rozvaha: the clip starts at
 * 34.02pt and the column header's "Ozn." sits at 174.4pt, so the block above the
 * table is 140.4pt = 49.51mm. Rounded up to 50 for a sídlo that wraps to another
 * line.
 *
 * Do not measure this from the drawn rectangles. The title block contains its
 * own bordered Rok | Měsíc | IČ mini-table, so the topmost table-like rect on
 * the sheet belongs to the header, not to the výkaz — reading it that way gives
 * 24.27mm and hands page 1 an extra 25mm it does not have.
 */
export const STATEMENT_HEADER_MM = 50

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
