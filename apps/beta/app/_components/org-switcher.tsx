"use client"

import Link from "next/link"

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

export interface SwitchableOrg {
  slug: string
  legalName: string
}

/**
 * Same 32px trigger box as `@workspace/ui`'s `HEADER_SWITCHER_TRIGGER`
 * (`packages/ui/src/blocks/app-header/header-menu.tsx`) — idle/hover/selected
 * treatment and text color, so this reads as the same family of control as
 * the main product's org/period switchers. Duplicated as a literal rather
 * than imported: that constant isn't re-exported from the block's public
 * `index.ts` (only its module-internal siblings are), and this PR's scope is
 * `apps/beta/` only, so it stays a beta-local copy — keep the two class
 * strings in sync if the shared token changes.
 */
const SWITCHER_TRIGGER =
  "flex h-8 items-center gap-1.5 rounded-sm px-2 font-medium text-icon-active outline-none transition-[background-color] hover:bg-icon-hover-bg aria-expanded:bg-icon-active-bg focus-visible:ring-2 focus-visible:ring-ring/50"

/**
 * Header org switcher for the beta portal (spec §2.0: "Header org switcher
 * lists active memberships — the daily entry point for the office user").
 *
 * A minimal alternative to the shared `@workspace/ui` `OrgSwitcher` block
 * rather than that block reused directly: it requires `createOrgHref` and
 * `workspaceHref`, and beta has neither a client-facing "create organization"
 * flow nor a cross-org workspace surface — both would render as dead links,
 * which the repo's no-dead-links rule forbids. This reuses the SAME header-
 * menu chrome primitives it CAN import (`HEADER_MENU`, `HeaderMenuTrigger`)
 * plus the matching trigger style above, scoped down to only what beta
 * actually has: the current organization, and the other ones this viewer may
 * switch to.
 *
 * The caller (`app/(portal)/[orgSlug]/layout.tsx`, via `BetaShell`) renders
 * this only when the viewer holds more than one active membership — passing
 * an empty `others` list would render a switcher with nothing to switch to.
 */
export function OrgSwitcher({
  current,
  others,
}: {
  current: SwitchableOrg
  others: SwitchableOrg[]
}) {
  const t = useBetaTranslations()
  const icons = useIcons()
  const ChevronIcon = icons.ChevronDown
  const CheckIcon = icons.Check

  return (
    <DropdownMenu modal={false}>
      <HeaderMenuTrigger tooltip={t("org.switcherLabel")}>
        <button
          type="button"
          aria-label={t("org.switcherLabel")}
          className={cn(SWITCHER_TRIGGER, "max-w-[220px]")}
        >
          <span className="min-w-0 truncate py-1 leading-none">
            {current.legalName}
          </span>
          <ChevronIcon className="size-4 shrink-0 text-icon" />
        </button>
      </HeaderMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={MENU_GAP}
        className={cn(HEADER_MENU, "min-w-[240px]")}
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
            {current.legalName}
          </span>
          <CheckIcon className="size-4 shrink-0 text-foreground" />
        </div>

        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {others.map((org) => (
              <DropdownMenuItem key={org.slug} asChild>
                <Link href={`/${org.slug}`}>
                  <span className="truncate">{org.legalName}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
