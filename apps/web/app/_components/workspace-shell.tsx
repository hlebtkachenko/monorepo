"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Logo } from "@workspace/ui/brand-assets"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import { activeRailEntry } from "@workspace/ui/blocks/app-rail"
import { AppShell } from "@workspace/ui/blocks/app-shell"
import { AssistantPanel } from "@workspace/ui/blocks/assistant-panel"
import type { DeploymentIdentity } from "@workspace/ui/lib/deployment-version"

import {
  WORKSPACE_MODULE_NAV,
  activeWorkspaceNavTitle,
  moduleKeyFromWorkspaceHref,
  workspaceBottomNav,
  workspaceRailNav,
} from "./workspace-nav"
import { AppBottomNav } from "./app-bottom-nav"
import { AppRailNav } from "./app-rail-nav"
import {
  AppContentHeaderSlot,
  AppPageHeaderProvider,
} from "@workspace/ui/blocks/app-shell"
import { SidebarModuleTitle } from "./sidebar-module-title"
import { WorkspaceSidebar } from "./workspace-sidebar"

/**
 * The persistent workspace shell — the accountant-office counterpart to
 * `OrgShell`, mounted once by `workspace/layout.tsx`, so the rail, sidebar, and
 * chrome stay put while page bodies swap underneath. Structure-driven exactly
 * like the org shell: the active module comes from the rail's `activeRailEntry`
 * (one source, can't drift from the highlight), and its page tree from
 * `WORKSPACE_MODULE_NAV[moduleKey]`. The content-header title falls back to the
 * active page's nav label; a page overrides the whole header via
 * `AppPageHeader` (portaled into the slot).
 *
 * A CLIENT component fed a server-built `header` node (which needs the session +
 * an avatar presign) — identical seam to `OrgShell`. It must NOT read the
 * session itself; the layout resolves that and passes the node down.
 */
export function WorkspaceShell({
  header,
  deployment,
  children,
}: {
  header: React.ReactNode
  deployment: DeploymentIdentity
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const railNav = React.useMemo(() => workspaceRailNav(), [])
  const active = activeRailEntry(railNav, pathname)
  const moduleKey = moduleKeyFromWorkspaceHref(active?.href)
  const buildNav = WORKSPACE_MODULE_NAV[moduleKey] ?? WORKSPACE_MODULE_NAV[""]
  const nav = buildNav ? buildNav() : []
  const title = activeWorkspaceNavTitle(nav, pathname) ?? active?.label ?? ""

  return (
    <AppPageHeaderProvider>
      {/* `.workspace-chrome` (globals.css) paints the rail + top header + frame
          brand green and flips the rail/header icon + label tokens to white —
          the accountant-office identity, distinct from a client's book. */}
      <div className="workspace-chrome">
        <AppShell
          header={header}
          // Logomark copied verbatim from AppShell's DEFAULT_LOGO (the app
          // rail render), only the tone flipped to mono-light for the green
          // rail. The separator + wordmark live in the header's left zone
          // (see `workspace/layout.tsx`), pinned to the App Body's left
          // border, not bled out of the rail.
          logo={
            <Logo
              variant="logomark"
              tone="mono-light"
              className="h-[var(--shell-header-height)] w-[var(--shell-rail-width)]"
            />
          }
          logoNudge={false}
          rail={<AppRailNav items={railNav} />}
          bottomNav={<AppBottomNav items={workspaceBottomNav()} />}
          sidebar={<WorkspaceSidebar nav={nav} />}
          sidebarHeader={<SidebarModuleTitle items={railNav} />}
          contentHeader={
            <AppContentHeaderSlot fallback={<ContentHeader title={title} />} />
          }
          assistant={<AssistantPanel />}
          logoHref="/workspace"
          deployment={deployment}
        >
          {children}
        </AppShell>
      </div>
    </AppPageHeaderProvider>
  )
}
