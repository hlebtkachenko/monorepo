"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { VYKAZY_NAV, isActiveVykazyNav, vykazyHref } from "../_nav/vykazy-nav"

/**
 * The Výkazy module's own navigation — spec §2.5's sidebar, rendered as a tab
 * row for the same reason `DaneNavTabs` is: `BetaShell` passes no `sidebar`,
 * and turning the shell panel on for one module would give every other one an
 * empty panel and a toggle that does nothing.
 *
 * Client component only because it reads `usePathname()` for the active state.
 *
 * NO PERIOD IN THE HREFS, on purpose. Each statement has its OWN published
 * periods (the office may publish a předvaha for a month whose rozvaha it has
 * not sent), so carrying `?obdobi` across a tab switch would land the reader on
 * a period the next statement has nothing for — and §0.4's honest empty state
 * would then be produced by the navigation rather than by the data. Each tab
 * opens on its own newest published period.
 */
export function VykazyNavTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav
      aria-label={t("vykazy.title")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 py-3"
    >
      {VYKAZY_NAV.map((item) => {
        const active = isActiveVykazyNav(item, orgSlug, pathname)
        return (
          <Link
            key={item.slug}
            href={vykazyHref(orgSlug, item.slug)}
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
