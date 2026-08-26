/**
 * `POST /api/agent/v1/orgs/[orgSlug]/account-balance-map` — upsert which účet
 * of the předvaha is a bank account and which is the pokladna (spec §3.2, §2.4),
 * matched on `accountCode`.
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { accountBalanceMapUpsertSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestAccountBalanceMap } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    accountBalanceMapUpsertSchema,
    ingestAccountBalanceMap,
  )
}
