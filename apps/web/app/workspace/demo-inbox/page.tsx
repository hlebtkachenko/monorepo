import { notFound } from "next/navigation"

import { InboxView } from "../../_components/workspace/inbox/inbox-view"

export const metadata = { title: "Inbox demo" }

/**
 * SAVED DEMO — the workspace Inbox feed UI, kept for reference after the
 * product owner decided it isn't a committed feature yet (unlike the
 * sibling Audit/Legislation/Billing mock pages, which stay live in prod).
 * Renders under the persistent shell like any workspace page; `InboxView`
 * portals its own header (title/tabs) via `AppPageHeader`. Reachable at
 * `/workspace/demo-inbox`, hidden from nav (allow-listed in
 * scripts/check-nav.ts).
 *
 * DEV-ONLY: any production build (staging or prod) returns 404, so the mock
 * data never ships to a real environment. Relax the guard if a deployed demo
 * is ever wanted.
 */
export default function WorkspaceInboxDemoPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <InboxView />
}
