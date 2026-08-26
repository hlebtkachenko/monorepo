/**
 * `GET /api/agent/v1/meta` — the office agent's handshake.
 *
 * WHAT IT IS FOR, AND WHY IT IS NOT DECORATION. A freshly issued key has to be
 * verifiable BEFORE it is pointed at a month-end close: this is the one call
 * that answers "is this credential live, what is it allowed to reach, and which
 * datasets does this deployment accept" without writing anything. Without it the
 * office agent (PR 25) would have to discover its own scope by attempting a
 * publish, and the operator receiving the key would have no way to check it
 * short of importing real numbers.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN: the key, any part of it, any client
 * data, and any organization the key cannot write to. `agentOrganizations`
 * derives the list from the same membership join the write path runs, so this
 * endpoint cannot advertise reach the write path would refuse — or hide reach it
 * would allow.
 */
import { authenticateAgent } from "@/lib/agent/auth"
import { AGENT_DATASETS } from "@/lib/agent/datasets"
import { agentJson } from "@/lib/agent/http"
import { agentOrganizations } from "@/lib/data/agent-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const organizations = await agentOrganizations(auth.agent)

  return agentJson(200, {
    key: {
      label: auth.agent.label,
      scope: auth.agent.organizationId === null ? "office" : "organization",
    },
    organizations,
    datasets: AGENT_DATASETS,
  })
}
