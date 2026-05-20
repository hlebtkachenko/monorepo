import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { assembleCorpus, specPath } from "@/lib/ai/corpus"
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt"
import { consume } from "@/lib/ai/throttle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MODEL = "claude-haiku-4-5-20251001"
const MAX_TOKENS = 1024

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

function ipFrom(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      {
        error: {
          code: "feature_not_enabled",
          message: "Ask AI is not configured.",
        },
      },
      { status: 503 },
    )
  }

  const throttle = consume(ipFrom(req))
  if (!throttle.ok) {
    return new Response(
      JSON.stringify({
        error: {
          code: "rate_limited",
          message: "Too many questions — try again in a moment.",
        },
      }),
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
    return Response.json(
      { error: { code: "bad_request", message: "Expected JSON body." } },
      { status: 400 },
    )
  }
  const question = typeof body.question === "string" ? body.question.trim() : ""
  if (!question || question.length > 1_000) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "`question` is required, 1–1000 chars.",
        },
      },
      { status: 422 },
    )
  }

  const corpus = assembleCorpus(specPath())
  const anthropic = new Anthropic({ apiKey })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) =>
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
      try {
        const events = anthropic.messages.stream({
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
                { type: "text", text: `Question: ${question}` },
              ],
            },
          ],
        })
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
        send(
          JSON.stringify({
            error: (err as Error).message ?? "Upstream model error.",
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
