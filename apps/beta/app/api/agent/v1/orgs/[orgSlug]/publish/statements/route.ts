/**
 * `POST /api/agent/v1/orgs/[orgSlug]/publish/statements` — publish a rozvaha or
 * a VZZ for one period (spec §3.2).
 *
 * The pipeline, the refusals and the response shape are `lib/agent/route.ts`;
 * the publish semantics are `lib/data/imports.ts`. This file exists to bind a
 * URL to a schema and an operation, and holds no logic of its own on purpose —
 * five endpoints with five hand-written auth sequences is five places for one of
 * them to be subtly different.
 */
import { publishStatementsSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestStatements } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    publishStatementsSchema,
    ingestStatements,
  )
}
