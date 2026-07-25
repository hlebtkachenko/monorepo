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

/** CSS px per millimetre (1in = 96 CSS px = 25.4 mm). */
const PX_PER_MM = 96 / 25.4

/**
 * Usable height of an A4 portrait page: 297mm minus the 12mm @page margins.
 * The matching content WIDTH (186mm) is set on `.print-metrics` in print.css,
 * which is what makes the measured wrapping match the printed wrapping.
 */
const PRINT_CONTENT_HEIGHT_MM = 297 - 24

/**
 * Slack left at the bottom of every page. Absorbs the rounding between the
 * measured layout and the print layout, so a page that is estimated to fit
 * exactly never spills one row over and reintroduces the split-row defect.
 */
const SAFETY_MM = 4

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
