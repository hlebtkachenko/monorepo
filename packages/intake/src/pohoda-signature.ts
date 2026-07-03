// Shared predicate: does a zip entry name look like a native Pohoda (Zálohа) DB backup rather than a
// dataPack export? A native backup is refuse-only. Used by both detect.ts and zip.ts (was duplicated).

/** True when the entry name looks like a native Pohoda DB backup (`.mdb` / zaloha / pohoda). */
export function isPohodaBackupName(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.endsWith(".mdb") ||
    lower.includes("zaloha") ||
    lower.startsWith("pohoda")
  )
}
