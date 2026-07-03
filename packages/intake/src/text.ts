// Shared text helpers: BOM-tolerant UTF-8 decode + the fast-xml-parser "#text" unwrap. Both were
// reimplemented across detect/csv/xlsx/pohoda; centralizing them also fixes a latent bug — pohoda.ts
// used to decode WITHOUT stripping the BOM, so a BOM-prefixed dataPack could fail to parse.

/** Decode bytes as UTF-8, stripping a leading UTF-8 BOM. `limit` optionally caps the decoded prefix. */
export function decodeUtf8(bytes: Uint8Array, limit?: number): string {
  let start = 0
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    start = 3
  }
  const slice =
    limit === undefined
      ? bytes.subarray(start)
      : bytes.subarray(start, start + limit)
  return new TextDecoder("utf-8", { fatal: false }).decode(slice)
}

/** Unwrap a fast-xml-parser node to its text: a bare string, or the `#text` of an attributed node. */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") {
    const node = value as Record<string, unknown>
    if ("#text" in node) return String(node["#text"] ?? "")
    return ""
  }
  return String(value)
}
