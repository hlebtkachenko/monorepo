"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { ContentHeader } from "@workspace/ui/blocks/app-content"
import { activeRailEntry } from "@workspace/ui/blocks/app-rail"
import { AppShell } from "@workspace/ui/blocks/app-shell"

import {
  MODULE_NAV,
  activeNavTitle,
  moduleKeyFromHref,
  orgBottomNav,
  orgRailNav,
} from "../[orgSlug]/_nav/org-nav"
import { AppBottomNav } from "./app-bottom-nav"
import { AppRailNav } from "./app-rail-nav"
import { OrgContentHeaderSlot, OrgPageHeaderProvider } from "./org-page-header"
import { OrgSidebar } from "./org-sidebar"
import { SidebarModuleTitle } from "./sidebar-module-title"

/**
 * The persistent org shell — mounted once by `[orgSlug]/layout.tsx`, so the
 * rail, sidebar, and chrome stay put while page bodies swap underneath. The
 * sidebar is structure-driven: the active module comes from the rail's
 * `activeRailEntry` (one source, can't drift from the highlight), and its
 * page tree from `MODULE_NAV[moduleKey]`. The content-header title falls back to
 * the active page's nav label; a page can override the whole header via
 * `OrgPageHeader` (portaled into the slot). `header` is built server-side (it
 * needs the session/avatar) and passed down as a node.
 */
export function OrgShell({
  orgSlug,
  header,
  children,
}: {
  orgSlug: string
  header: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const railNav = React.useMemo(() => orgRailNav(orgSlug), [orgSlug])
  const active = activeRailEntry(railNav, pathname)
  const base = active?.href ?? `/${orgSlug}`
  const moduleKey = moduleKeyFromHref(active?.href, orgSlug)
  const buildNav = MODULE_NAV[moduleKey] ?? MODULE_NAV[""]
  const nav = buildNav ? buildNav(base) : []
  const title = activeNavTitle(nav, pathname) ?? active?.label ?? ""

  return (
    <OrgPageHeaderProvider>
      <AppShell
        header={header}
        rail={<AppRailNav items={railNav} />}
        bottomNav={<AppBottomNav items={orgBottomNav(orgSlug)} />}
        sidebar={<OrgSidebar orgSlug={orgSlug} nav={nav} />}
        sidebarHeader={<SidebarModuleTitle items={railNav} />}
        contentHeader={
          <OrgContentHeaderSlot fallback={<ContentHeader title={title} />} />
        }
        assistant={
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Assistant — coming soon
          </div>
        }
        logoHref={`/${orgSlug}`}
      >
        {children}
      </AppShell>
    </OrgPageHeaderProvider>
  )
}
