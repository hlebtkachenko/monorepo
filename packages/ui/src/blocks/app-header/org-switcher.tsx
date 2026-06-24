"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import {
  HEADER_MENU,
  HEADER_SWITCHER_TRIGGER,
  HeaderMenuTrigger,
  MENU_GAP,
} from "./header-menu"

/** One organisation the user can switch to. */
export interface OrgSwitcherOrg {
  /** Stable id (used as React key). */
  id: string
  /** Display name shown in the trigger / list. */
  name: string
  /** Navigation target for selecting this org (e.g. `/acme`). */
  href: string
  /**
   * Optional logo URL. Absent today (no org logo in schema yet) → the grey
   * initial square is shown; wire the real URL here when org branding lands.
   */
  logoUrl?: string
}

/** The active organisation — adds the identity detail shown at the top. */
export interface OrgSwitcherCurrentOrg extends Omit<OrgSwitcherOrg, "href"> {
  /** Human-readable role label, e.g. "Owner". */
  role: string
  /** Active member count for the org. */
  memberCount: number
}

export interface OrgSwitcherProps {
  /** The organisation currently in context. */
  currentOrg: OrgSwitcherCurrentOrg
  /** Up to 3 recently-used orgs (excluding the current one). */
  recentOrgs: OrgSwitcherOrg[]
  /** Org settings page. */
  settingsHref: string
  /** Invite-members destination. */
  inviteHref: string
  /** "Create new organisation" destination. */
  createOrgHref: string
  /** "Manage in Workspace" (all organisations) destination. */
  workspaceHref: string
  /** Applied to the trigger button (e.g. responsive visibility). */
  className?: string
}

/**
 * Grey rounded-square avatar with the org's first initial. A placeholder for
 * the real org logo (not in schema yet) — pass `logoUrl` once it exists and
 * the image replaces the initial. Square (not the circular `Avatar`) because
 * org marks read as logos, not people.
 */
function OrgAvatar({
  name,
  logoUrl,
  className,
}: {
  name: string
  logoUrl?: string
  className?: string
}) {
  return (
    <span
      data-slot="org-avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-icon-active-bg text-xs font-medium text-icon-active",
        className,
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        (name.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  )
}

/**
 * Organisation switcher for the AppHeader `leftContent` slot. Trigger shows
 * the current org name + chevron; the dropdown mirrors the design ref:
 * current-org identity (avatar · name · role · member count · selected check)
 * with Settings + Invite buttons, then recent orgs, Create new, and Manage in
 * Workspace.
 *
 * Presentational + router-agnostic: navigation is plain `href`s supplied by
 * the surface wrapper (same data-in pattern as AppRail / AppSidebar).
 */
export function OrgSwitcher({
  currentOrg,
  recentOrgs,
  settingsHref,
  inviteHref,
  createOrgHref,
  workspaceHref,
  className,
}: OrgSwitcherProps) {
  const icons = useIcons()
  const ChevronIcon = icons.ChevronDown
  const CheckGlyph = icons.Check
  const SettingsGlyph = icons.Settings
  const InviteGlyph = icons.UserPlus
  const CreateGlyph = icons.Plus
  const WorkspaceGlyph = icons.Building2
  const ExternalGlyph = icons.ArrowUpRight

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip="Switch organisation">
          <button
            type="button"
            aria-label="Switch organisation"
            className={cn(
              HEADER_SWITCHER_TRIGGER,
              "max-w-[220px] text-[length:var(--menu-text-size)]",
              className,
            )}
          >
            <OrgAvatar
              name={currentOrg.name}
              logoUrl={currentOrg.logoUrl}
              className="size-6 rounded-sm text-[11px]"
            />
            {/* leading-none centers the glyph on the icon row (matches the
                right-side IconButton labels); py-1 gives the descenders room
                so truncate's overflow-hidden can't clip them. */}
            <span className="truncate py-1 leading-none">
              {currentOrg.name}
            </span>
            <ChevronIcon className="size-4 shrink-0 text-icon" />
          </button>
        </HeaderMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={MENU_GAP}
          className={cn(HEADER_MENU, "min-w-[280px]")}
        >
          {/* Current-org identity — avatar · name · role · members · check. */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            {/* Dropdown avatars keep the old light-grey fill. */}
            <OrgAvatar
              name={currentOrg.name}
              logoUrl={currentOrg.logoUrl}
              className="bg-muted text-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
                {currentOrg.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {currentOrg.role} · {currentOrg.memberCount}{" "}
                {currentOrg.memberCount === 1 ? "Member" : "Members"}
              </div>
            </div>
            <CheckGlyph className="size-4 shrink-0 text-foreground" />
          </div>

          {/* Settings + Invite — two outline buttons, per the ref. */}
          <div className="flex gap-2 px-2 py-1.5">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={settingsHref}>
                <SettingsGlyph className="size-4" />
                Settings
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={inviteHref}>
                <InviteGlyph className="size-4" />
                Invite members
              </a>
            </Button>
          </div>

          {recentOrgs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Recent organisations</DropdownMenuLabel>
              {recentOrgs.map((org) => (
                <DropdownMenuItem key={org.id} asChild>
                  <a href={org.href}>
                    <OrgAvatar
                      name={org.name}
                      logoUrl={org.logoUrl}
                      className="size-5 rounded-sm bg-muted text-[10px] text-foreground"
                    />
                    <span className="truncate">{org.name}</span>
                  </a>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <a href={createOrgHref}>
              <CreateGlyph />
              Create new organisation
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={workspaceHref}>
              <WorkspaceGlyph />
              Manage in Workspace
              <ExternalGlyph className="ml-auto size-3" />
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}
