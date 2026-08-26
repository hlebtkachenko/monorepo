/**
 * An in-memory `BetaDocumentStore` for the suites.
 *
 * Lives under `tests/` rather than `lib/storage/` on purpose: a fake that ships
 * in the app tree is a fake one misconfiguration away from being the real store
 * (see the note on the test seam in `lib/storage/store.ts`).
 *
 * It is not a stub — it enforces the same two invariants the S3 implementation
 * does, so a test that passes here is testing the contract rather than the
 * mock: the org-prefix containment check runs on every read and delete, and the
 * body is CONSUMED as a stream, so a body that errors mid-flight (the 25 MiB
 * abort) makes `put` reject exactly as a real multipart upload would.
 */
import type { Readable } from "node:stream"
import { Readable as NodeReadable } from "node:stream"

import {
  assertKeyBelongsTo,
  documentObjectKey,
  type BetaDocumentStore,
  type PutDocumentInput,
} from "@/lib/storage/document-store"

export type MemoryDocumentStore = BetaDocumentStore & {
  /** Every key currently held, in insertion order. */
  keys(): string[]
  bytesOf(key: string): Buffer | undefined
  contentTypeOf(key: string): string | undefined
  /** How many objects were removed by a compensating delete. */
  deleteCount(): number
}

export function createMemoryDocumentStore(): MemoryDocumentStore {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>()
  let deletes = 0

  return {
    async put(input: PutDocumentInput) {
      const key = documentObjectKey(input.organizationId, input.extension)
      const chunks: Buffer[] = []
      for await (const chunk of input.body) {
        chunks.push(Buffer.from(chunk as Uint8Array))
      }
      objects.set(key, {
        bytes: Buffer.concat(chunks),
        contentType: input.contentType,
      })
      return { key }
    },

    async get(key: string, organizationId: string): Promise<Readable> {
      assertKeyBelongsTo(key, organizationId)
      const stored = objects.get(key)
      if (!stored) throw new Error(`no such object: ${key}`)
      return NodeReadable.from([stored.bytes])
    },

    async delete(key: string, organizationId: string): Promise<void> {
      assertKeyBelongsTo(key, organizationId)
      if (objects.delete(key)) deletes += 1
    },

    keys: () => [...objects.keys()],
    bytesOf: (key) => objects.get(key)?.bytes,
    contentTypeOf: (key) => objects.get(key)?.contentType,
    deleteCount: () => deletes,
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
