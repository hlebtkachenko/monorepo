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
 * Safari does not print a CSS pixel at 96dpi.
 *
 * It lays a printed page out on a 1/90in grid and rounds every box edge UP onto
 * it. In a Safari PDF of the rozvaha EVERY vertical length is an exact multiple
 * of 0.8pt: the 1px cell border prints 0.8pt (0.9375 units, rounded to 1), the
 * 2px cell padding prints 1.6pt (1.875 units, rounded to 2) and the 16.5px line
 * box prints 12.8pt (15.469 units, rounded to 16). Horizontally there is no such
 * grid — the table lays out 701.66px and prints 526.24pt, exactly 0.75pt per px.
 *
 * That asymmetry is the whole defect. Measuring the replica and scaling it by a
 * single px-to-mm factor cannot work: rounding up applies once per BOX, so a row
 * of one line is inflated by a different amount than a row of three, and every
 * factor fitted on one row class under-charged the other. The rows that tore
 * across the fold were the wrapped ones, charged 96dpi for line boxes Safari had
 * already rounded up by 3.4%.
 *
 * Chrome prints at a true 96dpi with no grid, so it is charged slightly more
 * paper than it uses and simply breaks a page one row early. That is the right
 * way round: over-charging costs white space, under-charging tears a row.
 */
const PRINT_GRID_PT = 0.8
const PX_PER_GRID_UNIT = 96 / 90

/** A measured CSS length, in points, as Safari's print grid renders it. */
function snapPt(px: number): number {
  return Math.ceil(px / PX_PER_GRID_UNIT - 1e-9) * PRINT_GRID_PT
}

/**
 * A4 portrait content box: 841.89pt tall less the 12mm @page margins. Confirmed
 * against the printed PDF, whose clip rectangle is `34.01575 34.01575 527 773`.
 */
export const PAGE_CONTENT_PT = 841.89 - 2 * (12 * (72 / 25.4))

/**
 * Slack left at the bottom of every page, about half a printed row. The cost
 * model above is exact for Safari and generous for Chrome, so this only has to
 * absorb the two estimates below (the title block and the column header), both
 * of which already round up.
 */
const SAFETY_PT = 10

/**
 * Height the tiskopis title block takes on the first printed page — heading,
 * "ke dni", the Rok | Měsíc | IČ mini-table, the účetní jednotka box and the gap
 * below it. Fixed content, so unlike the rows it does not vary with the data.
 *
 * Read off the printed rozvaha by comparing a page that carries the block with
 * one that does not: the column header's first text sits 5.88pt below the top of
 * its table, at 153.2pt on page 1 against 39.9pt on page 3, which puts the table
 * top at 147.3pt against a content box starting at 34.0pt — 113.3pt of block.
 * Carried at 120pt so a sídlo that wraps to another line still fits.
 *
 * Do not measure this from the drawn rectangles. The block contains its own
 * bordered Rok | Měsíc | IČ mini-table, so the topmost table-like rect on the
 * sheet belongs to the block, not to the výkaz.
 */
export const STATEMENT_HEADER_PT = 120

/**
 * Width the measuring replica is laid out at, in CSS px: A4 portrait less the
 * 12mm @page margins is 186mm, and the printed table gives 1pt of that back so
 * its right border clears Safari's clip (see print.css). Text has to wrap in the
 * measurement exactly as much as it does on paper, so this is the one number
 * that must match print — and horizontally, unlike vertically, Safari is
 * faithful: 701.67px of table lays out and 526.24pt prints, exactly 0.75pt/px.
 */
export const PRINT_METRICS_WIDTH_PX = 186 * (96 / 25.4) - 96 / 72

/**
 * Printed cost of one measured row.
 *
 * A row is a whole number of line boxes plus its own chrome (padding + the one
 * collapsed border it contributes), and Safari rounds each of those onto the
 * print grid separately — so the row is rebuilt from its parts rather than
 * scaled. `chrome` is recovered from any measured row, since it is smaller than
 * a line box: what a row's height leaves over its whole line boxes IS the
 * chrome.
 */
export function rowPt(px: number, lineHeight: number, chrome: number): number {
  const lines = Math.max(1, Math.round((px - chrome) / lineHeight))
  return lines * snapPt(lineHeight) + snapPt(chrome)
}

function cellChrome(shortestRow: number, lineHeight: number): number {
  return shortestRow - lineHeight * Math.floor(shortestRow / lineHeight)
}

export interface PrintMetrics {
  /** Measured height of each body row, in CSS px at print width. */
  heights: number[]
  /** Measured height of the column header, which repeats on every page. */
  headHeight: number
  /** Used line-height inside a body cell, in CSS px. */
  lineHeight: number
}

/**
 * Split row indices into pages that fit A4.
 *
 * @param metrics      measured replica geometry
 * @param firstPagePt  points already used on page 1 by content above the table
 */
export function chunkRows(metrics: PrintMetrics, firstPagePt = 0): number[][] {
  const { heights, headHeight, lineHeight } = metrics
  const budget = PAGE_CONTENT_PT - SAFETY_PT
  const chrome = cellChrome(Math.min(...heights), lineHeight)
  const headPt = rowPt(headHeight, lineHeight, chrome)

  const pages: number[][] = []
  let page: number[] = []
  let used = headPt + firstPagePt

  heights.forEach((height, index) => {
    const cost = rowPt(height, lineHeight, chrome)
    // Never emit an empty page: a single row taller than the budget still has
    // to go somewhere, and it goes on a page of its own.
    if (page.length > 0 && used + cost > budget) {
      pages.push(page)
      page = []
      used = headPt
    }
    page.push(index)
    used += cost
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
  metrics: PrintMetrics
} {
  const [table, setTable] = useState<HTMLTableElement | null>(null)
  const [metrics, setMetrics] = useState<PrintMetrics>({
    heights: [],
    headHeight: 0,
    lineHeight: 0,
  })

  const measureRef = useCallback((node: HTMLTableElement | null) => {
    setTable(node)
  }, [])

  useEffect(() => {
    if (!table) return
    let cancelled = false

    const measure = () => {
      if (cancelled) return
      const body = table.tBodies[0]
      const cell = body?.rows[0]?.cells[0]
      if (!body || !cell) return
      setMetrics({
        headHeight: table.tHead?.getBoundingClientRect().height ?? 0,
        lineHeight: parseFloat(getComputedStyle(cell).lineHeight),
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

  return { measureRef, metrics }
}
