/**
 * The upload pipeline: one pass over the request body that decides the type,
 * enforces the size cap and computes the digest — without ever holding the file
 * in memory.
 *
 * WHY STREAMING IS THE SECURITY PROPERTY, NOT AN OPTIMISATION. The obvious
 * implementation is `await request.arrayBuffer()` (or `request.formData()`,
 * which does the same thing behind a parser) and then check `byteLength`. That
 * check happens AFTER the bytes are in the task's heap, so the limit it enforces
 * is "how much memory an authenticated user may make us allocate, per concurrent
 * request". Beta runs ONE Fargate task with 512-1024 MiB; twenty concurrent
 * 25 MiB uploads is an OOM, and `Content-Length` is a claim, not a measurement —
 * a chunked body carries no length at all. So the cap is enforced on the byte
 * counter of the stream itself and the stream is destroyed the moment it is
 * crossed, which is what "25 MiB hard abort (stream-level, not just
 * content-length)" means.
 *
 * WHY THE HEAD IS READ FIRST. The storage key's extension and the object's
 * `Content-Type` both come from the SNIFFED type, so the type has to be known
 * before the S3 upload can start. `scanUpload` therefore pulls just enough bytes
 * to decide (`SNIFF_BYTES`), answers with the type, and hands back a stream that
 * replays those bytes ahead of the rest — the caller sees one continuous body
 * and the file is never buffered beyond 64 bytes.
 *
 * PURE-ISH MODULE: node:crypto and node:stream only, no AWS, no database. The
 * caller supplies any `AsyncIterable<Uint8Array>`, so the whole pipeline is
 * testable without a network or a container.
 */
import { createHash } from "node:crypto"
import { Readable } from "node:stream"

import { sniffDocumentType, SNIFF_BYTES } from "./content-type"
import type { BetaDocumentFileType } from "./content-type"

/** Spec §2.2 / plan Part 4: "25 MiB stream cap". */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export type UploadScanRefusal =
  /** No bytes at all. */
  | "empty_body"
  /** The cap was crossed while reading the head. */
  | "too_large"
  /** The leading bytes are not PDF / PNG / JPEG / HEIC. */
  | "unsupported_type"

type UploadDigest = {
  /** Hex sha256 of everything that was streamed. */
  sha256: string
  byteSize: number
}

export type UploadScan =
  | { ok: false; reason: UploadScanRefusal }
  | {
      ok: true
      type: BetaDocumentFileType
      /**
       * The full body — the sniffed head replayed, then the remainder. Reading
       * it past `MAX_UPLOAD_BYTES` destroys it with `UploadTooLargeError`.
       */
      body: Readable
      /**
       * Resolves with the digest once `body` has been read to its end; rejects
       * with the same error the stream was destroyed with. The caller MUST
       * await this before trusting the stored object: an S3 upload that ends
       * early would otherwise be indistinguishable from one that completed.
       */
      settled: Promise<UploadDigest>
    }

/**
 * Thrown into the body stream when the cap is crossed mid-flight.
 *
 * Module-private on purpose: callers identify it through `isUploadTooLarge`,
 * never `instanceof`. The class travels through an S3 upload's own error
 * wrapping, and a wrapped copy would fail an `instanceof` check silently — a
 * "too large" refusal turning into a 500 is the exact failure mode this
 * predicate exists to avoid.
 */
class UploadTooLargeError extends Error {
  constructor() {
    super(`upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
    this.name = "UploadTooLargeError"
  }
}

/** Depth cap: a cause chain can be cyclic, and this runs on the error path. */
const MAX_CAUSE_DEPTH = 5

/**
 * Is this — or anything it wraps — the size abort?
 *
 * The chain walk is the load-bearing part. The abort is thrown INTO a stream
 * that the S3 upload is consuming, and the upload rejects with whatever its own
 * error handling produces: sometimes the original object, sometimes a wrapper
 * carrying it as `cause`. A bare `instanceof` would answer `false` for the
 * wrapped case, and a 413 "soubor je příliš velký" would silently become a 500.
 * The name comparison (rather than `instanceof`) survives the class being
 * evaluated twice, which a bundler or a duplicated module graph can arrange.
 */
export function isUploadTooLarge(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (current instanceof UploadTooLargeError) return true
    if (
      typeof current === "object" &&
      (current as { name?: unknown }).name === "UploadTooLargeError"
    ) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

function asBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (typeof chunk === "string") return Buffer.from(chunk)
  return Buffer.from(chunk as ArrayBuffer)
}

/** Best-effort early close of a source we have decided to refuse. */
async function abandon(iterator: AsyncIterator<unknown>): Promise<void> {
  try {
    await iterator.return?.()
  } catch {
    // The source is being refused; a failure to close it politely changes
    // nothing about the answer and must not mask it.
  }
}

/**
 * Read the head of `source`, decide the type, and return the rest as a stream
 * that counts, hashes and aborts.
 */
export async function scanUpload(
  source: AsyncIterable<Uint8Array>,
): Promise<UploadScan> {
  const iterator = source[Symbol.asyncIterator]()

  const headChunks: Uint8Array[] = []
  let headBytes = 0
  let sourceDrained = false

  while (headBytes < SNIFF_BYTES) {
    const next = await iterator.next()
    if (next.done === true) {
      sourceDrained = true
      break
    }
    const chunk = asBytes(next.value)
    if (chunk.byteLength === 0) continue
    headChunks.push(chunk)
    headBytes += chunk.byteLength
    // A single hostile chunk can be larger than the whole cap; the head loop
    // must not be the one place that is not checked.
    if (headBytes > MAX_UPLOAD_BYTES) {
      await abandon(iterator)
      return { ok: false, reason: "too_large" }
    }
  }

  if (headBytes === 0) {
    await abandon(iterator)
    return { ok: false, reason: "empty_body" }
  }

  const head = Buffer.concat(headChunks, headBytes)
  const type = sniffDocumentType(head)
  if (!type) {
    await abandon(iterator)
    return { ok: false, reason: "unsupported_type" }
  }

  let resolveDigest: (digest: UploadDigest) => void = () => {}
  let rejectDigest: (error: unknown) => void = () => {}
  const settled = new Promise<UploadDigest>((resolve, reject) => {
    resolveDigest = resolve
    rejectDigest = reject
  })
  // The caller may reject the upload for a reason of its own (a quota refusal
  // arrives before it ever reads `settled`), and an unobserved rejection here
  // would be an unhandled promise rejection that crashes the task. One inert
  // handler removes that hazard without hiding anything: every real awaiter
  // still sees the rejection.
  void settled.catch(() => {})

  const hash = createHash("sha256")
  let total = 0

  async function* replay(): AsyncGenerator<Uint8Array> {
    try {
      hash.update(head)
      total = head.byteLength
      yield head

      if (!sourceDrained) {
        for (;;) {
          const next = await iterator.next()
          if (next.done === true) break
          const chunk = asBytes(next.value)
          if (chunk.byteLength === 0) continue
          total += chunk.byteLength
          if (total > MAX_UPLOAD_BYTES) {
            await abandon(iterator)
            throw new UploadTooLargeError()
          }
          hash.update(chunk)
          yield chunk
        }
      }

      resolveDigest({ sha256: hash.digest("hex"), byteSize: total })
    } catch (error) {
      rejectDigest(error)
      throw error
    }
  }

  return { ok: true, type, body: Readable.from(replay()), settled }
}

/**
 * A `Request` body as an async iterable of bytes.
 *
 * Separated from `scanUpload` so the scanner never has to know about Fetch
 * types — and so a test can drive it with a hand-written generator that yields
 * pathological chunk sizes.
 */
export async function* requestBodyChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      if (value) yield value
    }
  } finally {
    reader.releaseLock()
  }
}
