import { describe, expect, it } from "vitest"

import { fitWithin, resizeRgba, type RgbaImage } from "./rgba-resize"

/** A solid-colour image of the given size. */
function solid(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = rgba[0]
    data[offset + 1] = rgba[1]
    data[offset + 2] = rgba[2]
    data[offset + 3] = rgba[3]
  }
  return { data, width, height }
}

/**
 * The first pixel that is not `rgba`, as `[index, actual]` — or null.
 *
 * A scan with ONE assertion at the end, rather than one `expect` per pixel: a
 * few hundred thousand vitest assertions is minutes of work, and a failure
 * would print the same information either way (this returns the offending
 * pixel's index and value).
 */
function firstMismatch(
  image: RgbaImage,
  rgba: [number, number, number, number],
): [number, number[]] | null {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const pixel = [
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
      image.data[offset + 3],
    ]
    if (pixel.some((value, channel) => value !== rgba[channel])) {
      return [offset / 4, pixel as number[]]
    }
  }
  return null
}

describe("fitWithin", () => {
  it("leaves an image that already fits exactly as it is", () => {
    expect(fitWithin({ width: 1200, height: 900 }, 2400)).toEqual({
      width: 1200,
      height: 900,
    })
    // The boundary itself is inside the box, not outside it.
    expect(fitWithin({ width: 2400, height: 1000 }, 2400)).toEqual({
      width: 2400,
      height: 1000,
    })
  })

  it("caps the LONG edge, whichever one it is", () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 2400)).toEqual({
      width: 2400,
      height: 1800,
    })
    expect(fitWithin({ width: 3024, height: 4032 }, 2400)).toEqual({
      width: 1800,
      height: 2400,
    })
  })

  it("never rounds an edge down to zero", () => {
    // A 8000 × 1 panorama scaled by 0.3 would round its height to 0, and a
    // zero-height buffer is one no encoder accepts.
    expect(fitWithin({ width: 8000, height: 1 }, 2400)).toEqual({
      width: 2400,
      height: 1,
    })
  })
})

describe("resizeRgba", () => {
  it("returns the very same object when nothing needs doing", () => {
    const image = solid(10, 10, [1, 2, 3, 4])
    expect(resizeRgba(image, 2400)).toBe(image)
  })

  it("produces a buffer of exactly the target size", () => {
    const scaled = resizeRgba(solid(4032, 3024, [10, 20, 30, 255]), 2400)
    expect(scaled.width).toBe(2400)
    expect(scaled.height).toBe(1800)
    expect(scaled.data.length).toBe(2400 * 1800 * 4)
  })

  it("preserves a solid colour exactly — averaging equal pixels is that pixel", () => {
    const scaled = resizeRgba(solid(800, 600, [200, 100, 50, 255]), 400)
    expect(scaled.width).toBe(400)
    expect(scaled.height).toBe(300)
    // Scanned in a plain loop and asserted ONCE. A per-pixel `expect` over
    // 120 000 pixels is 120 000 assertions and takes longer than vitest's
    // 5 s default on a shared runner — a test that fails on the CI machine's
    // speed rather than on the code is worse than no test.
    expect(firstMismatch(scaled, [200, 100, 50, 255])).toBeNull()
  })

  it("AVERAGES rather than sampling — a checkerboard becomes its mean", () => {
    // 4 × 4 of alternating black and white, halved. Nearest neighbour would
    // answer pure black or pure white for every cell; a box average answers the
    // midpoint, which is the property that keeps thin strokes legible.
    const data = new Uint8ClampedArray(4 * 4 * 4)
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4
        const value = (x + y) % 2 === 0 ? 0 : 255
        data[offset] = value
        data[offset + 1] = value
        data[offset + 2] = value
        data[offset + 3] = 255
      }
    }

    const scaled = resizeRgba({ data, width: 4, height: 4 }, 2)
    expect(scaled.width).toBe(2)
    expect(scaled.height).toBe(2)
    for (let offset = 0; offset < scaled.data.length; offset += 4) {
      // Two black + two white per 2 × 2 cell.
      expect(scaled.data[offset]).toBe(128)
    }
  })

  it("reads no pixel outside the source, even on ugly ratios", () => {
    // 999 × 7 → long edge 100. Every dimension is prime-ish, so the cell
    // boundaries land nowhere convenient; an off-by-one in the loop bounds shows
    // up as an `undefined` read, which the `?? 0` would turn into a black band.
    const image = solid(999, 7, [70, 80, 90, 255])
    const scaled = resizeRgba(image, 100)
    expect(scaled.width).toBe(100)
    expect(scaled.height).toBe(1)
    // An out-of-bounds read would come back through `?? 0` as a black pixel, so
    // a single deviation anywhere in the row is the failure.
    expect(firstMismatch(scaled, [70, 80, 90, 255])).toBeNull()
  })
})
