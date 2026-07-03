// Format detection for a single leaf file: magic bytes first, filename extension as the fallback.
// Pure: bytes + filename in, a DetectedFormat out. No I/O. A wrong guess here is cheap — the parser it
// routes to surfaces a warning rather than fabricating — but `pohoda_db` is a deliberate refuse marker.

import type { DetectedFormat } from "./types"
import { decodeUtf8 } from "./text"
import { isPohodaBackupName } from "./pohoda-signature"
import { listZipEntryNames } from "./zip-guard"

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // "PK\x03\x04"
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // "%PDF"

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false
  }
  return true
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".")
  if (dot < 0) return ""
  return filename.slice(dot + 1).toLowerCase()
}

/** Decode a small prefix as UTF-8 (BOM-tolerant) for sniffing the XML root. */
function sniffText(bytes: Uint8Array, limit = 4096): string {
  return decodeUtf8(bytes, limit)
}

/** A zip whose entry list looks like a Pohoda native (Zálohа) DB backup rather than a dataPack export. */
function zipLooksLikePohodaBackup(names: string[]): boolean {
  return names.some(isPohodaBackupName)
}

/** Resolve one leaf to a canonical source format (or `zip` / `unknown`). */
export function detectFormat(
  bytes: Uint8Array,
  filename: string,
): DetectedFormat {
  const ext = extensionOf(filename)

  // A native Pohoda backup is refuse-only. Catch the loose `.mdb` before any content sniff.
  if (ext === "mdb") return "pohoda_db"

  if (startsWith(bytes, ZIP_MAGIC)) {
    const names = listZipEntryNames(bytes)
    if (zipLooksLikePohodaBackup(names)) return "pohoda_db"
    if (names.some((name) => name === "xl/workbook.xml")) return "xlsx"
    if (ext === "xlsx" || ext === "xlsm") return "xlsx"
    return "zip"
  }

  if (startsWith(bytes, PDF_MAGIC)) return "pdf"

  const text = sniffText(bytes)
  const trimmed = text.trimStart()

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
    if (/<(?:\w+:)?dataPack[\s>]/.test(trimmed)) return "pohoda_xml"
    if (/<(?:\w+:)?Invoice[\s>]/.test(trimmed) && /isdoc/i.test(trimmed))
      return "isdoc"
    if (ext === "isdoc") return "isdoc"
    if (ext === "xml") {
      if (/isdoc/i.test(trimmed)) return "isdoc"
      return "pohoda_xml"
    }
  }

  if (ext === "isdoc") return "isdoc"

  // CSV heuristic: needs a delimiter and a newline, and either the extension or a clear tabular shape.
  const hasNewline = /\r?\n/.test(text)
  const hasDelimiter = /[,;\t]/.test(text)
  if (ext === "csv" && hasNewline && hasDelimiter) return "csv"
  if (ext === "csv") return "csv"

  return "unknown"
}
