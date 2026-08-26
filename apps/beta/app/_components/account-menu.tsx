"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  HEADER_MENU,
  HeaderMenuTrigger,
  MENU_GAP,
} from "@workspace/ui/blocks/app-header"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * The header account menu — Nastavení's entry point (spec §1: "Nastavení leaves
 * the rail → header gear/avatar menu (route `/[orgSlug]/nastaveni` unchanged)").
 *
 * WHY NOT THE RAIL. The rail is nine entries measured against a ~650px fold
 * (Advisor Part-5 defect 3); settings is not a daily destination and taking a
 * slot from Přehled or Dokumenty for it is the trade that made the rail
 * unusable in v3.
 *
 * It replaces the bare `SignOutButton` in the org shell — sign-out moves INTO
 * this menu, which is where a user looks for it once an account menu exists.
 * `SignOutButton` stays for the two surfaces that draw their own chrome and
 * have no account menu: /admin and the pre-org root picker.
 *
 * Same header-menu primitives and the same 32px trigger box as `OrgSwitcher`,
 * so the two controls in the header read as one family.
 *
 * `staffLink` is decided by the SERVER (`is_staff`, never serialized further
 * than this boolean) — an /admin entry rendered for someone the layout will
 * 404 is a dead link, which the repo's rule forbids.
 */
const MENU_TRIGGER =
  "flex size-8 items-center justify-center rounded-sm font-medium text-icon-active outline-none transition-[background-color] hover:bg-icon-hover-bg aria-expanded:bg-icon-active-bg focus-visible:ring-2 focus-visible:ring-ring/50"

export function AccountMenu({
  orgSlug,
  name,
  email,
  staffLink = false,
}: {
  orgSlug: string
  name: string
  email: string
  staffLink?: boolean
}) {
  const t = useBetaTranslations()
  const router = useRouter()
  const icons = useIcons()
  const UserIcon = icons.User
  const [pending, setPending] = React.useState(false)

  async function handleSignOut(): Promise<void> {
    setPending(true)
    await betaAuthClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <DropdownMenu modal={false}>
      <HeaderMenuTrigger tooltip={t("nastaveni.accountMenuLabel")}>
        <button
          type="button"
          aria-label={t("nastaveni.accountMenuLabel")}
          className={MENU_TRIGGER}
        >
          <UserIcon className="size-4" />
        </button>
      </HeaderMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={MENU_GAP}
        className={cn(HEADER_MENU, "min-w-[240px]")}
      >
        <div className="grid gap-0.5 px-2 py-1.5">
          <span className="truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {email}
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={`/${orgSlug}/nastaveni/spolecnost`}>
            {t("nastaveni.navSpolecnost")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${orgSlug}/nastaveni/ucet`}>
            {t("nastaveni.navUcet")}
          </Link>
        </DropdownMenuItem>

        {staffLink ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">{t("admin.title")}</Link>
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            // Radix closes the menu on select and unmounts the item mid-await;
            // preventing the default keeps the pending state visible until the
            // navigation happens.
            event.preventDefault()
            void handleSignOut()
          }}
        >
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
