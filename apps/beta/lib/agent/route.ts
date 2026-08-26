import "server-only"

import type { z } from "zod"

import type { IngestContext, IngestOutcome } from "@/lib/data/agent-ingest"
import { resolveAgentOwnerScope } from "@/lib/data/scope"

import { authenticateAgent, readAgentBody, requestId } from "./auth"
import { agentError, agentJson } from "./http"

/**
 * The one pipeline every `/api/agent/v1/orgs/{orgSlug}/*` write runs.
 *
 * FIVE STEPS, ALWAYS IN THIS ORDER, AND NEVER RE-IMPLEMENTED PER ROUTE:
 *
 *   1. authenticate the key (rate limits, uniform 401)
 *   2. resolve the ORGANIZATION FROM THE URL against the key's scope
 *   3. read + validate the body (media type, size, tenancy keys, schema)
 *   4. run the ingest inside one transaction with its activity_log row
 *   5. map the outcome to a status code
 *
 * Steps 2 and 3 are in that order deliberately: a caller who may not touch this
 * book learns nothing about the schema, and a 404 costs no parsing.
 *
 * THE 404 IN STEP 2 IS THE SAME 404 A BROWSER GETS. An org-scoped key naming
 * another book, an office-global key naming a book its accountant is not the
 * účetní of, an archived book, and a slug that does not exist are one answer —
 * the URL space of an accounting office's client list is not something a
 * credential gets to enumerate.
 *
 * NO COOKIE IS EVER READ HERE. These handlers authenticate on `Authorization`
 * alone, so a browser session — office or client — reaches nothing through them
 * and there is no cross-site write to guard against: a forged form post from
 * another origin carries cookies, not bearer tokens, and fails step 1.
 */
export type AgentRouteContext = { params: Promise<{ orgSlug: string }> }

export async function handleAgentIngest<T>(
  request: Request,
  context: AgentRouteContext,
  schema: z.ZodType<T>,
  run: (ctx: IngestContext, input: T) => Promise<IngestOutcome>,
): Promise<Response> {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const { orgSlug } = await context.params
  const owner = await resolveAgentOwnerScope(auth.agent, orgSlug)
  if (!owner) return agentError(404, "not_found")

  const body = await readAgentBody(request, schema)
  if (!body.ok) return body.response

  const outcome = await run(
    { owner, agent: auth.agent, requestId: requestId(request) },
    body.value,
  )

  if (outcome.status === "refused") {
    // 409 for both: each says "your request is well-formed and the current state
    // will not accept it", which is the caller's cue to re-read and retry rather
    // than to change the payload's shape.
    return agentError(409, outcome.reason)
  }

  return agentJson(200, {
    status: outcome.status,
    organization: owner.organizationSlug,
    summary: outcome.summary,
  })
}
