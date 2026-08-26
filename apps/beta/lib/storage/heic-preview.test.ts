/**
 * The HEIC → JPEG derivative, over a REAL HEVC-coded HEIC.
 *
 * THE POINT OF THIS FILE IS THE CAPABILITY, NOT THE ARITHMETIC. `sharp`'s
 * prebuilt libvips answers "Support for this compression format has not been
 * built in" to exactly the fixture below, which is why beta decodes with
 * `libheif-js` instead (see the module header). A green test here is the
 * standing proof that the decoder in the lockfile can still open what an iPhone
 * writes — and it is a proof that runs in the `pure` project, with no Postgres
 * and no Docker behind it, so it cannot become the suite everyone skips.
 */
import { describe, expect, it } from "vitest"

import {
  HEIC_PREVIEW_MAX_EDGE,
  HEIC_PREVIEW_MAX_PIXELS,
  HEIC_PREVIEW_QUALITY,
  heicJpegPreview,
} from "./heic-preview"
import { sniffDocumentType } from "./content-type"
import { previewFilename } from "./content-disposition"
import {
  REAL_HEIC_BYTES,
  REAL_HEIC_HEIGHT,
  REAL_HEIC_WIDTH,
} from "../../tests/heic-fixture"

describe("the fixture really is a HEIC", () => {
  it("passes the upload allowlist as image/heic", () => {
    expect(sniffDocumentType(REAL_HEIC_BYTES)).toMatchObject({
      contentType: "image/heic",
      extension: "heic",
      // Never inline: the ORIGINAL stays a download whatever the derivative does.
      inlineSafe: false,
    })
  })
})

describe("heicJpegPreview", () => {
  it("decodes a real HEIC and answers a real JPEG", async () => {
    const preview = await heicJpegPreview(REAL_HEIC_BYTES)

    expect(preview).not.toBeNull()
    expect(preview!.width).toBe(REAL_HEIC_WIDTH)
    expect(preview!.height).toBe(REAL_HEIC_HEIGHT)
    // SOI + the JFIF/APP0 marker: the same three bytes `sniffDocumentType`
    // accepts as JPEG, so the derivative would survive the upload allowlist it
    // never has to face.
    expect([...preview!.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    expect(sniffDocumentType(preview!.bytes)).toMatchObject({
      contentType: "image/jpeg",
    })
    expect(preview!.bytes.byteLength).toBeGreaterThan(0)
  })

  it("leaves an image already inside the box at its own size", async () => {
    // The fixture is 64 × 48 — far under the cap — so the derivative must be
    // the same dimensions, not an upscale to 2400.
    const preview = await heicJpegPreview(REAL_HEIC_BYTES)
    expect(Math.max(preview!.width, preview!.height)).toBeLessThanOrEqual(
      HEIC_PREVIEW_MAX_EDGE,
    )
    expect(preview!.width).toBe(REAL_HEIC_WIDTH)
  })

  it("carries spec §2.2's numbers, not invented ones", () => {
    expect(HEIC_PREVIEW_MAX_EDGE).toBe(2400)
    // `q0.8` on jpeg-js's 0-100 scale.
    expect(HEIC_PREVIEW_QUALITY).toBe(80)
  })

  it("bounds the DECOMPRESSED frame, not just the compressed bytes", () => {
    // Decoding is 4 bytes per pixel, so this ceiling is the one that decides how
    // much memory one upload can make the task allocate: 50 MP ≈ 200 MiB on a
    // task sized 512-1024 MiB (plan Part 1). Comfortably past a 48 MP phone
    // frame and an order of magnitude below the point where an upload can take
    // the task down. The 25 MiB cap does not bound this number at all — a small
    // compressed file can declare enormous dimensions.
    expect(HEIC_PREVIEW_MAX_PIXELS).toBe(50_000_000)
    expect(HEIC_PREVIEW_MAX_PIXELS * 4).toBeLessThan(256 * 1024 * 1024)
  })

  it.each([
    ["empty", Buffer.alloc(0)],
    ["random noise", Buffer.alloc(512, 0x5a)],
    ["a PDF", Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")],
    [
      "an ftyp box with nothing behind it",
      Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from("ftyp"),
        Buffer.from("heic"),
        Buffer.alloc(16, 0x33),
      ]),
    ],
    ["a truncated HEIC", REAL_HEIC_BYTES.subarray(0, 400)],
  ])("answers null rather than throwing for %s", async (_label, bytes) => {
    // The contract the upload path depends on: a derivative that cannot be made
    // is a `null`, never an exception, because an exception here would turn a
    // successful upload into a 500.
    await expect(heicJpegPreview(bytes)).resolves.toBeNull()
  })
})

describe("previewFilename", () => {
  it.each([
    ["IMG_0421.heic", "IMG_0421.jpg"],
    ["IMG_0421.HEIC", "IMG_0421.jpg"],
    ["foto.heif", "foto.jpg"],
    ["Účtenka Nováková.heic", "Účtenka Nováková.jpg"],
  ])("rewrites %s to %s", (input, expected) => {
    expect(previewFilename(input)).toBe(expected)
  })

  it("APPENDS rather than guessing where an unknown extension ends", () => {
    // Substituting here would turn `faktura.2026.03` into `faktura.2026.jpg`
    // and lose the part that identified the document.
    expect(previewFilename("faktura.2026.03")).toBe("faktura.2026.03.jpg")
    expect(previewFilename("dokument")).toBe("dokument.jpg")
    expect(previewFilename(".skryty")).toBe(".skryty.jpg")
  })
})
