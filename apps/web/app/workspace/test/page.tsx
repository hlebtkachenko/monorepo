import { AppHeader } from "@workspace/ui/blocks/app-header"
import { AppShell } from "@workspace/ui/blocks/app-shell"

import { AppRailNav } from "../../_components/app-rail-nav"
import { workspaceTestNav } from "./nav"

export const metadata = {
  title: "Rail test",
}

/**
 * Scratch page proving the AppShell + AppRail layout is reusable from a
 * plain per-surface menu config (`workspaceTestNav`) — no edits to the
 * block itself.
 */
export default function WorkspaceTestPage() {
  return (
    <AppShell
      header={<AppHeader />}
      rail={<AppRailNav items={workspaceTestNav} />}
      sidebar={<div className="size-full" />}
      assistant={<div className="size-full" />}
      logoHref="/workspace/test"
    >
      <div className="size-full" />
    </AppShell>
  )
}
