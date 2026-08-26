/**
 * `Content-Disposition` for a Czech filename.
 *
 * THE PROBLEM. `filename="Faktura Nováková 03-2026.pdf"` is not representable:
 * the header's quoted-string is ISO-8859-1, so `á` either mangles into `Ã¡` or —
 * worse, if the byte is emitted raw — becomes a header-injection surface. RFC 5987
 * (as applied to this header by RFC 6266 §4.3) defines `filename*`, a
 * percent-encoded UTF-8 form with an explicit charset, which every browser in
 * the last decade prefers over the plain parameter when both are present.
 *
 * SO BOTH ARE EMITTED. `filename=` carries an ASCII-only fallback for anything
 * that does not understand `filename*`; `filename*=UTF-8''…` carries the truth.
 * The fallback is not a transliteration — guessing that `ř` should become `r` is
 * a locale decision this layer has no business making — it is the same string
 * with every non-ASCII and every structurally dangerous character replaced by
 * `_`, so it stays recognisable and cannot break the header's grammar.
 *
 * WHAT MAKES THIS SECURITY CODE. `original_filename` is a string the uploader
 * chose. Reflected into a response header without sanitising, a CR or LF in it
 * is response splitting, a `"` ends the quoted-string early and lets an attacker
 * append parameters, and a `/` or `\` can steer some download managers out of
 * the download directory. Everything below is written so that no byte of user
 * input reaches the header un-encoded.
 *
 * PURE MODULE — string in, string out, unit-testable without a request.
 */

export type DocumentDisposition = "attachment" | "inline"

/** Anything that is not a plain, safe ASCII filename character. */
const UNSAFE_ASCII = /[^A-Za-z0-9._-]/g
/** RFC 5987 `attr-char` — the set that may appear un-encoded in `filename*`. */
const ATTR_CHAR = /[A-Za-z0-9!#$&+^_`|~.-]/

/**
 * Strip any directory component the client sent.
 *
 * A browser sends a bare filename, but this API also accepts a filename from a
 * query parameter, so `../../etc/passwd` and `C:\Windows\win.ini` are both
 * strings a caller can supply. Nothing downstream uses the filename to build a
 * path — the storage key is two UUIDs — but the value is echoed in a header and
 * saved to a disk by the browser, so the path segments come off here.
 */
export function baseFilename(filename: string): string {
  const withoutPath = filename.split(/[\\/]/).pop() ?? ""
  // Leading dots would produce a hidden file; a name that is only dots is not a
  // name at all.
  return withoutPath.replace(/^\.+/, "").trim()
}

/** ASCII fallback for the legacy `filename=` parameter. */
export function asciiFallbackFilename(filename: string): string {
  const collapsed = baseFilename(filename).replace(UNSAFE_ASCII, "_")
  const trimmed = collapsed.slice(0, 100).replace(/^_+|_+$/g, "")
  return trimmed.length > 0 ? trimmed : "dokument"
}

/**
 * The name a HEIC's JPEG derivative is served under (PR 11, spec §2.2).
 *
 * `foto.heic` → `foto.jpg`. The derivative IS a JPEG, and a `Content-Type:
 * image/jpeg` next to `filename="foto.heic"` is the kind of small inconsistency
 * that ends with someone saving a file their viewer refuses to open.
 *
 * A name with no extension, or one this function does not recognise, gets `.jpg`
 * APPENDED rather than substituted: guessing where an extension ends is how
 * `faktura.2026.03` becomes `faktura.jpg` and loses the part that identified it.
 *
 * Lives here rather than next to the decoder on purpose. The file route needs
 * this one string operation and nothing else about HEIC; importing it from
 * `heic-preview.ts` would pull the WebAssembly decoder into the module graph of
 * a route that serves PDFs.
 */
export function previewFilename(original: string): string {
  const dot = original.lastIndexOf(".")
  const extension = dot > 0 ? original.slice(dot + 1).toLowerCase() : ""
  return extension === "heic" || extension === "heif"
    ? `${original.slice(0, dot)}.jpg`
    : `${original}.jpg`
}

/** RFC 5987 `ext-value`: `UTF-8''` followed by percent-encoded UTF-8. */
export function rfc5987Encode(value: string): string {
  const bytes = Buffer.from(value, "utf8")
  let encoded = ""
  for (const byte of bytes) {
    const char = String.fromCharCode(byte)
    encoded += ATTR_CHAR.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
  }
  return `UTF-8''${encoded}`
}

/**
 * The full header value.
 *
 * `disposition` is decided by the CALLER from the stored content type, never
 * from a request parameter alone — see `lib/data/documents.ts`.
 */
export function contentDispositionHeader(
  disposition: DocumentDisposition,
  filename: string,
): string {
  const base = baseFilename(filename)
  const fallback = asciiFallbackFilename(base)
  const encoded = rfc5987Encode(base.length > 0 ? base : "dokument")
  return `${disposition}; filename="${fallback}"; filename*=${encoded}`
}
