"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { isActiveMzdyNav, mzdyHref, type MzdyNavItem } from "../_nav/mzdy-nav"

/**
 * The Mzdy module's own navigation (spec §2.6), rendered as a tab row for the
 * same reason `VykazyNavTabs` and `DaneNavTabs` are: `BetaShell` passes no
 * `sidebar`, so a module-local panel would give every other module an empty
 * one and a toggle that does nothing.
 *
 * Client component only because it reads `usePathname()` for the active state.
 *
 * `items` IS PASSED IN (PR 33) rather than imported here. The employee seat gets
 * a different list entirely (`MZDY_SEAT_NAV`), and which list a viewer gets is a
 * server-side decision made from a resolved scope — a client component that
 * chose for itself would need the role in the browser, which is exactly what
 * `nastaveni-nav.ts` already refuses to do for the Lidé tab.
 */
export function MzdyNavTabs({
  orgSlug,
  items,
}: {
  orgSlug: string
  items: readonly MzdyNavItem[]
}) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav
      aria-label={t("mzdy.title")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 py-3"
    >
      {items.map((item) => {
        const active = isActiveMzdyNav(item, orgSlug, pathname)
        return (
          <Link
            key={item.slug}
            href={mzdyHref(orgSlug, item.slug)}
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
