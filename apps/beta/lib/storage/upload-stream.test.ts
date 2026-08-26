/**
 * The streaming pipeline: the 25 MiB abort, the digest, and the head replay.
 *
 * The abort test is the load-bearing one. It asserts the property that matters
 * — the source is not drained past the cap — rather than just "an error was
 * thrown", because an implementation that reads the whole 30 MiB and then
 * complains would pass the weaker assertion while being exactly the memory DoS
 * the design exists to prevent.
 */
import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  isUploadTooLarge,
  MAX_UPLOAD_BYTES,
  requestBodyChunks,
  scanUpload,
} from "./upload-stream"
import {
  JPEG_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  ZIP_BYTES,
} from "../../tests/memory-document-store"

async function* chunks(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield part
}

async function drain(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const chunk of stream) parts.push(Buffer.from(chunk))
  return Buffer.concat(parts)
}

describe("scanUpload — happy path", () => {
  it("identifies the type and replays every byte in order", async () => {
    const tail = Buffer.alloc(4096, 0x7a)
    const scan = await scanUpload(chunks(PDF_BYTES, tail))
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)

    expect(scan.type.contentType).toBe("application/pdf")
    const body = await drain(scan.body)
    expect(body).toEqual(Buffer.concat([PDF_BYTES, tail]))

    const digest = await scan.settled
    expect(digest.byteSize).toBe(PDF_BYTES.length + tail.length)
    expect(digest.sha256).toBe(createHash("sha256").update(body).digest("hex"))
  })

  it("handles a source that yields one byte at a time", async () => {
    const whole = Buffer.concat([PNG_BYTES, Buffer.from("tail")])
    const scan = await scanUpload(
      chunks(...[...whole].map((byte) => Uint8Array.of(byte))),
    )
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)

    expect(scan.type.contentType).toBe("image/png")
    expect(await drain(scan.body)).toEqual(whole)
    expect((await scan.settled).byteSize).toBe(whole.length)
  })

  it("handles a file shorter than the sniff window", async () => {
    const scan = await scanUpload(chunks(JPEG_BYTES))
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)
    expect(await drain(scan.body)).toEqual(JPEG_BYTES)
    expect((await scan.settled).byteSize).toBe(JPEG_BYTES.length)
  })

  it("ignores empty chunks without treating them as end-of-stream", async () => {
    const scan = await scanUpload(
      chunks(new Uint8Array(0), PDF_BYTES, new Uint8Array(0), Buffer.from("x")),
    )
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)
    expect((await drain(scan.body)).length).toBe(PDF_BYTES.length + 1)
  })
})

describe("scanUpload — refusals before a byte is stored", () => {
  it("refuses an empty body", async () => {
    const scan = await scanUpload(chunks())
    expect(scan).toEqual({ ok: false, reason: "empty_body" })
  })

  it("refuses a body of nothing but empty chunks", async () => {
    const scan = await scanUpload(chunks(new Uint8Array(0), new Uint8Array(0)))
    expect(scan).toEqual({ ok: false, reason: "empty_body" })
  })

  it("refuses bytes outside the allowlist", async () => {
    const scan = await scanUpload(chunks(ZIP_BYTES))
    expect(scan).toEqual({ ok: false, reason: "unsupported_type" })
  })

  it("refuses a single chunk that already exceeds the cap", async () => {
    const scan = await scanUpload(chunks(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1)))
    expect(scan).toEqual({ ok: false, reason: "too_large" })
  })
})

describe("scanUpload — the 25 MiB abort", () => {
  it("destroys the body and stops pulling from the source", async () => {
    const CHUNK = 1024 * 1024
    let produced = 0

    async function* endless(): AsyncGenerator<Uint8Array> {
      yield PDF_BYTES
      produced += PDF_BYTES.length
      for (;;) {
        yield Buffer.alloc(CHUNK, 0x41)
        produced += CHUNK
      }
    }

    const scan = await scanUpload(endless())
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)

    await expect(drain(scan.body)).rejects.toSatisfy(isUploadTooLarge)
    await expect(scan.settled).rejects.toSatisfy(isUploadTooLarge)

    // The whole point: the source was abandoned within one chunk of the cap,
    // not drained. An implementation that buffered first would sit far above.
    expect(produced).toBeLessThanOrEqual(MAX_UPLOAD_BYTES + CHUNK)
  })

  it("accepts a file of exactly the cap", async () => {
    const filler = Buffer.alloc(MAX_UPLOAD_BYTES - PDF_BYTES.length, 0x20)
    const scan = await scanUpload(chunks(PDF_BYTES, filler))
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)

    await drain(scan.body)
    expect((await scan.settled).byteSize).toBe(MAX_UPLOAD_BYTES)
  })

  it("refuses a file one byte over the cap", async () => {
    // Chunked the way a real request body arrives, so the cap is crossed in the
    // body stream rather than while the head is being read.
    const over = MAX_UPLOAD_BYTES - PDF_BYTES.length + 1
    const piece = 1024 * 1024
    const parts = [PDF_BYTES]
    for (let sent = 0; sent < over; sent += piece) {
      parts.push(Buffer.alloc(Math.min(piece, over - sent), 0x20))
    }

    const scan = await scanUpload(chunks(...parts))
    if (!scan.ok) throw new Error(`unexpected refusal: ${scan.reason}`)

    await expect(drain(scan.body)).rejects.toSatisfy(isUploadTooLarge)
    await expect(scan.settled).rejects.toSatisfy(isUploadTooLarge)
  })

  it("refuses before sniffing when the very first chunks blow the cap", async () => {
    // Same file, delivered as one enormous chunk. The head loop is the only
    // code that has seen it, and it must refuse rather than concatenate.
    const scan = await scanUpload(
      chunks(PDF_BYTES, Buffer.alloc(MAX_UPLOAD_BYTES, 0x20)),
    )
    expect(scan).toEqual({ ok: false, reason: "too_large" })
  })
})

describe("isUploadTooLarge", () => {
  it("sees through a wrapper — an S3 upload rejects with its own error", async () => {
    const scan = await scanUpload(
      chunks(PDF_BYTES, Buffer.alloc(MAX_UPLOAD_BYTES, 0x20)),
    )
    // Take a genuine instance from the body path, then wrap it the way a
    // consumer of the stream would.
    const genuine = await (async () => {
      const inner = await scanUpload(
        chunks(
          PDF_BYTES,
          ...Array.from({ length: 26 }, () => Buffer.alloc(1024 * 1024, 1)),
        ),
      )
      if (!inner.ok) throw new Error("setup refusal")
      try {
        await drain(inner.body)
        throw new Error("expected an abort")
      } catch (error) {
        return error
      }
    })()

    expect(scan).toEqual({ ok: false, reason: "too_large" })
    expect(isUploadTooLarge(genuine)).toBe(true)
    expect(
      isUploadTooLarge(new Error("upload failed", { cause: genuine })),
    ).toBe(true)
    expect(
      isUploadTooLarge(
        new Error("outer", { cause: new Error("inner", { cause: genuine }) }),
      ),
    ).toBe(true)
  })

  it("does not fire on an unrelated failure", () => {
    expect(isUploadTooLarge(new Error("network"))).toBe(false)
    expect(isUploadTooLarge(null)).toBe(false)
    expect(isUploadTooLarge("too large")).toBe(false)
  })

  it("terminates on a cyclic cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown }
    a.cause = a
    expect(isUploadTooLarge(a)).toBe(false)
  })
})

describe("requestBodyChunks", () => {
  it("reads a Fetch body to its end", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PDF_BYTES)
        controller.enqueue(Buffer.from("tail"))
        controller.close()
      },
    })

    expect(await drain(requestBodyChunks(stream))).toEqual(
      Buffer.concat([PDF_BYTES, Buffer.from("tail")]),
    )
  })
})
