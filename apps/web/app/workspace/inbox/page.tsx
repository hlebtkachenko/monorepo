import { ModulePage } from "../../_components/module-page"

export const metadata = { title: "Inbox" }

/**
 * Inbox — not yet a committed feature. The full mock feed UI (tabs, table,
 * mark-as-read) was moved to `/workspace/demo-inbox` (dev-only) as a saved
 * design reference; this stub keeps the real route + nav entry alive with a
 * plain placeholder until a real notifications/invites data source lands.
 */
export default function WorkspaceInboxPage() {
  return <ModulePage title="Inbox" description="Inbox is coming soon." />
}
