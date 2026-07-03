// Zip-bomb guard. fflate's `unzipSync(bytes, { filter })` calls the filter for every central-directory
// entry with its uncompressed `originalSize` BEFORE inflating, so we cap decompressed bytes up front:
// reject an over-large single entry, and abort once cumulative decompressed bytes or the entry count
// exceed a cap. Fail-closed — a breach throws `ZipGuardError`, which callers convert to a warning.

import { unzipSync } from "fflate"

/** Per-entry / cumulative / count caps for zip decompression. One place so every unpacker agrees. */
export const MAX_ENTRY_BYTES = 200 * 1024 * 1024 // 200 MB uncompressed per entry
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024 // 500 MB cumulative uncompressed
export const MAX_ENTRIES = 10_000

/** Thrown when a decompression cap is breached. Callers catch → warning (fail-closed). */
export class ZipGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ZipGuardError"
  }
}

/** Decompression caps. Defaults are the module constants; overridable for tests (tiny caps + tiny fixtures). */
export interface ZipCaps {
  maxEntryBytes?: number
  maxTotalBytes?: number
  maxEntries?: number
}

/** Unzip with the decompression caps enforced in the pre-inflate filter. Throws `ZipGuardError` on breach. */
export function safeUnzip(
  bytes: Uint8Array,
  caps: ZipCaps = {},
): Record<string, Uint8Array> {
  const maxEntryBytes = caps.maxEntryBytes ?? MAX_ENTRY_BYTES
  const maxTotalBytes = caps.maxTotalBytes ?? MAX_TOTAL_BYTES
  const maxEntries = caps.maxEntries ?? MAX_ENTRIES
  let total = 0
  let count = 0
  return unzipSync(bytes, {
    filter: (file) => {
      count += 1
      if (count > maxEntries) {
        throw new ZipGuardError(`zip has more than ${maxEntries} entries`)
      }
      if (file.originalSize > maxEntryBytes) {
        throw new ZipGuardError(
          `zip entry "${file.name}" exceeds ${maxEntryBytes} bytes uncompressed`,
        )
      }
      total += file.originalSize
      if (total > maxTotalBytes) {
        throw new ZipGuardError(
          `zip cumulative uncompressed size exceeds ${maxTotalBytes} bytes`,
        )
      }
      return true
    },
  })
}

/**
 * List entry names WITHOUT inflating any payload (the filter returns false for every entry, so no bytes
 * are decompressed). The entry-count cap still applies. Returns [] on a malformed archive.
 */
export function listZipEntryNames(bytes: Uint8Array): string[] {
  const names: string[] = []
  try {
    unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name)
        if (names.length > MAX_ENTRIES) {
          throw new ZipGuardError(`zip has more than ${MAX_ENTRIES} entries`)
        }
        return false
      },
    })
  } catch {
    return names
  }
  return names
}
