"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Logo } from "@workspace/ui/brand-assets"
import { ContentHeader } from "@workspace/ui/blocks/app-content"
import { activeRailEntry } from "@workspace/ui/blocks/app-rail"
import { AppShell } from "@workspace/ui/blocks/app-shell"

import {
  WORKSPACE_MODULE_NAV,
  activeWorkspaceNavTitle,
  moduleKeyFromWorkspaceHref,
  workspaceBottomNav,
  workspaceRailNav,
} from "./workspace-nav"
import { AppBottomNav } from "./app-bottom-nav"
import { AppRailNav } from "./app-rail-nav"
import { AppContentHeaderSlot, AppPageHeaderProvider } from "./app-page-header"
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
  children,
}: {
  header: React.ReactNode
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
          // Combined logomark+wordmark lockup (one asset, matches the auth
          // shell) — white on the green rail. `logoOverflow` lets it bleed
          // past the 70×40 rail-header zone instead of being clipped to a
          // square; the mark itself stays pinned at the zone's usual
          // top-left, only the wordmark trails further right.
          logo={
            <Logo
              variant="horizontal"
              tone="mono-light"
              className="h-[54px] w-auto"
            />
          }
          logoOverflow
          rail={<AppRailNav items={railNav} />}
          bottomNav={<AppBottomNav items={workspaceBottomNav()} />}
          sidebar={<WorkspaceSidebar nav={nav} />}
          sidebarHeader={<SidebarModuleTitle items={railNav} />}
          contentHeader={
            <AppContentHeaderSlot fallback={<ContentHeader title={title} />} />
          }
          assistant={
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Assistant — coming soon
            </div>
          }
          logoHref="/workspace"
        >
          {children}
        </AppShell>
      </div>
    </AppPageHeaderProvider>
  )
}
