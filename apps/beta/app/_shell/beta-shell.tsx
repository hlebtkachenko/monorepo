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
 * The persistent shell for the beta portal — mounted by
 * `app/(portal)/[orgSlug]/layout.tsx` so the rail and chrome stay put while
 * org page bodies swap underneath. Composes the same `@workspace/ui`
 * app-shell primitives as the org shell in apps/web.
 *
 * ORG-SCOPED SINCE PR 09, ON PURPOSE. There is no rail without an
 * organization to point it at, so this shell only ever mounts inside
 * `[orgSlug]` — the pre-org root picker (`app/(portal)/page.tsx`) renders its
 * own minimal chrome instead. `switcher` is the header org-switcher dropdown,
 * passed in already built (or omitted) by the layout, which is the one place
 * that knows the viewer's full membership list; this component stays a dumb
 * data-in composition.
 *
 * Two deliberate differences from the org shell:
 *   - NO assistant panel and NO assistant toggle. The AppShell renders the
 *     toggle only when an `assistant` node is passed, so omitting the prop
 *     removes the whole surface. Asistent ships later as a nav MODULE with its
 *     own route; nothing is stubbed for it here.
 *   - NO sidebar. No module has subpages yet, so the sidebar panel (and its
 *     toggle) stay off until the first one does.
 */
export function BetaShell({
  children,
  orgSlug,
  orgLegalName,
  switcher,
  accountMenu,
  isOwner = false,
}: {
  children: React.ReactNode
  orgSlug: string
  orgLegalName: string
  /** The header org-switcher, or omitted for a viewer with only one org. */
  switcher?: React.ReactNode
  /**
   * The header account menu (PR 21) — Nastavení's entry point, since Nastavení
   * deliberately does NOT sit in the rail (spec §1). Passed in already built by
   * the layout, which is the one place that knows the viewer's name, e-mail and
   * staff-ness; this component stays a dumb data-in composition, exactly as it
   * does for `switcher`.
   */
  accountMenu?: React.ReactNode
  /** Gates the "Pro účetní" rail entry (spec §5) — see `beta-nav.ts`. */
  isOwner?: boolean
}) {
  const pathname = usePathname() ?? undefined
  const t = useBetaTranslations()
  const rail = React.useMemo<RailMenuEntry[]>(
    () =>
      betaRailNav(orgSlug, { isOwner }).map((entry) => {
        if (entry === "separator") return entry
        const { labelKey, ...rest } = entry
        return { ...rest, label: t(`nav.${labelKey}`) }
      }),
    [orgSlug, isOwner, t],
  )

  return (
    <AppShell
      skipToContentLabel={t("a11y.skipToContent")}
      mainLabel={t("a11y.mainContent")}
      header={
        <AppHeader
          search={false}
          leftContent={
            <>
              {switcher}
              <Badge variant="secondary" className="ml-2">
                {t("app.badge")}
              </Badge>
            </>
          }
          // The account menu carries Nastavení AND sign-out (PR 21). The bare
          // SignOutButton it replaced still exists for /admin and the pre-org
          // root picker, which draw their own chrome and have no menu.
          actions={accountMenu}
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
      contentHeader={<ContentHeader title={orgLegalName} />}
      logoHref={`/${orgSlug}`}
    >
      {children}
    </AppShell>
  )
}
