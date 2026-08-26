"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { AppHeader } from "@workspace/ui/blocks/app-header"
import { AppRail, type RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import { AppShell } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"

import { useBetaTranslations } from "@/i18n/translations"

import { betaRailNav } from "../_nav/beta-nav"

/**
 * The persistent shell for the beta portal — mounted once by `layout.tsx` so
 * the rail and chrome stay put while page bodies swap underneath. Composes the
 * same `@workspace/ui` app-shell primitives as the org shell in apps/web.
 *
 * Two deliberate differences from the org shell:
 *   - NO assistant panel and NO assistant toggle. The AppShell renders the
 *     toggle only when an `assistant` node is passed, so omitting the prop
 *     removes the whole surface. Asistent ships later as a nav MODULE with its
 *     own route; nothing is stubbed for it here.
 *   - NO sidebar. No module has subpages yet, so the sidebar panel (and its
 *     toggle) stay off until the first one does.
 */
export function BetaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? undefined
  const t = useBetaTranslations()
  const rail = React.useMemo<RailMenuEntry[]>(
    () =>
      betaRailNav.map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(`nav.${labelKey}`),
      })),
    [t],
  )

  return (
    <AppShell
      skipToContentLabel={t("a11y.skipToContent")}
      mainLabel={t("a11y.mainContent")}
      header={
        <AppHeader
          search={false}
          leftContent={
            <Badge variant="secondary" className="ml-2">
              {t("app.badge")}
            </Badge>
          }
        />
      }
      rail={
        <AppRail
          items={rail}
          currentPath={pathname}
          navLabel={t("a11y.primaryNav")}
          storageKey="beta-rail-mode"
        />
      }
      contentHeader={<ContentHeader title={t("app.title")} />}
      logoHref="/"
    >
      {children}
    </AppShell>
  )
}
