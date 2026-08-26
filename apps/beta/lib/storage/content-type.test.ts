/**
 * The magic-byte matrix.
 *
 * Every row here is a thing an uploader can actually send: the four allowed
 * formats, the same formats truncated below their signature, the classic
 * "renamed the extension" cases, and — the one worth the most — an ISO-BMFF
 * file that shares HEIC's `ftyp` box but is video.
 */
import { describe, expect, it } from "vitest"

import {
  isInlineSafeContentType,
  sniffDocumentType,
  SNIFF_BYTES,
} from "./content-type"
import {
  HEIC_BYTES,
  JPEG_BYTES,
  MP4_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  ZIP_BYTES,
} from "../../tests/memory-document-store"

const ftyp = (major: string, ...compatible: string[]): Buffer => {
  const size = 16 + compatible.length * 4
  return Buffer.concat([
    Buffer.from([0, 0, 0, size]),
    Buffer.from("ftyp"),
    Buffer.from(major),
    Buffer.from([0, 0, 0, 0]),
    ...compatible.map((brand) => Buffer.from(brand)),
  ])
}

describe("sniffDocumentType — the allowlist", () => {
  it.each([
    ["PDF", PDF_BYTES, "application/pdf", "pdf", false],
    ["PNG", PNG_BYTES, "image/png", "png", true],
    ["JPEG", JPEG_BYTES, "image/jpeg", "jpg", true],
    ["HEIC", HEIC_BYTES, "image/heic", "heic", false],
  ] as const)(
    "accepts %s and derives its own extension",
    (_name, bytes, contentType, extension, inlineSafe) => {
      expect(sniffDocumentType(bytes)).toEqual({
        contentType,
        extension,
        inlineSafe,
      })
    },
  )

  it("accepts an iPhone file whose HEIC brand is only in the compatible list", () => {
    expect(sniffDocumentType(ftyp("mif1", "heic", "mif1"))?.contentType).toBe(
      "image/heic",
    )
  })
})

describe("sniffDocumentType — refusals", () => {
  it.each([
    ["a ZIP (an xlsx or a renamed archive)", ZIP_BYTES],
    ["an MP4 sharing HEIC's ftyp box", MP4_BYTES],
    ["an ISO-BMFF QuickTime file", ftyp("qt  ", "isom")],
    ["HTML", Buffer.from("<!doctype html><script>alert(1)</script>")],
    ["an SVG (script-bearing image)", Buffer.from('<svg xmlns="...">')],
    ["a shell script", Buffer.from("#!/bin/sh\nrm -rf /\n")],
    ["an ELF binary", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01])],
    ["plain text", Buffer.from("faktura za brezen 2026")],
    ["random noise", Buffer.from([0x13, 0x37, 0x00, 0xff, 0x42])],
    ["nothing at all", Buffer.alloc(0)],
  ])("refuses %s", (_name, bytes) => {
    expect(sniffDocumentType(bytes)).toBeNull()
  })

  it.each([
    ["PDF", PDF_BYTES],
    ["PNG", PNG_BYTES],
    ["JPEG", JPEG_BYTES],
    ["HEIC", HEIC_BYTES],
  ] as const)("refuses a truncated %s", (_name, bytes) => {
    // One byte short of the signature is not the format.
    expect(sniffDocumentType(bytes.subarray(0, 2))).toBeNull()
  })

  it("refuses an ftyp box whose declared size is impossibly small", () => {
    const runt = Buffer.concat([
      Buffer.from([0, 0, 0, 8]),
      Buffer.from("ftyp"),
      Buffer.from("heic"),
    ])
    expect(sniffDocumentType(runt)).toBeNull()
  })

  it("does not scan an unbounded compatible-brand list", () => {
    // A hostile box claims 4 GiB and hides an allowed brand far past the cap.
    const hostile = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from("ftyp"),
      Buffer.from("mp42"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.alloc(4 * 40, 0x61),
      Buffer.from("heic"),
    ])
    expect(sniffDocumentType(hostile)).toBeNull()
  })

  it("decides from the leading bytes only — a payload cannot rescue itself", () => {
    const disguised = Buffer.concat([
      Buffer.from("GIF89a"),
      Buffer.alloc(SNIFF_BYTES, 0),
      PDF_BYTES,
    ])
    expect(sniffDocumentType(disguised)).toBeNull()
  })
})

describe("isInlineSafeContentType", () => {
  it("allows only the two raster image types", () => {
    expect(isInlineSafeContentType("image/png")).toBe(true)
    expect(isInlineSafeContentType("image/jpeg")).toBe(true)
  })

  it.each(["application/pdf", "image/heic", "text/html", "image/svg+xml", ""])(
    "refuses %s",
    (contentType) => {
      expect(isInlineSafeContentType(contentType)).toBe(false)
    },
  )
})
