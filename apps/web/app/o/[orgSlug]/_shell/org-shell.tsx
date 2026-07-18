"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { useTranslations } from "@workspace/i18n/client"
import {
  AppShell,
  AppShellBottomNav,
  AppPageHeaderProvider,
  AppContentHeaderSlot,
  type BottomNavItem,
} from "@workspace/ui/blocks/app-shell"
import {
  AppRail,
  activeRailEntry,
  type RailMenuEntry,
} from "@workspace/ui/blocks/app-rail"
import {
  AppSidebar,
  type SidebarNavEntry,
} from "@workspace/ui/blocks/sidebar-panel"
import { AssistantPanel } from "@workspace/ui/blocks/assistant-panel"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import type { DeploymentIdentity } from "@workspace/ui/lib/deployment-version"

import { orgBasePath, orgHref } from "@/lib/org/href"

import { companyNav, debugNav, orgBottomNav, orgRailNav } from "../_nav/org-nav"

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
  debugAccess = false,
  children,
}: {
  slug: string
  header: React.ReactNode
  deployment: DeploymentIdentity
  /**
   * Server-resolved allowlist result for the dev/admin-only Debug module —
   * the seam by which an allowlisted workspace gets the Debug rail entry on
   * staging / production. Defaults to `false`, so a normal production user
   * never sees Debug; a dev build always exposes it via the `NODE_ENV` check
   * below regardless of this prop. `layout.tsx` (owned by another concern)
   * passes the real `hasDebugModuleAccess(...)` result here once wired.
   */
  debugAccess?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const t = useTranslations("org.nav")
  // Debug rail visibility: dev builds always, otherwise the allowlist seam.
  const showDebug = process.env.NODE_ENV === "development" || debugAccess
  const rail = React.useMemo<RailMenuEntry[]>(
    () =>
      orgRailNav(slug, { debug: showDebug }).map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(labelKey),
      })),
    [slug, t, showDebug],
  )
  // Mobile bottom nav: the same modules the rail shows, same debug gating,
  // resolved to `label` strings. The AppShell renders it only below `md`, where
  // the rail is hidden — no breakpoints of our own.
  const bottomNav = React.useMemo<BottomNavItem[]>(
    () =>
      orgBottomNav(slug, { debug: showDebug }).map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(labelKey),
      })),
    [slug, t, showDebug],
  )
  const active = activeRailEntry(rail, pathname)
  // Pick the active module's sidebar tree. Company is the default; the Debug
  // module has its own single-Overview tree.
  const isDebugModule = active?.href === orgHref(slug, "debug")
  const nav = React.useMemo<SidebarNavEntry[]>(
    () =>
      (isDebugModule ? debugNav(slug) : companyNav(slug)).map(
        ({ labelKey, ...rest }) => ({
          ...rest,
          label: t(labelKey),
        }),
      ),
    [slug, t, isDebugModule],
  )
  const title = active?.label ?? t("company")

  return (
    <AppPageHeaderProvider>
      <AppShell
        header={header}
        rail={<AppRail items={rail} currentPath={pathname} />}
        bottomNav={
          <AppShellBottomNav items={bottomNav} currentPath={pathname} />
        }
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
