"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { proUcetniNav, isActiveProUcetniNav } from "../_nav/pro-ucetni-nav"

/**
 * The Pro účetní section's own navigation — spec §3's sidebar, rendered as a
 * row of links.
 *
 * NOT THE SHELL'S SIDEBAR PANEL, deliberately. `BetaShell` still passes no
 * `sidebar` (see its header: the panel and its toggle stay off until a module
 * needs them), and turning it on for one section would give every other module
 * an empty panel and a toggle that does nothing. A two-item row inside the
 * section is the honest amount of chrome for the amount of navigation there is;
 * when Měsíční uzávěrka and Úkoly klientovi land (PRs 25 / 19) the same list
 * grows, and moving it into the shell panel is then a change with a reason.
 *
 * Client component only because it reads `usePathname()` for the active state,
 * exactly like `AdminTabs`.
 */
export function ProUcetniTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()

  return (
    <nav
      aria-label={t("ucetni.title")}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-6 py-3"
    >
      {proUcetniNav(orgSlug).map((item) => {
        const active = isActiveProUcetniNav(item.href, pathname)
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
            {t(item.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
