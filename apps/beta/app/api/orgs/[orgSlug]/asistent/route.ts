/**
 * `POST /api/orgs/[orgSlug]/asistent` — send one message and stream the reply
 * (spec §2.8).
 *
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION. A Server Action returns once,
 * with a value; this endpoint has to emit tokens as they arrive, which needs
 * ownership of the response stream. Same reasoning as the document upload
 * route, from the other direction.
 *
 * NDJSON, NOT SSE, ON THE WAY OUT. The only consumer is our own client
 * component reading the body with a `TextDecoder`, so a line-delimited JSON
 * frame is one `JSON.parse` per line and needs no second SSE implementation in
 * the browser. (The INBOUND stream from the provider is SSE because that is
 * what the Messages API speaks — `lib/assistant/sse.ts`.)
 *
 * ERRORS TRAVEL AS CODES, NEVER AS CZECH TEXT. Every refusal is
 * `{"type":"error","code":"..."}`, and the component maps the code to a
 * `messages/cs.json` string. A server that formatted the Czech itself would put
 * UI copy in a route handler and make the same sentence exist twice.
 *
 * THE SHAPE OF EVERY REFUSAL. 404 for "no such organization, for you" AND for
 * "Asistent is not available to you" — `assistantVisibleTo` covers both the
 * env gate and the guest/employee-seat exclusion of spec §5, and both answer
 * the same 404 so neither the module's existence nor the state of the exposure
 * flag is probeable. 403 only for a cross-site write. 400/413 for a body this
 * endpoint will not accept. 429 for a budget refusal — the caller is a member
 * who may use the feature and has run out, which is a fact they are entitled
 * to and which the UI has to distinguish.
 */
import { NextResponse } from "next/server"

import { tenancyKeysIn } from "@/lib/agent/schemas"
import { readAssistantConfig } from "@/lib/assistant/config"
import { streamAssistantTurn } from "@/lib/assistant/provider"
import { buildAssistantSystemPrompt } from "@/lib/assistant/system-prompt.cs"
import {
  appendChatMessage,
  assistantOrgFacts,
  assistantVisibleTo,
  chatHistoryForTurn,
  chatOwnedByScope,
  recordAssistantUsage,
  reserveAssistantTurn,
} from "@/lib/data/assistant"
import { resolveOrgScope } from "@/lib/data/scope"
import { isCrossSiteWrite } from "@/lib/http/same-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ orgSlug: string }> }

const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
} as const

function json(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  if (isCrossSiteWrite(request.headers)) {
    return json(403, { error: "cross_site" })
  }

  const { orgSlug } = await context.params
  const scope = await resolveOrgScope(orgSlug)
  if (!scope) return json(404, { error: "not_found" })
  if (!assistantVisibleTo(scope)) return json(404, { error: "not_found" })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: "invalid_body" })
  }

  // The repo-wide rule that an AI-facing payload never names a tenant, applied
  // here as a check rather than as a convention. This body has no legitimate
  // reason to carry `organizationId` / `userId` / `role` in any spelling, and a
  // body that does is a caller trying to address something the URL and the
  // session already decided.
  if (tenancyKeysIn(body).length > 0) {
    return json(400, { error: "tenancy_keys_forbidden" })
  }

  const payload = body as Record<string, unknown>
  const chatId = payload["chatId"]
  const message = payload["message"]
  if (typeof chatId !== "string" || typeof message !== "string") {
    return json(400, { error: "invalid_body" })
  }

  const config = readAssistantConfig()
  const text = message.trim()
  if (text === "") return json(400, { error: "empty_message" })
  if (text.length > config.maxInputChars) {
    return json(413, { error: "message_too_long" })
  }

  // Ownership BEFORE the reservation: an unknown or foreign chat must not cost
  // the caller a slot out of their daily allowance.
  if (!(await chatOwnedByScope(scope, chatId))) {
    return json(404, { error: "not_found" })
  }

  const reservation = await reserveAssistantTurn(scope, config)
  if (!reservation.ok) {
    return json(429, { error: reservation.reason })
  }

  // The client's own words are stored BEFORE the provider is called, so a turn
  // that fails mid-stream still leaves a transcript showing what was asked.
  if (
    !(await appendChatMessage(scope, chatId, { role: "user", content: text }))
  ) {
    return json(404, { error: "not_found" })
  }

  const [facts, history] = await Promise.all([
    assistantOrgFacts(scope),
    chatHistoryForTurn(scope, chatId, config.historyMessages),
  ])

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: unknown): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`))
      }

      let answer = ""
      try {
        for await (const event of streamAssistantTurn(
          {
            model: config.model,
            system: buildAssistantSystemPrompt(facts),
            maxTokens: config.maxTokens,
            messages: history,
          },
          { signal: request.signal },
        )) {
          if (event.type === "text") {
            answer += event.text
            send({ type: "delta", text: event.text })
          } else if (event.type === "usage") {
            // Charged even when the turn then fails: those tokens were spent.
            await recordAssistantUsage(scope, {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
            })
          } else {
            send({ type: "error", code: event.reason })
          }
        }

        // A partial answer is still an answer the client read, so it is stored.
        // An empty one is not a message.
        if (answer.trim() !== "") {
          await appendChatMessage(scope, chatId, {
            role: "assistant",
            content: answer,
          })
        }
        send({ type: "done" })
      } catch {
        // `streamAssistantTurn` does not throw; this catches a failure in our
        // OWN persistence. The client is told, rather than left on a stream
        // that simply stops.
        send({ type: "error", code: "provider_error" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      ...NO_STORE,
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  })
}
