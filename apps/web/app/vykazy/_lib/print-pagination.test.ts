import { describe, expect, it } from "vitest"

import {
  chunkRows,
  rowMm,
  PRINT_METRICS_WIDTH_PX,
  STATEMENT_HEADER_MM,
} from "./print-pagination"

const PT_TO_MM = 25.4 / 72

/**
 * The calibration set: printed cell heights read off a Safari PDF of the
 * rozvaha, against the same rows measured in the `.print-metrics` replica.
 * Both WebKit and Chromium report the replica side identically.
 */
const CALIBRATION = [
  { label: "one line", replicaPx: 21.5, printedPt: 17.6 },
  { label: "two lines", replicaPx: 38, printedPt: 30.4 },
  { label: "three lines", replicaPx: 54.5, printedPt: 43.2 },
]

/** A4 portrait minus the 12mm @page margins, as the printed clip box measures. */
const CLIP_MM = 272.7

describe("rowMm", () => {
  for (const { label, replicaPx, printedPt } of CALIBRATION) {
    it(`charges a ${label} row what it actually prints`, () => {
      // Within a micrometre of the measured artefact.
      expect(rowMm(replicaPx)).toBeCloseTo(printedPt * PT_TO_MM, 3)
    })
  }

  it("is affine, not a ratio — every row carries a fixed cost on top", () => {
    // A pure ratio would make cost/px constant; it is not, and that difference
    // is what used to tear the last row of every page in half.
    const perPx = CALIBRATION.map((c) => rowMm(c.replicaPx) / c.replicaPx)
    expect(perPx[0]).toBeGreaterThan(perPx[2]!)
    // The fitted intercept, a shade over one 0.8pt collapsed border (0.282mm).
    expect(rowMm(0)).toBeCloseTo(0.325, 3)
  })

  it("keeps the replica width a literal, decoupled from the scale", () => {
    // Deriving the width from the scale would re-wrap every row whenever the
    // scale is retuned, invalidating the calibration that produced it.
    expect(PRINT_METRICS_WIDTH_PX).toBe(690)
  })
})

describe("chunkRows", () => {
  const ONE_LINE = 21.5
  const HEAD = 80

  /** Millimetres a page of `rows` costs, the way the printer sees it. */
  const pageMm = (rows: number[], heights: number[], firstPageMm: number) =>
    firstPageMm + rowMm(HEAD) + rows.reduce((sum, i) => sum + rowMm(heights[i]!), 0) // prettier-ignore

  it("never lets a page exceed the printable box", () => {
    const heights = Array.from({ length: 90 }, () => ONE_LINE)
    const pages = chunkRows(heights, HEAD, STATEMENT_HEADER_MM)
    pages.forEach((rows, i) => {
      expect(pageMm(rows, heights, i === 0 ? STATEMENT_HEADER_MM : 0)).toBeLessThanOrEqual(CLIP_MM) // prettier-ignore
    })
  })

  it("still fits when the rows are the tallest the form produces", () => {
    const heights = Array.from({ length: 40 }, () => 54.5)
    const pages = chunkRows(heights, HEAD, STATEMENT_HEADER_MM)
    pages.forEach((rows, i) => {
      expect(pageMm(rows, heights, i === 0 ? STATEMENT_HEADER_MM : 0)).toBeLessThanOrEqual(CLIP_MM) // prettier-ignore
    })
  })

  it("fills each page rather than breaking early", () => {
    // One more row on any page would have to overflow, or the break was wasteful.
    const heights = Array.from({ length: 90 }, () => ONE_LINE)
    const pages = chunkRows(heights, HEAD, STATEMENT_HEADER_MM)
    pages.slice(0, -1).forEach((rows, i) => {
      const used = pageMm(rows, heights, i === 0 ? STATEMENT_HEADER_MM : 0)
      expect(used + rowMm(ONE_LINE)).toBeGreaterThan(CLIP_MM - 6)
    })
  })

  it("gives every row a page, in order, exactly once", () => {
    const heights = Array.from({ length: 90 }, (_, i) =>
      i % 7 === 0 ? 54.5 : i % 3 === 0 ? 38 : ONE_LINE,
    )
    const pages = chunkRows(heights, HEAD, STATEMENT_HEADER_MM)
    expect(pages.flat()).toEqual(heights.map((_, i) => i))
  })

  it("puts an over-tall single row on a page of its own instead of dropping it", () => {
    const pages = chunkRows([ONE_LINE, 4000, ONE_LINE], HEAD, 0)
    expect(pages).toEqual([[0], [1], [2]])
  })

  it("charges the title block only to the first page", () => {
    const heights = Array.from({ length: 90 }, () => ONE_LINE)
    const withHeader = chunkRows(heights, HEAD, STATEMENT_HEADER_MM)
    const without = chunkRows(heights, HEAD, 0)
    expect(withHeader[0]!.length).toBeLessThan(without[0]!.length)
    expect(withHeader.at(-1)!.at(-1)).toBe(89)
  })
})
