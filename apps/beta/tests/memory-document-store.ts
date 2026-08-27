/**
 * An in-memory `BetaDocumentStore` for the suites.
 *
 * Lives under `tests/` rather than `lib/storage/` on purpose: a fake that ships
 * in the app tree is a fake one misconfiguration away from being the real store
 * (see the note on the test seam in `lib/storage/store.ts`).
 *
 * It is not a stub — it enforces the same invariants the S3 implementation does,
 * so a test that passes here is testing the contract rather than the mock: the
 * org-prefix containment check runs on every read and delete, and the body is
 * CONSUMED as a stream, so a body that errors mid-flight (the 25 MiB abort)
 * makes `put` reject exactly as a real multipart upload would.
 *
 * AND IT IS VERSIONED, BECAUSE THE REAL BUCKET IS. This used to be a flat
 * `Map<key, bytes>` where `delete` removed the entry and the object was gone —
 * which is not what S3 does to a versioned bucket, and it is the difference
 * that matters most here. A fake that forgets bytes on `delete` cannot fail the
 * way production fails: a purge implemented as a loop over `delete()` would
 * pass every test against a flat map and leave thirty days of recoverable
 * noncurrent versions in the real bucket.
 *
 * So each key holds a STACK of versions, `delete` pushes a delete marker rather
 * than dropping anything, `get` reads the top of the stack (and 404s when that
 * is a marker), and only `purgeOrganization` removes bytes. `versionCount()`
 * exists so a test can assert the distinction directly.
 */
import type { Readable } from "node:stream"
import { Readable as NodeReadable } from "node:stream"

import {
  assertKeyBelongsTo,
  documentObjectKey,
  organizationPrefix,
  type BetaDocumentStore,
  type PurgeResult,
  type PutDocumentInput,
} from "@/lib/storage/document-store"

type Version =
  | { kind: "object"; bytes: Buffer; contentType: string }
  | { kind: "deleteMarker" }

export type MemoryDocumentStore = BetaDocumentStore & {
  /** Every LIVE key, in insertion order — a deleted key is not live. */
  keys(): string[]
  bytesOf(key: string): Buffer | undefined
  contentTypeOf(key: string): string | undefined
  /** How many objects were removed by a compensating delete. */
  deleteCount(): number
  /**
   * Total stored versions across every key, delete markers included — the
   * number that stays above zero after a `delete` and only reaches zero after a
   * purge. Zero for a key that never existed.
   */
  versionCount(prefix?: string): number
}

export function createMemoryDocumentStore(): MemoryDocumentStore {
  const objects = new Map<string, Version[]>()
  let deletes = 0

  const live = (
    key: string,
  ): Extract<Version, { kind: "object" }> | undefined => {
    const top = objects.get(key)?.at(-1)
    return top?.kind === "object" ? top : undefined
  }

  const push = (key: string, version: Version): void => {
    const stack = objects.get(key)
    if (stack) stack.push(version)
    else objects.set(key, [version])
  }

  return {
    async put(input: PutDocumentInput) {
      const key = documentObjectKey(input.organizationId, input.extension)
      const chunks: Buffer[] = []
      for await (const chunk of input.body) {
        chunks.push(Buffer.from(chunk as Uint8Array))
      }
      push(key, {
        kind: "object",
        bytes: Buffer.concat(chunks),
        contentType: input.contentType,
      })
      return { key }
    },

    async get(key: string, organizationId: string): Promise<Readable> {
      assertKeyBelongsTo(key, organizationId)
      const stored = live(key)
      if (!stored) throw new Error(`no such object: ${key}`)
      return NodeReadable.from([stored.bytes])
    },

    async delete(key: string, organizationId: string): Promise<void> {
      assertKeyBelongsTo(key, organizationId)
      // A delete marker, not a removal — the bytes are still there, exactly as
      // they are in the bucket after the same call.
      if (live(key)) {
        push(key, { kind: "deleteMarker" })
        deletes += 1
      }
    },

    async purgeOrganization(organizationId: string): Promise<PurgeResult> {
      const prefix = organizationPrefix(organizationId)
      let removed = 0
      for (const [key, versions] of [...objects]) {
        if (!key.startsWith(prefix)) continue
        removed += versions.length
        objects.delete(key)
      }
      return { removed }
    },

    keys: () => [...objects.keys()].filter((key) => live(key) !== undefined),
    bytesOf: (key) => live(key)?.bytes,
    contentTypeOf: (key) => live(key)?.contentType,
    deleteCount: () => deletes,
    versionCount: (prefix) =>
      [...objects]
        .filter(([key]) => prefix === undefined || key.startsWith(prefix))
        .reduce((total, [, versions]) => total + versions.length, 0),
  }
}

// ---------------------------------------------------------------------------
// Fixtures: the smallest byte sequences that are genuinely each format
// ---------------------------------------------------------------------------

export const PDF_BYTES = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")

export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(24, 0x11),
])

export const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("JFIF"),
  Buffer.alloc(24, 0x22),
])

/** `ftyp` box, `heic` major brand — what an iPhone writes. */
export const HEIC_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftyp"),
  Buffer.from("heic"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("mif1"),
  Buffer.alloc(24, 0x33),
])

/** `ftyp` box with a VIDEO brand — must be refused. */
export const MP4_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftyp"),
  Buffer.from("mp42"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("isom"),
  Buffer.alloc(24, 0x44),
])

/** ZIP container — the classic "renamed to .pdf" upload. */
export const ZIP_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(28, 0x55),
])
