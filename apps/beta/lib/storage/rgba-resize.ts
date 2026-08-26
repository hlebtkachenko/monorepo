/**
 * Box-average downscaling of a raw RGBA buffer.
 *
 * WHY THIS EXISTS RATHER THAN A LIBRARY. The one image library already in this
 * monorepo's tree is `sharp`, and it cannot be used here — see the capability
 * note in `heic-preview.ts`. Everything else that resizes pulls in either a
 * native binary (which the beta image builds on a DIFFERENT architecture than it
 * runs on, so a platform-matched `.node` would not be there) or a full canvas
 * implementation. Averaging pixels is forty lines; a dependency that averages
 * pixels is a supply chain.
 *
 * WHY BOX AVERAGE AND NOT NEAREST NEIGHBOUR. Nearest neighbour is three lines
 * shorter and produces aliasing that looks exactly like a bad scan: the thin
 * strokes of a Czech invoice's digits break up, which is the single thing this
 * preview exists to let someone read. Averaging every source pixel that falls in
 * a destination cell is the cheapest filter that does not do that, and it is
 * exact — no weights, no rounding policy to get wrong.
 *
 * ALPHA IS AVERAGED, NOT PREMULTIPLIED. The only consumer is the JPEG encoder,
 * which discards alpha entirely, so premultiplication would be arithmetic in
 * service of a channel nobody reads.
 *
 * PURE MODULE: no `server-only`, no I/O, no dependency. It is called with
 * attacker-influenced dimensions, so it is the piece worth testing directly.
 */

export type RgbaImage = {
  /** RGBA, 4 bytes per pixel, row-major from the top-left. */
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * The dimensions `image` becomes when its long edge is capped at `maxEdge`.
 *
 * Returns the input dimensions unchanged when it already fits — the caller uses
 * that equality to skip the copy entirely. Never returns a zero edge: an image
 * 4000 px wide and 1 px tall scaled to a 2400 px long edge would round its
 * height to 0 and produce a buffer no encoder accepts.
 */
export function fitWithin(
  image: { width: number; height: number },
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(image.width, image.height)
  if (longest <= maxEdge) return { width: image.width, height: image.height }

  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  }
}

/**
 * Downscale `image` so its long edge is at most `maxEdge`.
 *
 * Returns the SAME object when nothing needs doing, so a caller that is already
 * holding a decoded frame does not pay for a copy of it.
 *
 * Upscaling is not supported and not wanted: `fitWithin` never grows an image,
 * so a source smaller than `maxEdge` comes back untouched.
 */
export function resizeRgba(image: RgbaImage, maxEdge: number): RgbaImage {
  const target = fitWithin(image, maxEdge)
  if (target.width === image.width && target.height === image.height) {
    return image
  }

  const { data, width: sourceWidth, height: sourceHeight } = image
  const out = new Uint8ClampedArray(target.width * target.height * 4)

  // Destination cell (x, y) covers the source rectangle
  // [x·sw/tw, (x+1)·sw/tw) × [y·sh/th, (y+1)·sh/th). Computed from the ratios
  // rather than by stepping an accumulator so a rounding error cannot drift
  // across the image and leave the last column reading out of bounds.
  const xRatio = sourceWidth / target.width
  const yRatio = sourceHeight / target.height

  for (let y = 0; y < target.height; y += 1) {
    const yStart = Math.floor(y * yRatio)
    const yEnd = Math.max(
      yStart + 1,
      Math.min(sourceHeight, Math.ceil((y + 1) * yRatio)),
    )

    for (let x = 0; x < target.width; x += 1) {
      const xStart = Math.floor(x * xRatio)
      const xEnd = Math.max(
        xStart + 1,
        Math.min(sourceWidth, Math.ceil((x + 1) * xRatio)),
      )

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let samples = 0

      for (let sy = yStart; sy < yEnd; sy += 1) {
        const rowOffset = sy * sourceWidth * 4
        for (let sx = xStart; sx < xEnd; sx += 1) {
          const offset = rowOffset + sx * 4
          r += data[offset] ?? 0
          g += data[offset + 1] ?? 0
          b += data[offset + 2] ?? 0
          a += data[offset + 3] ?? 0
          samples += 1
        }
      }

      const targetOffset = (y * target.width + x) * 4
      out[targetOffset] = Math.round(r / samples)
      out[targetOffset + 1] = Math.round(g / samples)
      out[targetOffset + 2] = Math.round(b / samples)
      out[targetOffset + 3] = Math.round(a / samples)
    }
  }

  return { data: out, width: target.width, height: target.height }
}
