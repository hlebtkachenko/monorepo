import { AgentsDashboard } from "../../_components/workspace/agents/agents-dashboard"

export const metadata = { title: "Agents" }

/**
 * Agents — the firm-office automation control center for the active workspace.
 * The Dashboard archetype, MOCK data (agent runs, pending approvals, exceptions
 * rolled up across all client books). Thin server page: the dashboard is a
 * client component; no auth / DB reads while the surface is mock-backed.
 */
export default function AgentsPage() {
  return <AgentsDashboard />
}
