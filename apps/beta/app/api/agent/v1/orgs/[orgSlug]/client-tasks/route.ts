/**
 * `POST /api/agent/v1/orgs/[orgSlug]/client-tasks` — upsert the office's asks of
 * the client, matched on `externalRef` (spec §3.4, §2.1).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { clientTasksUpsertSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestClientTasks } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    clientTasksUpsertSchema,
    ingestClientTasks,
  )
}
