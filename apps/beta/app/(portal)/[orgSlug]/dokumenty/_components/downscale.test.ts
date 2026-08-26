/**
 * The client-side downscale RULE (spec §2.2 / §0.4 fix F12).
 *
 * `prepareUpload` itself needs `createImageBitmap` and a `<canvas>`, neither of
 * which exists in the Node runner and neither of which is where the decisions
 * live. `planDownscale` is the decision — which types, which threshold, which
 * target, which quality — and it is a pure function precisely so that the rule
 * can be asserted without a browser.
 *
 * WHAT THIS FILE IS NOT. It is not a security test. Everything the browser
 * decides here is advisory: the server sniffs the leading bytes, counts them
 * against 25 MiB while streaming, and hashes them, whatever this planner said.
 * That contract is asserted where it belongs — `lib/storage/content-type.test.ts`,
 * `lib/storage/upload-stream.test.ts`, and the upload route's own suite.
 */
import { describe, expect, it } from "vitest"

import {
  DOWNSCALE_MAX_EDGE,
  DOWNSCALE_QUALITY,
  jpegFilename,
  planDownscale,
} from "./downscale"

describe("planDownscale — spec §2.2's numbers", () => {
  it("uses 2400 px and q0.8, verbatim", () => {
    expect(DOWNSCALE_MAX_EDGE).toBe(2400)
    expect(DOWNSCALE_QUALITY).toBe(0.8)
  })

  it("downscales a phone photo to a 2400 px long edge as JPEG q0.8", () => {
    expect(
      planDownscale({ contentType: "image/jpeg", width: 4032, height: 3024 }),
    ).toEqual({
      downscale: true,
      width: 2400,
      height: 1800,
      quality: 0.8,
      contentType: "image/jpeg",
    })
  })

  it("caps the long edge whichever way the phone was held", () => {
    const portrait = planDownscale({
      contentType: "image/jpeg",
      width: 3024,
      height: 4032,
    })
    expect(portrait).toMatchObject({
      downscale: true,
      width: 1800,
      height: 2400,
    })
  })

  it("re-encodes an oversized PNG as JPEG — spec §2.2 names one output format", () => {
    expect(
      planDownscale({ contentType: "image/png", width: 5000, height: 5000 }),
    ).toMatchObject({ downscale: true, contentType: "image/jpeg" })
  })
})

describe("planDownscale — what it leaves alone", () => {
  it("passes a small image through untouched, PNG included", () => {
    expect(
      planDownscale({ contentType: "image/jpeg", width: 1200, height: 900 }),
    ).toEqual({ downscale: false, reason: "already-small" })
    expect(
      planDownscale({ contentType: "image/png", width: 800, height: 600 }),
    ).toEqual({ downscale: false, reason: "already-small" })
  })

  it("treats exactly 2400 px as inside the box, not outside it", () => {
    expect(
      planDownscale({ contentType: "image/jpeg", width: 2400, height: 1600 }),
    ).toEqual({ downscale: false, reason: "already-small" })
    expect(
      planDownscale({ contentType: "image/jpeg", width: 2401, height: 1600 }),
    ).toMatchObject({ downscale: true, width: 2400 })
  })

  it.each([
    ["application/pdf"],
    // HEIC is the one the SERVER handles: no browser outside Safari can decode
    // it, so a canvas cannot open it and the JPEG derivative is made server-side
    // (`lib/storage/heic-preview.ts`).
    ["image/heic"],
    ["image/heif"],
    ["image/gif"],
    ["image/svg+xml"],
    [""],
  ])("never touches %s", (contentType) => {
    expect(planDownscale({ contentType, width: 9000, height: 9000 })).toEqual({
      downscale: false,
      reason: "not-an-image",
    })
  })

  it("never plans a zero-pixel canvas", () => {
    // A panorama would round its short edge to 0 and `drawImage` would throw,
    // turning an upload into a failure for a file that was perfectly fine.
    expect(
      planDownscale({ contentType: "image/jpeg", width: 8000, height: 1 }),
    ).toMatchObject({ width: 2400, height: 1 })
  })

  it("treats a browser that reported no dimensions as nothing to do", () => {
    expect(
      planDownscale({ contentType: "image/jpeg", width: NaN, height: NaN }),
    ).toEqual({ downscale: false, reason: "already-small" })
  })
})

describe("jpegFilename", () => {
  it("renames a re-encoded file to match its new bytes", () => {
    expect(jpegFilename("IMG_0421.png")).toBe("IMG_0421.jpg")
    expect(jpegFilename("Účtenka OBI.JPEG")).toBe("Účtenka OBI.jpg")
  })

  it("appends when there is no extension to replace", () => {
    expect(jpegFilename("dokument")).toBe("dokument.jpg")
    expect(jpegFilename(".skryty")).toBe(".skryty.jpg")
  })
})
