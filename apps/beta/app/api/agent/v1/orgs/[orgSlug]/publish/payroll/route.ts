/**
 * `POST /api/agent/v1/orgs/[orgSlug]/publish/payroll` — publish one period's
 * payroll: the employee register, the totals and the per-employee lines
 * (spec §3.2, §2.6).
 *
 * See `publish/statements/route.ts` for why these files carry no logic.
 */
import { publishPayrollSchema } from "@/lib/agent/schemas"
import { handleAgentIngest, type AgentRouteContext } from "@/lib/agent/route"
import { ingestPayroll } from "@/lib/data/agent-ingest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: AgentRouteContext,
): Promise<Response> {
  return handleAgentIngest(
    request,
    context,
    publishPayrollSchema,
    ingestPayroll,
  )
}
