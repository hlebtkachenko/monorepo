"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import {
  betaBottomNav,
  type BetaBottomNavOptions,
} from "../_nav/beta-bottom-nav"

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The mobile bottom nav (spec §1, <md breakpoint — `BetaShell` passes this
 * into `AppShell`'s `bottomNav` slot, which only renders there).
 *
 * NOT built on `@workspace/ui`'s generic `AppShellBottomNav` (used by
 * `apps/web`'s `AppBottomNav`): that block's contract is a flat list of
 * equal-weight nav tabs, and this bar isn't one — a center FAB breaks the
 * even split, and "Více" opens a Sheet instead of navigating. Composing a
 * bespoke bar here (same idiom as `DokumentyNavTabs` / `DaneNavTabs`
 * building their own tab row rather than reaching for shared tab
 * machinery that doesn't fit) keeps the shared block's contract simple
 * for the apps that DO want a flat tab row.
 */
export function BetaBottomNav({
  orgSlug,
  isOwner,
  showAssistant,
  isManagement,
  isEmployeeSeat,
  canUpload,
}: { orgSlug: string } & BetaBottomNavOptions) {
  const pathname = usePathname() ?? ""
  const t = useBetaTranslations()
  const icons = useIcons()
  const [moreOpen, setMoreOpen] = React.useState(false)

  const slots = React.useMemo(
    () =>
      betaBottomNav(orgSlug, {
        isOwner,
        showAssistant,
        isManagement,
        isEmployeeSeat,
        canUpload,
      }),
    [orgSlug, isOwner, showAssistant, isManagement, isEmployeeSeat, canUpload],
  )

  return (
    <nav
      aria-label={t("a11y.primaryNav")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around",
        "min-h-14 shrink-0 border-t border-border-subtle bg-shell-surface/60 backdrop-blur-sm",
        "pb-[env(safe-area-inset-bottom,0px)]",
      )}
    >
      {slots.map((slot) => {
        if (slot.kind === "tab") {
          const Icon = icons[slot.icon]
          const active = isActive(slot.href, pathname)
          return (
            <Link
              key={slot.href}
              href={slot.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 p-2",
                "text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                active && "text-primary",
              )}
            >
              {Icon ? <Icon className="size-5" /> : null}
              <span className="truncate text-xs font-medium">
                {t(`nav.${slot.labelKey}`)}
              </span>
            </Link>
          )
        }

        if (slot.kind === "fab") {
          const Icon = icons[slot.icon]
          return (
            <div
              key="fab"
              className="flex min-w-0 flex-1 items-center justify-center"
            >
              <Link
                href={slot.href}
                aria-label={t(`nav.${slot.labelKey}`)}
                className={cn(
                  "-mt-6 flex size-12 items-center justify-center rounded-full",
                  "bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                )}
              >
                {Icon ? <Icon className="size-6" /> : null}
              </Link>
            </div>
          )
        }

        // slot.kind === "more"
        const MoreIcon = icons[slot.icon]
        const moreActive = slot.items.some((item) =>
          isActive(item.href, pathname),
        )
        return (
          <Sheet key="more" open={moreOpen} onOpenChange={setMoreOpen}>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-current={moreActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 p-2",
                "cursor-pointer text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                moreActive && "text-primary",
              )}
            >
              {MoreIcon ? <MoreIcon className="size-5" /> : null}
              <span className="truncate text-xs font-medium">
                {t(`nav.${slot.labelKey}`)}
              </span>
            </button>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>{t("nav.vice")}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 p-4 pt-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                {slot.items.map((item) => {
                  const ItemIcon = icons[item.icon]
                  const active = isActive(item.href, pathname)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-secondary text-secondary-foreground"
                          : "text-foreground hover:bg-secondary/60",
                      )}
                    >
                      {ItemIcon ? <ItemIcon className="size-5" /> : null}
                      {t(`nav.${item.labelKey}`)}
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        )
      })}
    </nav>
  )
}
