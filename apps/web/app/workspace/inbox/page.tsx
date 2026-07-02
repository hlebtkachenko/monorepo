import { InboxView } from "../../_components/workspace/inbox/inbox-view"

export const metadata = { title: "Inbox" }

/**
 * Inbox — the workspace-level feed of notifications, invites, and system
 * messages. A thin server page: it renders the shell-integrated `<InboxView />`
 * (a `"use client"` component that portals its title/tabs into the shell header
 * via `AppPageHeader` and shows the feed in a `ContentPanel`). Entirely MOCK —
 * no auth/db reads yet — so there is nothing to resolve server-side.
 */
export default function WorkspaceInboxPage() {
  return <InboxView />
}
