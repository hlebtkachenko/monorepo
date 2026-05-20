import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import type { ApiErrorCode } from "@workspace/shared/errors"
import { getCorpus, specPath } from "@/lib/ai/corpus"
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt"
import { consume } from "@/lib/ai/throttle"

function errorBody(code: ApiErrorCode, message: string) {
  return { error: { code, message } }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MODEL = "claude-haiku-4-5-20251001"
const MAX_TOKENS = 1024

// Module-level SDK instance. The Anthropic client holds an HTTP agent +
// retry state — allocating one per request burns sockets and skips the
// connection-reuse the SDK is designed for. Lazy-init so the build phase
// doesn't fail when ANTHROPIC_API_KEY is absent.
let anthropicSingleton: Anthropic | null = null
function getAnthropic(apiKey: string): Anthropic {
  if (!anthropicSingleton) anthropicSingleton = new Anthropic({ apiKey })
  return anthropicSingleton
}

/**
 * POST /api/ask — Ask AI streaming chat.
 *
 * Body: { question: string }
 * Response: text/event-stream of token chunks (`data: <delta>\n\n`),
 *   followed by `data: [DONE]\n\n`.
 *
 * Grounding: the assembled corpus (live OpenAPI v1 spec + narrative
 * summaries) is sent as a `cache_control: { type: "ephemeral" }` block in
 * the user turn. Anthropic caches the prefix; subsequent questions in the
 * same minute pay near-zero input cost.
 *
 * Cost cap: enforced server-side on the Anthropic Console key
 * (`monorepo-{env}-anthropic-key`, $10/mo cap). This route adds a
 * per-IP token bucket (30 burst, refill 1 / 6 s) so a single client can't
 * drain the budget.
 */

interface AskBody {
  question?: unknown
}

function ipFrom(req: Request): string | null {
  // Behind Cloudflare Tunnel, `cf-connecting-ip` is the only authoritative
  // client IP. `x-forwarded-for` is set by every hop and is trivially
  // spoofable from inside the VPC. If neither header is set, we refuse the
  // request rather than falling back to a literal placeholder (which would
  // give every anonymous caller a shared bucket — trivial to drain).
  const cf = req.headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf
  // Local dev / playwright: every caller comes from loopback. Treat as a
  // single development bucket; nothing here ever reaches an Anthropic key.
  const host = req.headers.get("host") ?? ""
  if (host.startsWith("127.0.0.1") || host.startsWith("localhost")) {
    return "dev"
  }
  return null
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      errorBody("feature_not_enabled", "Ask AI is not configured."),
      { status: 503 },
    )
  }

  const clientIp = ipFrom(req)
  if (!clientIp) {
    return Response.json(
      errorBody(
        "bad_request",
        "Missing `cf-connecting-ip`: request must come through Cloudflare Tunnel.",
      ),
      { status: 400 },
    )
  }
  const throttle = consume(clientIp)
  if (!throttle.ok) {
    return new Response(
      JSON.stringify(
        errorBody("rate_limited", "Too many questions. Try again in a moment."),
      ),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(throttle.retryAfterMs / 1000)),
        },
      },
    )
  }

  let body: AskBody
  try {
    body = (await req.json()) as AskBody
  } catch {
    return Response.json(errorBody("bad_request", "Expected JSON body."), {
      status: 400,
    })
  }
  const question = typeof body.question === "string" ? body.question.trim() : ""
  if (!question || question.length > 1_000) {
    return Response.json(
      errorBody("validation_error", "`question` is required, 1-1000 chars."),
      { status: 422 },
    )
  }

  const corpus = getCorpus(specPath())
  const anthropic = getAnthropic(apiKey)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) =>
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
      try {
        // Propagate the request's AbortSignal into the SDK. When the
        // client closes the tab mid-stream, the upstream Anthropic call
        // cancels — otherwise the model keeps generating up to
        // `max_tokens` and the cost cap eats the bill for tokens the
        // user never sees.
        const events = anthropic.messages.stream(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `CORPUS:\n${corpus}`,
                    cache_control: { type: "ephemeral" },
                  },
                  // User input is wrapped in explicit delimiters so the
                  // model treats it as data, never instructions. The
                  // system prompt closes the prompt-injection hole; the
                  // wrap makes the rule cheap to enforce.
                  {
                    type: "text",
                    text: `<user_question>${question}</user_question>`,
                  },
                ],
              },
            ],
          },
          { signal: req.signal },
        )
        for await (const event of events) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send(JSON.stringify({ text: event.delta.text }))
          }
        }
        send("[DONE]")
      } catch (err) {
        // Never leak the upstream SDK error to the client — it can carry
        // request IDs, model identifiers, and (on retried-with-key paths)
        // partial credentials. Log the real error server-side; ship a
        // generic shape to the browser.
        console.error("[ask-ai] upstream error", err)
        send(
          JSON.stringify({
            error: "Upstream model error. Try again in a moment.",
          }),
        )
        send("[DONE]")
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-ratelimit-remaining": String(throttle.remaining),
    },
  })
}
