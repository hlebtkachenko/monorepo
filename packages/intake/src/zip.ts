// ZIP unpack → leaf files. Pure: bytes in, in-memory entries out via fflate.unzipSync. Directory entries
// (trailing "/" or zero bytes) are skipped. Nested zips are NOT recursed here — a nested entry is surfaced
// as `format:"zip"` for the caller to re-unpack. A native Pohoda backup marks its leaves `pohoda_db`.

import type { DetectedFormat, LeafFile } from "./types"
import { isPohodaBackupName } from "./pohoda-signature"
import { safeUnzip } from "./zip-guard"

export interface ZipEntry {
  path: string
  bytes: Uint8Array
}

/** Unpack a zip into its file entries. Directory entries are dropped. Decompression is capped (fail-closed). */
export function unpackZip(bytes: Uint8Array): ZipEntry[] {
  const unzipped = safeUnzip(bytes)
  const entries: ZipEntry[] = []
  for (const path of Object.keys(unzipped)) {
    if (path.endsWith("/")) continue
    const content = unzipped[path]
    if (!content || content.length === 0) continue
    entries.push({ path, bytes: content })
  }
  return entries
}

function looksLikePohodaBackup(entries: ZipEntry[]): boolean {
  return entries.some((entry) => isPohodaBackupName(entry.path))
}

/**
 * Turn unpacked zip entries into detected leaves. `detect` is injected (the caller passes `detectFormat`)
 * to keep this composable and test-isolatable. If the archive is a native Pohoda backup, every leaf is
 * forced to `pohoda_db` (the refuse marker) regardless of per-entry detection.
 */
export function toLeaves(
  entries: ZipEntry[],
  detect: (bytes: Uint8Array, filename: string) => DetectedFormat,
): LeafFile[] {
  const isPohodaBackup = looksLikePohodaBackup(entries)
  return entries.map((entry) => ({
    path: entry.path,
    bytes: entry.bytes,
    format: isPohodaBackup ? "pohoda_db" : detect(entry.bytes, entry.path),
  }))
}
