"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { adminNav, isActiveAdminNav } from "../_nav/admin-nav"

/**
 * The office area's whole navigation: four links in a row.
 *
 * Deliberately NOT the portal rail. /admin is above organizations, so the org
 * chrome (rail, org switcher, content panels) has nothing to say here — and
 * rendering it would put a cross-org surface inside furniture that promises a
 * single book. Own minimal chrome, four sections, no state.
 */
export function AdminTabs() {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav aria-label={t("admin.navLabel")} className="flex flex-wrap gap-1">
      {adminNav.map((item) => {
        const active = isActiveAdminNav(item.href, pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {t(`admin.${item.labelKey}`)}
          </Link>
        )
      })}
    </nav>
  )
}
