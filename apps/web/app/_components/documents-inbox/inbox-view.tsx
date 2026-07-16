"use client"

import * as React from "react"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"

import type { AccountOption, HeldWriteListRow } from "../inbox-resolve/columns"
import { HeldWritesBody } from "../inbox-resolve/resolve-body"
import type { InboxListRow } from "./columns"
import { DocumentsInboxBody } from "./documents-inbox-body"

type InboxViewKey = "review" | "all"

/**
 * Records Inbox — ONE surface, two views over the org's gated `tool_call_log`
 * writes:
 *
 *  - "Ke schválení" (default): the HELD-write RESOLVE queue. Approve / reject /
 *    edit-before-approve run through `resolveHeldWrite` — the constitution-I7
 *    human gate, the ONLY path any agent proposal lands. This is the primary
 *    view; the fold moved it here verbatim from the old standalone approvals page.
 *  - "Vše": the read-only ingestion feed across every outcome (auto-applied /
 *    held / approved / rejected).
 *
 * The tab strip lives in the shared content-panel header. Because
 * `AppPageHeader` portals its node into the shell header slot while keeping it
 * in THIS component's React tree, the header tabs and the body below share one
 * `useState` with no cross-slot plumbing — only the active body is mounted, so
 * whichever `ContentPanel` renders still fills the content region exactly as a
 * single-body page does.
 */
export function InboxView({
  orgSlug,
  heldRows,
  feedRows,
  accounts,
}: {
  orgSlug: string
  heldRows: HeldWriteListRow[]
  feedRows: InboxListRow[]
  /** Chart-of-accounts options for the resolve queue's edit-before-approve account picker. */
  accounts: AccountOption[]
}) {
  const [view, setView] = React.useState<InboxViewKey>("review")

  const tabs: ViewTab[] = [
    { value: "review", label: "Ke schválení", count: heldRows.length },
    { value: "all", label: "Vše", count: feedRows.length },
  ]

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="Inbox"
          viewTabs={tabs}
          value={view}
          onValueChange={(value) => setView(value as InboxViewKey)}
        />
      </AppPageHeader>
      {view === "review" ? (
        <HeldWritesBody rows={heldRows} orgSlug={orgSlug} accounts={accounts} />
      ) : (
        <DocumentsInboxBody rows={feedRows} />
      )}
    </>
  )
}
