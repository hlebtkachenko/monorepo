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
 * CSS pixels per inch WHEN PRINTING. On screen a CSS px is 1/96in, and the first
 * version of this measured against that — which is why every chunk still spilled
 * one row onto a near-empty page. Measured off a Safari-produced PDF: a cell set
 * to `text-[11px]` prints at exactly 8.8pt, and 11 × (72/90) = 8.8, so Safari
 * lays print out at 90 CSS px per inch. Chrome uses 96.
 *
 * 90 is therefore the honest figure to measure against: exact in Safari, and in
 * Chrome it only under-fills a page slightly, which costs whitespace rather than
 * correctness. Nothing here can detect the browser, so it takes the smaller one.
 */
const PRINT_DPI = 90
const PX_PER_MM = PRINT_DPI / 25.4

/** A4 portrait content box: the page minus the 12mm @page margins. */
const PRINT_CONTENT_WIDTH_MM = 210 - 24
const PRINT_CONTENT_HEIGHT_MM = 297 - 24

/**
 * Width the measuring replica is laid out at, in CSS px. Sizing it in px rather
 * than in mm is the point: at the print DPI the same 186mm of paper is a
 * NARROWER box in CSS px than the screen would give it, so text wraps as much in
 * the measurement as it does on paper. Sized in mm it wrapped less, and every
 * measured row came out shorter than the row that printed.
 */
export const PRINT_METRICS_WIDTH_PX = Math.floor(
  PRINT_CONTENT_WIDTH_MM * PX_PER_MM,
)

/**
 * Slack left at the bottom of every page. Absorbs rounding between the measured
 * layout and the printed one, so a page that is estimated to fit exactly never
 * spills one row over and reintroduces the split-row defect.
 */
const SAFETY_MM = 8

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
