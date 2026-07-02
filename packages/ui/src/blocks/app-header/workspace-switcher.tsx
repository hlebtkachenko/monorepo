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

/** One workspace (accountant office) the user can switch into. */
export interface WorkspaceSwitcherWorkspace {
  /** Stable id (workspace UUID) — used as React key + the switch payload. */
  id: string
  /** Display name shown in the trigger / list. */
  name: string
}

/** The active workspace — adds the identity detail shown at the top. */
export interface WorkspaceSwitcherCurrentWorkspace extends WorkspaceSwitcherWorkspace {
  /** Human-readable role label, e.g. "Owner". */
  role: string
  /** Number of client books (organizations) in this workspace. */
  clientCount: number
}

export interface WorkspaceSwitcherProps {
  /** The workspace currently in context. */
  currentWorkspace: WorkspaceSwitcherCurrentWorkspace
  /** Other workspaces the user belongs to (excluding the current one). */
  otherWorkspaces: WorkspaceSwitcherWorkspace[]
  /** Workspace-settings page. */
  settingsHref: string
  /** "Create new workspace" destination. */
  createWorkspaceHref: string
  /**
   * Called when the user picks another workspace. The surface wrapper wires
   * this to the active-workspace cookie server action + a refresh — the block
   * stays router-agnostic (no navigation of its own).
   */
  onSelectWorkspace?: (workspaceId: string) => void
  /** Applied to the trigger button (e.g. responsive visibility). */
  className?: string
}

/**
 * Grey rounded-square avatar with the workspace's first initial. Square (not
 * the circular people `Avatar`) because a firm mark reads as a logo, not a
 * person — the same treatment `OrgSwitcher` uses for org marks.
 */
function WorkspaceAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <span
      data-slot="workspace-avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-icon-active-bg text-xs font-medium text-icon-active",
        className,
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  )
}

/**
 * Workspace switcher for the AppHeader `leftContent` slot — the workspace-tier
 * counterpart to `OrgSwitcher`. Trigger shows the current workspace name +
 * chevron; the dropdown mirrors the org switcher's layout — current-workspace
 * identity (avatar · name · role · client count · selected check) with a
 * Settings button, then the user's other workspaces, then "Create new
 * workspace".
 *
 * Presentational + router-agnostic: `settingsHref` / `createWorkspaceHref` are
 * plain hrefs and switching is delegated to `onSelectWorkspace` (a cookie
 * server action lives in the surface wrapper), same data-in pattern as
 * `OrgSwitcher` / `AppRail` / `AppSidebar`.
 */
export function WorkspaceSwitcher({
  currentWorkspace,
  otherWorkspaces,
  settingsHref,
  createWorkspaceHref,
  onSelectWorkspace,
  className,
}: WorkspaceSwitcherProps) {
  const icons = useIcons()
  const ChevronIcon = icons.ChevronDown
  const CheckGlyph = icons.Check
  const SettingsGlyph = icons.Settings
  const CreateGlyph = icons.Plus

  const clientLabel = `${currentWorkspace.clientCount} ${
    currentWorkspace.clientCount === 1 ? "Client" : "Clients"
  }`

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip="Switch workspace">
          <button
            type="button"
            aria-label="Switch workspace"
            className={cn(
              HEADER_SWITCHER_TRIGGER,
              "max-w-[220px] text-[length:var(--menu-text-size)]",
              className,
            )}
          >
            <WorkspaceAvatar
              name={currentWorkspace.name}
              className="size-6 rounded-sm text-[11px]"
            />
            {/* leading-none centers the glyph on the icon row; py-1 gives
                descenders room so truncate can't clip them. */}
            <span className="min-w-0 truncate py-1 leading-none">
              {currentWorkspace.name}
            </span>
            <ChevronIcon className="size-4 shrink-0 text-icon" />
          </button>
        </HeaderMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={MENU_GAP}
          className={cn(HEADER_MENU, "min-w-[280px]")}
        >
          {/* Current-workspace identity — avatar · name · role · clients · check. */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <WorkspaceAvatar
              name={currentWorkspace.name}
              className="bg-muted text-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
                {currentWorkspace.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {currentWorkspace.role} · {clientLabel}
              </div>
            </div>
            <CheckGlyph className="size-4 shrink-0 text-foreground" />
          </div>

          {/* Settings — a single full-width outline button (the workspace has
              no per-tenant "invite" split like the org switcher). */}
          <div className="px-2 py-1.5">
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={settingsHref}>
                <SettingsGlyph className="size-4" />
                Workspace settings
              </a>
            </Button>
          </div>

          {otherWorkspaces.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
              {otherWorkspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onSelect={() => onSelectWorkspace?.(ws.id)}
                >
                  <WorkspaceAvatar
                    name={ws.name}
                    className="size-5 rounded-sm bg-muted text-[10px] text-foreground"
                  />
                  <span className="truncate">{ws.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <a href={createWorkspaceHref}>
              <CreateGlyph />
              Create new workspace
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}
