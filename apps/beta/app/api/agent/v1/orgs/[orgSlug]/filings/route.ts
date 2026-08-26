/**
 * `POST /api/agent/v1/orgs/[orgSlug]/filings` — upsert filings, matched on the
 * source system's `externalRef` (spec §3.2).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { filingsUpsertSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestFilings } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(request, context, filingsUpsertSchema, ingestFilings)
}
