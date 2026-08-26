"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import type { BetaFilingFamily } from "@/db/schema"
import { useBetaTranslations } from "@/i18n/translations"

import { DANE_NAV, daneHref, isActiveDaneNav } from "../_nav/dane-nav"

/**
 * The five §2.3 tabs: Souhrn plus the four families, DPH hidden per the gate.
 *
 * Mirrors `app/admin/_components/admin-tabs.tsx`'s shape deliberately — same
 * "a flat row of links, no client state" idiom — rather than reaching for the
 * full `@workspace/ui` sidebar-panel machinery, which `BetaShell` does not
 * wire up (see that component's own header comment on why there is no
 * `sidebar` prop yet).
 */
export function DaneNavTabs({
  orgSlug,
  visibleFamilies,
}: {
  orgSlug: string
  visibleFamilies: readonly BetaFilingFamily[]
}) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  const items = DANE_NAV.filter(
    (item) => item.family === null || visibleFamilies.includes(item.family),
  )

  return (
    <nav
      aria-label={t("dane.navLabel")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 pt-3 pb-2"
    >
      {items.map((item) => {
        const href = daneHref(orgSlug, item.slug)
        const active = isActiveDaneNav(item, orgSlug, pathname)
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
