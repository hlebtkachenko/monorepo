"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  AppShell,
  AppPageHeaderProvider,
  AppContentHeaderSlot,
} from "@workspace/ui/blocks/app-shell"
import { AppRail, activeRailEntry } from "@workspace/ui/blocks/app-rail"
import { AppSidebar } from "@workspace/ui/blocks/sidebar-panel"
import { AssistantPanel } from "@workspace/ui/blocks/assistant-panel"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import type { DeploymentIdentity } from "@workspace/ui/lib/deployment-version"

import { orgBasePath } from "@/lib/org/href"

import { companyNav, orgRailNav } from "../_nav/org-nav"

/**
 * The persistent shell for the rebuilt org tree — mounted once by `layout.tsx`
 * so the rail, sidebar, and chrome stay put while page bodies swap underneath.
 *
 * Composes the `@workspace/ui` `AppShell` primitives DIRECTLY — it does not
 * reuse the old `app/_components/org-shell.tsx` (which is wired to the frozen
 * old nav). Structure-driven: the active module comes from the rail's
 * `activeRailEntry`, its sidebar tree from the new `_nav`. Grows as modules are
 * rebuilt; until then there is a single module (Company) so the sidebar is
 * always the Company tree.
 */
export function OrgShell({
  slug,
  header,
  deployment,
  children,
}: {
  slug: string
  header: React.ReactNode
  deployment: DeploymentIdentity
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const rail = React.useMemo(() => orgRailNav(slug), [slug])
  const nav = React.useMemo(() => companyNav(slug), [slug])
  const active = activeRailEntry(rail, pathname)
  const title = active?.label ?? "Company"

  return (
    <AppPageHeaderProvider>
      <AppShell
        header={header}
        rail={<AppRail items={rail} currentPath={pathname} />}
        sidebar={<AppSidebar nav={nav} currentPath={pathname} />}
        sidebarHeader={
          <span className="truncate text-sm font-medium">{title}</span>
        }
        contentHeader={
          <AppContentHeaderSlot fallback={<ContentHeader title={title} />} />
        }
        assistant={<AssistantPanel />}
        logoHref={orgBasePath(slug)}
        deployment={deployment}
      >
        {children}
      </AppShell>
    </AppPageHeaderProvider>
  )
}
