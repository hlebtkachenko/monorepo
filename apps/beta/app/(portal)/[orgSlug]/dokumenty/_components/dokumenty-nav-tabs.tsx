"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import {
  dokumentyHref,
  isActiveDokumentyNav,
  type DokumentyNavItem,
} from "../_nav/dokumenty-nav"

/**
 * The three §2.2 tabs: Vše · Doklady firmy · Stavby.
 *
 * Mirrors `dane/_components/dane-nav-tabs.tsx`'s shape deliberately — same "a
 * flat row of links, no client state" idiom — rather than reaching for the
 * full `@workspace/ui` sidebar-panel machinery, which `BetaShell` does not
 * wire up (see that component's own header comment on why there is no
 * `sidebar` prop yet). No family-style visibility gate here: see
 * `DOKUMENTY_NAV`'s own header comment on why all three tabs are always shown.
 */
export function DokumentyNavTabs({
  orgSlug,
  items,
}: {
  orgSlug: string
  /** Which tabs this viewer gets — see `DOKUMENTY_SEAT_NAV` (PR 33). */
  items: readonly DokumentyNavItem[]
}) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav
      aria-label={t("dokumenty.navLabel")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 pt-3 pb-2"
    >
      {items.map((item) => {
        const href = dokumentyHref(orgSlug, item.slug)
        const active = isActiveDokumentyNav(item, orgSlug, pathname)
        return (
          <Link
            key={item.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {t(item.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
