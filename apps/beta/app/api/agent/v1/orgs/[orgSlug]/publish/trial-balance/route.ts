/**
 * `POST /api/agent/v1/orgs/[orgSlug]/publish/trial-balance` — publish an
 * obratová předvaha for one period (spec §3.2).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { publishTrialBalanceSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestTrialBalance } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    publishTrialBalanceSchema,
    ingestTrialBalance,
  )
}
