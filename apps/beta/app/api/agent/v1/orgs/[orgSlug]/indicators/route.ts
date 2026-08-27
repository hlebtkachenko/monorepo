/**
 * `POST /api/agent/v1/orgs/[orgSlug]/indicators` — state the office-provided
 * figures that are not a line of any statement (spec §2.1 item 4, §3.2), matched
 * on `(kind, asOf)`.
 *
 * Today that is obrat, and it is the ONE figure this product must never compute
 * (§0.2) — which is exactly why it has an endpoint: without it, obrat would be
 * the only data type in beta the office could state by hand but not publish from
 * its own system.
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { indicatorsUpsertSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestIndicators } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    indicatorsUpsertSchema,
    ingestIndicators,
  )
}
