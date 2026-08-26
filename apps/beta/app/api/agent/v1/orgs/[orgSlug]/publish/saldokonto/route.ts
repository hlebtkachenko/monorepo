/**
 * `POST /api/agent/v1/orgs/[orgSlug]/publish/saldokonto` — publish one period's
 * per-partner receivables and payables, upserting the partners it names (spec
 * §3.2).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { publishSaldokontoSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestSaldokonto } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    publishSaldokontoSchema,
    ingestSaldokonto,
  )
}
