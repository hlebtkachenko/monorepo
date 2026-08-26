"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import {
  isActiveNastaveniNav,
  nastaveniHref,
  NASTAVENI_NAV,
} from "../_nav/nastaveni-nav"

/** The §2.10 tab row. Mirrors `DaneNavTabs`'s shape deliberately. */
export function NastaveniNavTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav
      aria-label={t("nastaveni.navLabel")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 pt-3 pb-2"
    >
      {NASTAVENI_NAV.map((item) => {
        const href = nastaveniHref(orgSlug, item.slug)
        const active = isActiveNastaveniNav(item, orgSlug, pathname)
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
