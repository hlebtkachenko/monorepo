"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import { AppShell } from "@workspace/ui/blocks/app-shell"
import { AssistantPanel } from "@workspace/ui/blocks/assistant-panel"
import { Logo } from "@workspace/ui/brand-assets"
import type { DeploymentIdentity } from "@workspace/ui/lib/deployment-version"

import type { ImpersonationState } from "@/lib/admin-impersonation-types"

import {
  adminBottomNav,
  adminModuleHref,
  adminRailNav,
  activeAdminModule,
  activeAdminPageTitle,
  type AdminModule,
} from "../_nav/admin-nav"
import { AdminBottomNav } from "./admin-bottom-nav"
import {
  AdminContentHeaderSlot,
  AdminPageHeaderProvider,
} from "./admin-page-header"
import { AdminRailNav } from "./admin-rail-nav"
import { AdminSidebarBody } from "./admin-sidebar-body"
import { CommandPalette } from "./command-palette"
import { ImpersonationBanner } from "./impersonation-banner"

/**
 * Admin application shell — the AppShell block (rail + collapsible sidebar +
 * header + assistant + mobile bottom-nav), the same chrome the org surface
 * uses. `modules` arrive ALREADY role-filtered from the server layout, so a
 * role only ever sees rail modules + sidebar pages it can reach (the server
 * section gate is still the real boundary).
 *
 * The active module is resolved by page ownership (admin modules aren't
 * path-prefix coherent — see `_nav/admin-nav.ts`); its href is handed to the
 * rail + bottom-nav so their highlights match. The header is built server-side
 * (needs the session) and passed in as a node.
 */
export function AdminShell({
  modules,
  header,
  userId,
  impersonation,
  deployment,
  children,
}: {
  modules: AdminModule[]
  header: ReactNode
  userId: string
  impersonation: ImpersonationState | null
  deployment: DeploymentIdentity
  children: ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const active = activeAdminModule(modules, pathname)
  const railItems = adminRailNav(modules)
  const bottomItems = adminBottomNav(modules)
  const activeHref = active ? adminModuleHref(active) : undefined
  const title = active
    ? (activeAdminPageTitle(active, pathname) ?? active.label)
    : ""

  return (
    <AdminPageHeaderProvider>
      <AppShell
        header={header}
        logo={
          <Logo
            variant="logomark"
            tone="admin"
            className="h-[var(--shell-header-height)] w-[var(--shell-rail-width)]"
          />
        }
        logoHref="/"
        rail={<AdminRailNav items={railItems} activeHref={activeHref} />}
        bottomNav={
          <AdminBottomNav items={bottomItems} activeHref={activeHref} />
        }
        sidebar={active ? <AdminSidebarBody pages={active.pages} /> : undefined}
        sidebarHeader={active?.label}
        assistant={<AssistantPanel label="Sidekick" />}
        deployment={deployment}
        contentHeader={
          <AdminContentHeaderSlot fallback={<ContentHeader title={title} />} />
        }
      >
        {/* Admin pages were authored against a normally-scrolling main, so the
            content column owns the scroll region (the AppShell body itself is
            overflow-hidden). The impersonation banner pins above it. */}
        <div className="flex h-full flex-col">
          <ImpersonationBanner impersonation={impersonation} />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
        <CommandPalette userId={userId} />
      </AppShell>
    </AdminPageHeaderProvider>
  )
}
