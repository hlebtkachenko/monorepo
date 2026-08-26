/**
 * What a file IS, decided from its leading bytes.
 *
 * THE CLIENT'S CLAIM IS NOT AN INPUT. This module never sees the request's
 * `Content-Type` header and never sees the filename's extension: both are
 * attacker-controlled strings, and the entire point of the allowlist is that the
 * thing stored is the thing the bytes say it is. The sniffed type is what goes
 * into `document.content_type`, the sniffed type is what the download route
 * serves back, and the extension of the storage key is derived from the sniffed
 * type too. A PNG uploaded as `faktura.pdf` is stored as a PNG; a ZIP uploaded
 * as `photo.png` is refused.
 *
 * WHY AN ALLOWLIST AND NOT A LIBRARY. The four types beta accepts (spec §2.2:
 * PDF / PNG / JPEG / HEIC) have short, unambiguous signatures. A general
 * file-type library recognises hundreds of formats, which is exactly the
 * property we do not want — every additional recognised format is a format that
 * can end up in the bucket, and the failure mode of a sniffing library is
 * "guessed something plausible", not "refused".
 *
 * PURE MODULE: no `server-only`, no I/O, no dependency. It is the piece most
 * worth testing adversarially, so it must be callable from a plain unit test.
 */

/** The four content types beta stores, and nothing else. */
export type BetaDocumentContentType =
  "application/pdf" | "image/png" | "image/jpeg" | "image/heic"

export type BetaDocumentExtension = "pdf" | "png" | "jpg" | "heic"

export type BetaDocumentFileType = {
  contentType: BetaDocumentContentType
  /** Extension of the storage key. Derived from the TYPE, never the filename. */
  extension: BetaDocumentExtension
  /**
   * May the download route serve this inline?
   *
   * PNG and JPEG only (plan Part 4, "attachment default, inline images only").
   * PDF is `false` even though every browser can render one: an inline PDF is a
   * plugin-rendered document on this origin, and beta's preview is a SANDBOXED
   * iframe built in PR 12 — a route that also serves the same bytes inline on a
   * top-level navigation would hand back the escape hatch that sandbox exists
   * to close. HEIC is `false` because no non-Apple browser renders it; PR 11
   * generates a JPEG derivative for preview and the original stays a download.
   */
  inlineSafe: boolean
}

/**
 * Bytes needed to decide. 64 covers the longest check by a wide margin: the
 * HEIC `ftyp` box is 8 bytes of header plus a 4-byte major brand plus 4 bytes
 * of minor version, after which compatible brands run in 4-byte groups — this
 * reads at most the first twelve of them.
 */
export const SNIFF_BYTES = 64

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const // "%PDF-"
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG = [0xff, 0xd8, 0xff] as const
const FTYP = [0x66, 0x74, 0x79, 0x70] as const // "ftyp" at offset 4

/**
 * ISO-BMFF brands that mean "this is a still image in HEIF/HEIC form".
 *
 * `heic`/`heix` are the HEVC-coded HEIC brands, `hevc`/`hevx` their sequence
 * counterparts, `heim`/`heis`/`hevm`/`hevs` the multiview/scalable variants, and
 * `mif1`/`msf1` the generic HEIF image brands an iPhone frequently writes as
 * the MAJOR brand while listing `heic` among the compatible ones.
 *
 * What is deliberately NOT here: `mp41`, `mp42`, `isom`, `qt  `, `avc1`. Those
 * share the exact same `ftyp` box and are VIDEO. Matching the box alone — the
 * obvious shortcut — would turn the image allowlist into "any ISO-BMFF file",
 * which is how a 25 MiB video ends up in an accounting archive.
 */
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
])

/** Compatible-brand groups read past the major brand. 12 × 4 bytes = 48. */
const MAX_COMPATIBLE_BRANDS = 12

function startsWith(bytes: Uint8Array, expected: readonly number[]): boolean {
  if (bytes.length < expected.length) return false
  return expected.every((value, index) => bytes[index] === value)
}

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  if (bytes.length < offset + expected.length) return false
  return expected.every((value, index) => bytes[offset + index] === value)
}

/** The 4 ASCII characters at `offset`, or null if they are not printable. */
function brandAt(bytes: Uint8Array, offset: number): string | null {
  if (bytes.length < offset + 4) return null
  let brand = ""
  for (let index = offset; index < offset + 4; index += 1) {
    const code = bytes[index]
    if (code === undefined || code < 0x20 || code > 0x7e) return null
    brand += String.fromCharCode(code)
  }
  return brand
}

function isHeif(bytes: Uint8Array): boolean {
  if (!matchesAt(bytes, 4, FTYP)) return false

  // The `ftyp` box must actually be a box: 4-byte big-endian size covering at
  // least the header plus the major brand plus the minor version.
  const size =
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0)
  if (size < 16) return false

  const major = brandAt(bytes, 8)
  if (major !== null && HEIF_BRANDS.has(major)) return true

  // Apple writes `mif1`-major files that declare `heic` as a compatible brand,
  // and the reverse also occurs. Read the compatible-brand list, bounded by the
  // box size AND by a hard cap so a hostile 4 GiB `size` cannot make this loop.
  const limit = Math.min(size, bytes.length, 16 + MAX_COMPATIBLE_BRANDS * 4)
  for (let offset = 16; offset + 4 <= limit; offset += 4) {
    const brand = brandAt(bytes, offset)
    if (brand !== null && HEIF_BRANDS.has(brand)) return true
  }
  return false
}

/**
 * The file type of `head`, or `null` when the bytes are not one of the four
 * allowed types.
 *
 * `head` is the LEADING bytes of the upload — at most `SNIFF_BYTES` are read.
 * A truncated file (fewer bytes than a signature needs) returns `null`, which
 * is the correct answer: an upload that cannot be identified is refused.
 */
export function sniffDocumentType(
  head: Uint8Array,
): BetaDocumentFileType | null {
  if (startsWith(head, PDF)) {
    return {
      contentType: "application/pdf",
      extension: "pdf",
      inlineSafe: false,
    }
  }
  if (startsWith(head, PNG)) {
    return { contentType: "image/png", extension: "png", inlineSafe: true }
  }
  if (startsWith(head, JPEG)) {
    return { contentType: "image/jpeg", extension: "jpg", inlineSafe: true }
  }
  if (isHeif(head)) {
    return { contentType: "image/heic", extension: "heic", inlineSafe: false }
  }
  return null
}

/**
 * Whether a STORED document may be served inline, decided from the stored
 * content type rather than from a sniff.
 *
 * The download route reads a row, not a file, so it needs this direction of the
 * mapping. Anything unrecognised answers `false` — a content type that somehow
 * reached the table outside the allowlist must not become an inline render.
 */
export function isInlineSafeContentType(contentType: string): boolean {
  return contentType === "image/png" || contentType === "image/jpeg"
}

/**
 * Whether a STORED document may be served for the row sheet's framed preview
 * (spec §2.2 "Row sheet: sandboxed preview").
 *
 * THE SUPERSET OF `isInlineSafeContentType`, BY EXACTLY ONE TYPE: PDF. The two
 * predicates answer different questions and that is why there are two.
 *
 *   `isInlineSafeContentType` — may this render as a bare `<img>` on a page of
 *   ours, inside OUR document context, under OUR CSP? PNG and JPEG only. A PDF
 *   there would be a plugin-rendered document sharing this origin.
 *
 *   this one — may this be the src of the preview frame, whose response carries
 *   `default-src 'none'; sandbox` and is therefore its own opaque origin with no
 *   scripting and no subresource loads of any kind? PDF qualifies: the sandbox
 *   directive is what confines it, and it confines it identically whether the
 *   frame is reached from our sheet or by typing the URL.
 *
 * HEIC stays out of both. No non-Apple browser renders it, so an inline HEIC is
 * a broken frame rather than a preview; PR 11 generates the JPEG derivative that
 * makes those rows previewable.
 */
export function isFramePreviewableContentType(contentType: string): boolean {
  return (
    isInlineSafeContentType(contentType) || contentType === "application/pdf"
  )
}
