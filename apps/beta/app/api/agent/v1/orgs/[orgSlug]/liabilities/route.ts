/**
 * `POST /api/agent/v1/orgs/[orgSlug]/liabilities` — upsert the manual liability
 * residue, matched on `externalRef` (spec §3.2, §2.4).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { liabilitiesUpsertSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestLiabilities } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    liabilitiesUpsertSchema,
    ingestLiabilities,
  )
}
