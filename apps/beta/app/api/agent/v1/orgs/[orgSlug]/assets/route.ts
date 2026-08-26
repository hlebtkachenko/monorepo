/**
 * `POST /api/agent/v1/orgs/[orgSlug]/assets` — upsert the asset register,
 * matched on `externalRef` (spec §3.2, §2.7).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { assetsUpsertSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestAssets } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(request, context, assetsUpsertSchema, ingestAssets)
}
