import { describe, expect, it } from "vitest"

import {
  chunkRows,
  rowPt,
  PAGE_CONTENT_PT,
  PRINT_METRICS_WIDTH_PX,
  STATEMENT_HEADER_PT,
} from "./print-pagination"

/** The replica's own geometry: a 16.5px line box, 4px padding, 1px border. */
const LINE = 16.5
const CHROME = 5
const ONE_LINE = LINE + CHROME

/**
 * Row heights read off a Safari PDF of the rozvaha, against the same rows in the
 * `.print-metrics` replica. Every printed length is a multiple of 0.8pt, which
 * is what the 1/90in print grid does to a 16.5px line box (12.8pt) and to the
 * cell's 2px + 2px + 1px of chrome (1.6 + 1.6 + 0.8pt).
 */
const CALIBRATION = [
  { label: "one line", replicaPx: 21.5, printedPt: 16.8 },
  { label: "two lines", replicaPx: 38, printedPt: 29.6 },
  { label: "three lines", replicaPx: 54.5, printedPt: 42.4 },
  { label: "four lines", replicaPx: 71, printedPt: 55.2 },
]

describe("rowPt", () => {
  for (const { label, replicaPx, printedPt } of CALIBRATION) {
    it(`charges a ${label} row what it actually prints`, () => {
      expect(rowPt(replicaPx, LINE, CHROME)).toBeCloseTo(printedPt, 6)
    })
  }

  it("lands every row on Safari's 1/90in print grid", () => {
    // A row is built from boxes that Safari rounds up individually, so its
    // height can only ever be a whole number of 0.8pt units.
    for (let px = ONE_LINE; px <= 200; px += 0.5) {
      const units = rowPt(px, LINE, CHROME) / 0.8
      expect(units).toBeCloseTo(Math.round(units), 6)
    }
  })

  it("never charges less than 96dpi would predict", () => {
    // Rounding UP is what makes this safe on engines without the grid (Chrome
    // prints at a true 96dpi): they get a little white space, never a torn row.
    for (const { replicaPx } of CALIBRATION) {
      expect(rowPt(replicaPx, LINE, CHROME)).toBeGreaterThan(replicaPx * 0.75)
    }
  })

  it("rounds a row of intermediate height to the nearer line count", () => {
    // Sub-pixel layout jitter must not tip a row into an extra line's cost.
    expect(rowPt(23, LINE, CHROME)).toBe(rowPt(ONE_LINE, LINE, CHROME))
    expect(rowPt(36, LINE, CHROME)).toBe(rowPt(ONE_LINE + LINE, LINE, CHROME))
  })

  it("measures the replica at the printed table's own width", () => {
    // The printed table measures 526.24pt across, laid out on the same 1/90in
    // grid as everything else — 0.8pt to the px, not 0.75. Measuring it at 96dpi
    // gives every label 6.7% more room than the paper does, and a label that
    // needs one more line on paper than in the measurement overflows the page.
    expect(PRINT_METRICS_WIDTH_PX * 0.8).toBeCloseTo(526.24, 1)
  })
})

describe("chunkRows", () => {
  const HEAD = 80
  const metrics = (heights: number[]) => ({
    heights,
    headHeight: HEAD,
    lineHeight: LINE,
  })

  /** Points a page of `rows` costs, the way the printer sees it. */
  const pagePt = (rows: number[], heights: number[], firstPagePt: number) =>
    firstPagePt + rowPt(HEAD, LINE, CHROME) + rows.reduce((sum, i) => sum + rowPt(heights[i]!, LINE, CHROME), 0) // prettier-ignore

  it("never lets a page exceed the printable box", () => {
    const heights = Array.from({ length: 90 }, () => ONE_LINE)
    const pages = chunkRows(metrics(heights), STATEMENT_HEADER_PT)
    pages.forEach((rows, i) => {
      expect(pagePt(rows, heights, i === 0 ? STATEMENT_HEADER_PT : 0)).toBeLessThanOrEqual(PAGE_CONTENT_PT) // prettier-ignore
    })
  })

  it("still fits when the rows are the tallest the form produces", () => {
    const heights = Array.from({ length: 40 }, () => ONE_LINE + 2 * LINE)
    const pages = chunkRows(metrics(heights), STATEMENT_HEADER_PT)
    pages.forEach((rows, i) => {
      expect(pagePt(rows, heights, i === 0 ? STATEMENT_HEADER_PT : 0)).toBeLessThanOrEqual(PAGE_CONTENT_PT) // prettier-ignore
    })
  })

  it("fills each page rather than breaking early", () => {
    // One more row on any page would have to overflow, or the break was wasteful.
    const heights = Array.from({ length: 90 }, () => ONE_LINE)
    const pages = chunkRows(metrics(heights), STATEMENT_HEADER_PT)
    pages.slice(0, -1).forEach((rows, i) => {
      const used = pagePt(rows, heights, i === 0 ? STATEMENT_HEADER_PT : 0)
      expect(used + rowPt(ONE_LINE, LINE, CHROME)).toBeGreaterThan(PAGE_CONTENT_PT - 10) // prettier-ignore
    })
  })

  it("recovers the cell chrome from rows that all wrap", () => {
    // The chrome is whatever a row's height leaves over its whole line boxes, so
    // it is recoverable even from a statement with no single-line row at all.
    // Taking the shortest row for a single-line one instead would charge every
    // two-line row as if it were one, and pack the page half again too full.
    const wrapped = Array.from({ length: 90 }, () => ONE_LINE + LINE)
    const single = Array.from({ length: 90 }, () => ONE_LINE)
    expect(chunkRows(metrics(wrapped))[0]!.length).toBeLessThan(
      chunkRows(metrics(single))[0]!.length,
    )
    expect(pagePt(chunkRows(metrics(wrapped))[0]!, wrapped, 0)).toBeLessThanOrEqual(PAGE_CONTENT_PT) // prettier-ignore
  })

  it("gives every row a page, in order, exactly once", () => {
    const heights = Array.from(
      { length: 90 },
      (_, i) =>
      i % 7 === 0 ? ONE_LINE + 2 * LINE : i % 3 === 0 ? ONE_LINE + LINE : ONE_LINE, // prettier-ignore
    )
    const pages = chunkRows(metrics(heights), STATEMENT_HEADER_PT)
    expect(pages.flat()).toEqual(heights.map((_, i) => i))
  })

  it("puts an over-tall single row on a page of its own instead of dropping it", () => {
    const pages = chunkRows(metrics([ONE_LINE, 4000, ONE_LINE]))
    expect(pages).toEqual([[0], [1], [2]])
  })

  it("charges the title block only to the first page", () => {
    const heights = Array.from({ length: 90 }, () => ONE_LINE)
    const withHeader = chunkRows(metrics(heights), STATEMENT_HEADER_PT)
    const without = chunkRows(metrics(heights))
    expect(withHeader[0]!.length).toBeLessThan(without[0]!.length)
    expect(withHeader.at(-1)!.at(-1)).toBe(89)
  })
})
