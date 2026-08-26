/**
 * The provider boundary, against a canned SSE body and an injected `fetchImpl`.
 *
 * NOTHING HERE REACHES THE NETWORK AND NOTHING HERE HOLDS A KEY. The first test
 * is the important one: with no key configured, `fetchImpl` is never called at
 * all — the "no live AI-provider key wired" half of the exposure gate is a
 * property of this module, provable offline.
 *
 * The rest cover what a mocked SDK could not: that the wire shape is the
 * documented Messages API request, that usage is reported even for a turn that
 * then failed, and that every HTTP and stream failure lands on a member of the
 * closed `AssistantFailure` union rather than as a thrown error a route would
 * have no way to stream.
 */
import { describe, expect, it, vi } from "vitest"

import { streamAssistantTurn, type AssistantStreamEvent } from "./provider"

const REQUEST = {
  model: "claude-sonnet-5",
  system: "Jsi informační asistent.",
  maxTokens: 1500,
  messages: [{ role: "user" as const, content: "Jak funguje DPH?" }],
}

/** The `[url, init]` of the Nth call, typed — `vi.fn()` infers no arity here. */
function callArgs(
  fetchImpl: { mock: { calls: unknown[] } },
  index = 0,
): [string, RequestInit] {
  return fetchImpl.mock.calls[index] as unknown as [string, RequestInit]
}

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  })
}

async function drain(
  stream: AsyncGenerator<AssistantStreamEvent>,
): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

const HAPPY_STREAM = [
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":412,"output_tokens":1}}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"DPH je "}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"daň z přidané hodnoty."}}\n\n',
  'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":57}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("")

describe("streamAssistantTurn — dark by default", () => {
  it("makes NO request and reports provider_unconfigured without a key", async () => {
    const fetchImpl = vi.fn()

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: null, fetchImpl }),
    )

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(events).toEqual([
      { type: "failure", reason: "provider_unconfigured" },
    ])
  })
})

describe("streamAssistantTurn — the happy path", () => {
  it("yields the text deltas and one final usage report", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(HAPPY_STREAM))

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events).toEqual([
      { type: "text", text: "DPH je " },
      { type: "text", text: "daň z přidané hodnoty." },
      { type: "usage", inputTokens: 412, outputTokens: 57 },
    ])
  })

  it("sends the documented Messages API request", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(HAPPY_STREAM))

    await drain(streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }))

    const [url, init] = callArgs(fetchImpl)
    expect(url).toBe("https://api.anthropic.com/v1/messages")
    expect(init.method).toBe("POST")

    const headers = init.headers as Record<string, string>
    expect(headers["anthropic-version"]).toBe("2023-06-01")
    expect(headers["x-api-key"]).toBe("sk-test")

    expect(JSON.parse(String(init.body))).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: "Jsi informační asistent.",
      stream: true,
      messages: [{ role: "user", content: "Jak funguje DPH?" }],
    })
  })

  it("declares no tools — this assistant reads nothing and calls nothing", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(HAPPY_STREAM))

    await drain(streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }))

    const body = JSON.parse(String(callArgs(fetchImpl)[1].body)) as Record<
      string,
      unknown
    >
    expect(body["tools"]).toBeUndefined()
  })

  it("drops thinking and tool-input deltas rather than rendering them", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse(
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}\n\n' +
          'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"skryté"}}\n\n' +
          'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{"}}\n\n' +
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"viditelné"}}\n\n',
      ),
    )

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events.filter((e) => e.type === "text")).toEqual([
      { type: "text", text: "viditelné" },
    ])
  })
})

describe("streamAssistantTurn — failures", () => {
  it.each([
    [401, "provider_unauthorized"],
    [403, "provider_unauthorized"],
    [429, "provider_rate_limited"],
    [400, "provider_error"],
    [500, "provider_error"],
  ])("maps HTTP %s to %s", async (status, reason) => {
    const fetchImpl = vi.fn(async () => sseResponse("{}", status))

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events).toEqual([{ type: "failure", reason }])
  })

  it("reports provider_unreachable when the request itself throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET")
    })

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events).toEqual([
      { type: "failure", reason: "provider_unreachable" },
    ])
  })

  it("still charges the tokens a failed turn burned", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse(
        'data: {"type":"message_start","message":{"usage":{"input_tokens":300,"output_tokens":0}}}\n\n' +
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Za"}}\n\n' +
          'data: {"type":"message_delta","delta":{"stop_reason":"refusal"},"usage":{"output_tokens":12}}\n\n',
      ),
    )

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events).toEqual([
      { type: "text", text: "Za" },
      { type: "usage", inputTokens: 300, outputTokens: 12 },
      { type: "failure", reason: "provider_refused" },
    ])
  })

  it("stops on an in-band error event", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse(
        'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}\n\n' +
          'data: {"type":"error","error":{"type":"overloaded_error"}}\n\n' +
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"nikdy"}}\n\n',
      ),
    )

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events.some((e) => e.type === "text")).toBe(false)
    expect(events.at(-1)).toEqual({ type: "failure", reason: "provider_error" })
  })

  it("treats an unparseable frame as a framing failure", async () => {
    const fetchImpl = vi.fn(async () => sseResponse("data: not json\n\n"))

    const events = await drain(
      streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }),
    )

    expect(events).toEqual([{ type: "failure", reason: "provider_error" }])
  })

  it("never retries", async () => {
    const fetchImpl = vi.fn(async () => sseResponse("{}", 500))

    await drain(streamAssistantTurn(REQUEST, { apiKey: "sk-test", fetchImpl }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
