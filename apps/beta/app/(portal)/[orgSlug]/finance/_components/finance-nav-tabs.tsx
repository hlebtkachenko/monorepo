"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import {
  FINANCE_NAV,
  financeHref,
  isActiveFinanceNav,
} from "../_nav/finance-nav"

/**
 * The Finance module's tab row — spec §2.4's sidebar, rendered the way
 * `VykazyNavTabs` and `DaneNavTabs` render theirs, and for the same reason.
 *
 * Client component only because it reads `usePathname()` for the active state.
 */
export function FinanceNavTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav
      aria-label={t("nav.finance")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 py-3"
    >
      {FINANCE_NAV.map((item) => {
        const active = isActiveFinanceNav(item, orgSlug, pathname)
        return (
          <Link
            key={item.slug}
            href={financeHref(orgSlug, item.slug)}
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
