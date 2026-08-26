/**
 * The assistant provider boundary — the ONE place this application talks to an
 * LLM (spec §2.8: "Anthropic API, latest Sonnet default").
 *
 * NOTHING ELSE IN apps/beta MAKES A MODEL CALL, and nothing here knows about
 * organizations, scopes, chats or the database. It takes an already-built
 * system prompt and an already-truncated message list, and yields text deltas
 * and one usage report. That split is what lets the budget layer
 * (`lib/data/assistant.ts`) be tested against a real Postgres with no network,
 * and lets this module be tested against a canned byte stream with no key.
 *
 * DARK BY DEFAULT. `readAssistantApiKey()` returns `null` unless
 * `BETA_ASSISTANT_API_KEY` is set, and no deployment sets it. With no key this
 * function yields exactly one `provider_unconfigured` failure and performs NO
 * network call — the "no live AI-provider key wired" half of the exposure gate
 * is a property of this file, not of a deployment checklist.
 *
 * RAW `fetch`, NOT `@anthropic-ai/sdk`. A deliberate deviation from the house
 * default, for two reasons that both point the same way here. (1) Adding the
 * SDK is a `pnpm-lock.yaml` change, which the repo's PR workflow requires to
 * land as its own isolated PR because it cold-rebuilds all 32 packages — a
 * heavy price for a module that is switched off. (2) The SDK's value is the
 * agentic surface (tool runner, retries, typed helpers); this call site uses
 * none of it, and mocking the SDK in tests would test nothing, whereas an
 * injected `fetchImpl` over a canned SSE body genuinely exercises the frame
 * parser and the usage accounting. The swap to the SDK, if the exposure gate
 * ever wants it, is confined to this one file. The wire shape below (endpoint,
 * `anthropic-version: 2023-06-01`, `x-api-key`, the SSE event names) is the
 * documented Messages API contract.
 *
 * NO RETRIES, EVER. A retried turn is a second billed turn against a budget the
 * preflight has already reserved for one. A failure is surfaced to the client
 * as a Czech message and the client decides whether to ask again.
 */
import "server-only"

import { readAssistantApiKey } from "./config"
import { readSseFrames } from "./sse"

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

/**
 * How long the whole streamed turn may take before it is abandoned. Private:
 * nothing outside this module has a decision to make about it, and a knob
 * exported "just in case" is a knob somebody eventually turns.
 */
const ASSISTANT_TIMEOUT_MS = 120_000

export type AssistantTurnMessage = {
  readonly role: "user" | "assistant"
  readonly content: string
}

export type AssistantRequest = {
  readonly model: string
  readonly system: string
  readonly maxTokens: number
  /** Already truncated to the history window by the caller. */
  readonly messages: readonly AssistantTurnMessage[]
}

/**
 * Every way a turn can fail, as a closed union — the route maps each to a
 * Czech message, so a new failure mode cannot reach a client as an untranslated
 * string or a stack trace.
 */
type AssistantFailure =
  | "provider_unconfigured"
  | "provider_unauthorized"
  | "provider_rate_limited"
  | "provider_refused"
  | "provider_error"
  | "provider_unreachable"

export type AssistantStreamEvent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "usage"
      readonly inputTokens: number
      readonly outputTokens: number
    }
  | { readonly type: "failure"; readonly reason: AssistantFailure }

export type AssistantProviderOptions = {
  /** Injected in tests; production reads the environment. */
  readonly apiKey?: string | null
  readonly fetchImpl?: typeof fetch
  readonly signal?: AbortSignal
}

/**
 * Stream one assistant turn.
 *
 * NEVER THROWS AND NEVER REJECTS. Every failure — no key, a 401, a dropped
 * socket, malformed JSON on the wire — arrives as a single `failure` event and
 * the generator ends. A route handler streaming to a browser has no second
 * channel to report an exception on once the first byte is out, so the error
 * channel has to be in-band from the start.
 *
 * USAGE IS ALWAYS REPORTED WHEN THE API REPORTED IT, including on a turn that
 * ended in `max_tokens` or a refusal: those turns cost real tokens and the
 * ledger must not under-count them. The `usage` event carries the final totals
 * (`message_start`'s input count plus `message_delta`'s cumulative output
 * count) and is yielded before the generator ends.
 */
export async function* streamAssistantTurn(
  request: AssistantRequest,
  options: AssistantProviderOptions = {},
): AsyncGenerator<AssistantStreamEvent> {
  const apiKey =
    options.apiKey === undefined ? readAssistantApiKey() : options.apiKey
  if (!apiKey) {
    yield { type: "failure", reason: "provider_unconfigured" }
    return
  }

  const doFetch = options.fetchImpl ?? fetch
  const timeout = AbortSignal.timeout(ASSISTANT_TIMEOUT_MS)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout

  let response: Response
  try {
    response = await doFetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        stream: true,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    })
  } catch {
    // The error object is deliberately not logged: it can carry the request
    // headers, and one of them is the key.
    yield { type: "failure", reason: "provider_unreachable" }
    return
  }

  if (!response.ok || !response.body) {
    yield { type: "failure", reason: failureForStatus(response.status) }
    return
  }

  let inputTokens = 0
  let outputTokens = 0
  let sawUsage = false
  let failure: AssistantFailure | null = null

  try {
    for await (const frame of readSseFrames(
      response.body as unknown as AsyncIterable<Uint8Array>,
    )) {
      let payload: unknown
      try {
        payload = JSON.parse(frame.data)
      } catch {
        // One unparseable frame is not recoverable state: the stream's own
        // framing is what went wrong, so nothing after it can be trusted.
        failure = "provider_error"
        break
      }

      const event = payload as Record<string, unknown>
      const type = typeof event["type"] === "string" ? event["type"] : ""

      if (type === "error") {
        failure = "provider_error"
        break
      }

      if (type === "message_start") {
        const message = event["message"] as Record<string, unknown> | undefined
        const usage = message?.["usage"] as Record<string, unknown> | undefined
        inputTokens = countOf(usage?.["input_tokens"])
        outputTokens = countOf(usage?.["output_tokens"])
        sawUsage = true
        continue
      }

      if (type === "content_block_delta") {
        const delta = event["delta"] as Record<string, unknown> | undefined
        // `text_delta` only. `thinking_delta` and `input_json_delta` are
        // deliberately dropped rather than rendered: this feature declares no
        // tools, and a thinking trace is not something to show a client.
        if (delta?.["type"] === "text_delta") {
          const text = delta["text"]
          if (typeof text === "string" && text.length > 0) {
            yield { type: "text", text }
          }
        }
        continue
      }

      if (type === "message_delta") {
        const usage = event["usage"] as Record<string, unknown> | undefined
        // Cumulative for the whole turn, not a delta to add.
        if (usage && "output_tokens" in usage) {
          outputTokens = countOf(usage["output_tokens"])
          sawUsage = true
        }
        const delta = event["delta"] as Record<string, unknown> | undefined
        if (delta?.["stop_reason"] === "refusal") failure = "provider_refused"
        continue
      }
    }
  } catch {
    failure = "provider_unreachable"
  }

  // Usage first: a turn that failed after burning tokens must still be charged
  // to the ledger, and the caller stops consuming once it sees a failure.
  if (sawUsage) yield { type: "usage", inputTokens, outputTokens }
  if (failure) yield { type: "failure", reason: failure }
}

function failureForStatus(status: number): AssistantFailure {
  if (status === 401 || status === 403) return "provider_unauthorized"
  if (status === 429) return "provider_rate_limited"
  return "provider_error"
}

/** A non-negative integer, or 0 — never `NaN` into a `bigint` column. */
function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0
}
