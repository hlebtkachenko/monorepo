"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import {
  activeRailEntry,
  type RailMenuEntry,
} from "@workspace/ui/blocks/app-rail"
import {
  AppShell,
  AppContentHeaderSlot,
  AppPageHeaderProvider,
  type BottomNavItem,
} from "@workspace/ui/blocks/app-shell"
import { AssistantPanel } from "@workspace/ui/blocks/assistant-panel"
import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"
import {
  activeNavTitle,
  moduleKeyFromHref,
} from "@workspace/ui/lib/active-path"
import type { DeploymentIdentity } from "@workspace/ui/lib/deployment-version"

import { AppBottomNav } from "./app-bottom-nav"
import { AppRailNav } from "./app-rail-nav"
import { OrgSidebar } from "./org-sidebar"
import { SidebarModuleTitle } from "./sidebar-module-title"

/**
 * The persistent org shell — mounted once by the org layout, so the rail,
 * sidebar, and chrome stay put while page bodies swap underneath. The sidebar
 * is structure-driven: the active module comes from the rail's `activeRailEntry`
 * (one source, can't drift from the highlight), and its page tree from
 * `moduleNav[moduleKey]`. The content-header title falls back to the active
 * page's nav label; a page can override the whole header via `AppPageHeader`
 * (portaled into the slot). `header` is built server-side (it needs the
 * session/avatar) and passed down as a node.
 *
 * Nav-agnostic: the rail / bottom-nav / per-module sidebar trees are passed in
 * as props (by the tree-specific `OrgNavShell` wrapper) rather than imported,
 * so this cross-tier-shared shell never reaches into a route tree's `_nav`.
 */
export function OrgShell({
  orgSlug,
  header,
  deployment,
  railNav,
  bottomNav,
  moduleNav,
  children,
}: {
  orgSlug: string
  header: React.ReactNode
  deployment: DeploymentIdentity
  railNav: RailMenuEntry[]
  bottomNav: BottomNavItem[]
  moduleNav: Record<string, (base: string) => SidebarNavEntry[]>
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const active = activeRailEntry(railNav, pathname)
  const base = active?.href ?? `/${orgSlug}`
  const moduleKey = moduleKeyFromHref(active?.href, orgSlug)
  const buildNav = moduleNav[moduleKey] ?? moduleNav[""]
  const nav = buildNav ? buildNav(base) : []
  const title = activeNavTitle(nav, pathname) ?? active?.label ?? ""

  return (
    <AppPageHeaderProvider>
      <AppShell
        header={header}
        rail={<AppRailNav items={railNav} />}
        bottomNav={<AppBottomNav items={bottomNav} />}
        sidebar={<OrgSidebar orgSlug={orgSlug} nav={nav} />}
        sidebarHeader={<SidebarModuleTitle items={railNav} />}
        contentHeader={
          <AppContentHeaderSlot fallback={<ContentHeader title={title} />} />
        }
        assistant={<AssistantPanel />}
        logoHref={`/${orgSlug}`}
        deployment={deployment}
      >
        {children}
      </AppShell>
    </AppPageHeaderProvider>
  )
}
