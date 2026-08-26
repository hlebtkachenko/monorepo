/**
 * The SSE frame reader, exercised on the ways a real byte stream arrives:
 * split mid-frame, split mid-character, CRLF line endings, keep-alive comments,
 * multi-line `data:`, and a final frame with no trailing blank line.
 *
 * This is the piece of the assistant that a mocked SDK could never test, and
 * the one whose bugs would show up as a silently truncated Czech answer.
 */
import { describe, expect, it } from "vitest"

import { readSseFrames } from "./sse"

const encoder = new TextEncoder()

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield encoder.encode(part)
}

async function collect(
  body: AsyncIterable<Uint8Array>,
): Promise<{ event: string; data: string }[]> {
  const frames: { event: string; data: string }[] = []
  for await (const frame of readSseFrames(body)) {
    frames.push({ event: frame.event, data: frame.data })
  }
  return frames
}

describe("readSseFrames", () => {
  it("reads a plain event/data pair", async () => {
    const frames = await collect(
      chunks('event: message_start\ndata: {"a":1}\n\n'),
    )

    expect(frames).toEqual([{ event: "message_start", data: '{"a":1}' }])
  })

  it("joins a frame split across chunk boundaries", async () => {
    const frames = await collect(
      chunks("event: content_block_", 'delta\ndata: {"x"', ":2}\n\n"),
    )

    expect(frames).toEqual([{ event: "content_block_delta", data: '{"x":2}' }])
  })

  it("keeps a multi-byte character split across two chunks intact", async () => {
    const bytes = encoder.encode('data: {"t":"Příjmy"}\n\n')
    const split = 14
    const frames = await collect(
      (async function* () {
        yield bytes.slice(0, split)
        yield bytes.slice(split)
      })(),
    )

    expect(frames[0]?.data).toBe('{"t":"Příjmy"}')
  })

  it("normalizes CRLF line endings", async () => {
    const frames = await collect(chunks("event: ping\r\ndata: {}\r\n\r\n"))

    expect(frames).toEqual([{ event: "ping", data: "{}" }])
  })

  it("ignores comment (keep-alive) lines", async () => {
    const frames = await collect(chunks(": keep-alive\n\ndata: {}\n\n"))

    expect(frames).toEqual([{ event: "message", data: "{}" }])
  })

  it("joins multiple data lines with a newline", async () => {
    const frames = await collect(chunks("data: {\ndata: }\n\n"))

    expect(frames).toEqual([{ event: "message", data: "{\n}" }])
  })

  it("defaults the event name to message when the frame omits one", async () => {
    const frames = await collect(chunks("data: bare\n\n"))

    expect(frames[0]?.event).toBe("message")
  })

  it("strips exactly one leading space, not all of them", async () => {
    const frames = await collect(chunks("data:  indented\n\n"))

    expect(frames[0]?.data).toBe(" indented")
  })

  it("yields a final frame that arrived without its trailing blank line", async () => {
    const frames = await collect(chunks('data: {"type":"message_stop"}\n'))

    expect(frames).toEqual([
      { event: "message", data: '{"type":"message_stop"}' },
    ])
  })

  it("emits nothing for a frame with no data field", async () => {
    expect(await collect(chunks("event: ping\n\n"))).toEqual([])
  })

  it("refuses a peer that never terminates a frame", async () => {
    const flood = (async function* () {
      for (let i = 0; i < 12; i += 1) {
        yield encoder.encode("data: " + "x".repeat(100_000))
      }
    })()

    await expect(collect(flood)).rejects.toThrow(/buffer cap/)
  })
})
