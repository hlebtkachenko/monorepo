"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { WorkspaceSwitcher } from "@workspace/ui/blocks/app-header"
import type {
  WorkspaceSwitcherCurrentWorkspace,
  WorkspaceSwitcherWorkspace,
} from "@workspace/ui/blocks/app-header"
import { toast } from "@workspace/ui/components/sonner"

import { switchWorkspaceAction } from "../workspace/_lib/switch-workspace-action"

/**
 * Workspace-switcher surface wrapper — feeds the presentational
 * `WorkspaceSwitcher` (packages/ui) its data, same pattern as `OrgSwitcherClient`
 * / `WorkspaceSidebar`. Values are resolved server-side in `workspace/layout.tsx`
 * via `getWorkspaceContext` and passed in as plain props.
 *
 * Switching is a real cookie flip: `switchWorkspaceAction` validates membership,
 * mints the `wks` active-workspace cookie, and revalidates the workspace layout;
 * `router.refresh()` then re-renders the shell against the new active workspace.
 */
export function WorkspaceSwitcherClient({
  currentWorkspace,
  otherWorkspaces,
}: {
  currentWorkspace: WorkspaceSwitcherCurrentWorkspace
  otherWorkspaces: WorkspaceSwitcherWorkspace[]
}) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()

  return (
    <WorkspaceSwitcher
      currentWorkspace={currentWorkspace}
      otherWorkspaces={otherWorkspaces}
      settingsHref="/workspace/settings"
      createWorkspaceHref="/onboarding"
      onSelectWorkspace={(workspaceId) =>
        startTransition(async () => {
          try {
            await switchWorkspaceAction(workspaceId)
            router.refresh()
          } catch {
            toast.error("Could not switch workspace")
          }
        })
      }
    />
  )
}
