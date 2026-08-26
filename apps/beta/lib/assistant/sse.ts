/**
 * A minimal Server-Sent Events reader, over a byte stream.
 *
 * WHY THIS EXISTS RATHER THAN A DEPENDENCY. The one place beta parses SSE is
 * the assistant provider (`provider.ts`), which reads the Anthropic Messages
 * API's streaming response. A parser is ~40 lines; a dependency is a
 * `pnpm-lock.yaml` change, which per the repo's PR workflow forces a full cold
 * rebuild of every package and has to land as its own PR. More importantly a
 * hand-written parser is the piece of this feature that CAN be tested offline
 * and exhaustively — split frames, `\r\n` line endings, multi-line `data:`,
 * comment lines, a truncated tail — which is exactly what `sse.test.ts` does.
 *
 * SCOPE, DELIBERATELY SMALL. It yields `{ event, data }` per frame and knows
 * nothing about Anthropic. It ignores `id:` and `retry:` (the Messages API
 * sends neither) and it does not reconnect — a dropped stream is an error the
 * caller surfaces, never a silent retry that could bill a second turn.
 *
 * PURE MODULE: no `server-only`, no fetch, no env. Its input is an async
 * iterable of chunks.
 */

export type SseFrame = {
  /** The `event:` field, or `"message"` when the frame omits one (per spec). */
  readonly event: string
  /** The joined `data:` lines, newline-separated, with no trailing newline. */
  readonly data: string
}

/**
 * A cap on how much unterminated text may accumulate before the reader gives
 * up. A peer that never sends a blank line would otherwise grow this buffer
 * without bound — and this reader runs inside a request handler.
 */
const MAX_BUFFER_CHARS = 1_000_000

export async function* readSseFrames(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of body) {
    // `stream: true` keeps a multi-byte character split across two chunks
    // intact — Czech text makes that a certainty, not a corner case.
    buffer += decoder.decode(chunk, { stream: true })
    if (buffer.length > MAX_BUFFER_CHARS) {
      throw new Error("SSE frame exceeded the buffer cap")
    }

    // Frames are separated by a blank line. Normalizing CRLF first means one
    // separator to look for rather than three.
    buffer = buffer.replace(/\r\n/g, "\n")
    let separator = buffer.indexOf("\n\n")
    while (separator !== -1) {
      const frame = parseFrame(buffer.slice(0, separator))
      buffer = buffer.slice(separator + 2)
      if (frame) yield frame
      separator = buffer.indexOf("\n\n")
    }
  }

  // A final frame that arrived without its trailing blank line. Yielded rather
  // than dropped: the last `message_stop` is the one frame whose loss would
  // turn a complete answer into an apparent truncation.
  const tail = parseFrame(buffer.replace(/\r\n/g, "\n"))
  if (tail) yield tail
}

function parseFrame(raw: string): SseFrame | null {
  let event = "message"
  const data: string[] = []

  for (const line of raw.split("\n")) {
    // A line beginning with ":" is a comment (keep-alive). Ignored, per spec.
    if (line === "" || line.startsWith(":")) continue
    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    // Exactly one optional leading space is stripped, per spec — stripping all
    // whitespace would corrupt indented JSON, which the API does not send but a
    // proxy could reformat.
    const rawValue = colon === -1 ? "" : line.slice(colon + 1)
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue

    if (field === "event") event = value
    else if (field === "data") data.push(value)
  }

  if (data.length === 0) return null
  return { event, data: data.join("\n") }
}
