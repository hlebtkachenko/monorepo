"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { AppHeader } from "@workspace/ui/blocks/app-header"
import { AppRail, type RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import { AppShell } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"

import { useBetaTranslations } from "@/i18n/translations"

import { SignOutButton } from "../_components/sign-out-button"
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
}: {
  children: React.ReactNode
  orgSlug: string
  orgLegalName: string
  /** The header org-switcher, or omitted for a viewer with only one org. */
  switcher?: React.ReactNode
}) {
  const pathname = usePathname() ?? undefined
  const t = useBetaTranslations()
  const rail = React.useMemo<RailMenuEntry[]>(
    () =>
      betaRailNav(orgSlug).map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(`nav.${labelKey}`),
      })),
    [orgSlug, t],
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
          // Sign-out lives here until the header account menu lands with
          // Nastavení › Účet (PR 21) — see the note on SignOutButton.
          actions={<SignOutButton />}
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
