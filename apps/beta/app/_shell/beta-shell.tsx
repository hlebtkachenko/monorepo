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
 *   - NO assistant PANEL and NO assistant toggle. `AppShell` renders the toggle
 *     only when an `assistant` node is passed, so omitting the prop removes the
 *     whole surface, and it stays omitted. Asistent shipped as a nav MODULE
 *     with its own route instead (PR 36, spec §2.8) — `showAssistant` below
 *     gates that RAIL ENTRY; it does not turn any shell chrome back on.
 *   - NO sidebar. Modules with subpages render their own chrome (Dokumenty's
 *     tab row, Asistent's chat list), so the shell's sidebar panel and its
 *     toggle stay off.
 */
export function BetaShell({
  children,
  orgSlug,
  orgLegalName,
  switcher,
  accountMenu,
  isOwner = false,
  showAssistant = false,
  isManagement = false,
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
  /**
   * Gates the Asistent rail entry (spec §2.8 / §5). Resolved on the server by
   * `assistantVisibleTo` — it folds the `BETA_ASSISTANT_ENABLED` dark-launch
   * flag together with the role rule, neither of which a Client Component can
   * read for itself.
   */
  showAssistant?: boolean
  /** Gates the "Mzdy" rail entry (spec §2.6.1, PR 31) — see `beta-nav.ts`. */
  isManagement?: boolean
}) {
  const pathname = usePathname() ?? undefined
  const t = useBetaTranslations()
  const rail = React.useMemo<RailMenuEntry[]>(
    () =>
      betaRailNav(orgSlug, { isOwner, showAssistant, isManagement }).map(
        (entry) => {
          if (entry === "separator") return entry
          const { labelKey, ...rest } = entry
          return { ...rest, label: t(`nav.${labelKey}`) }
        },
      ),
    [orgSlug, isOwner, showAssistant, isManagement, t],
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
      {/* THE PORTAL'S SCROLL REGION, AND IT HAS TO BE HERE.
          `AppShell` deliberately does NOT scroll its body — the org app fills
          that slot with `ContentPanel` archetypes that pin their own chrome and
          scroll an inner region instead (`app-body.tsx`, "the panel body ...
          does NOT scroll as a whole"). Beta has no such surfaces: every page is
          a plain column of cards handed straight to `children`, so without a
          scroll region of its own everything past the fold was clipped by that
          `overflow-hidden` and unreachable — no page scrolled at all.
          `h-full` (not `min-h-full`) so the box takes the parent's fixed height
          and overflows INSIDE it rather than growing and being cut off again. */}
      <div className="h-full overflow-y-auto">{children}</div>
    </AppShell>
  )
}
