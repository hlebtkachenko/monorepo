"use client"

import * as React from "react"

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Shared content-header extras so every archetype page carries the SAME header
 * cluster the Table demo does: a "manage tabs" (⋯) menu, a favorite star, and a
 * config button. Keeps the three archetype demos consistent instead of each
 * re-implementing the cluster.
 */

export interface ManageTab {
  value: string
  label: string
}

/** Local favorite/star toggle for the content-header `actions` slot. */
function FavoriteButton() {
  const [favorite, setFavorite] = React.useState(false)
  return (
    <IconButton
      icon="Star"
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      tooltip="Favorite"
      tooltipSide="bottom"
      onClick={() => setFavorite((f) => !f)}
      className={cn(favorite && "text-primary [&_svg]:fill-current")}
    />
  )
}

/** Config / settings button for the content-header `actions` slot. */
function ConfigButton() {
  return (
    <IconButton
      icon="Settings2"
      aria-label="Configure"
      tooltip="Configure"
      tooltipSide="bottom"
    />
  )
}

/** Favorite + config, the standard right-side header actions. */
export function PageHeaderActions() {
  return (
    <>
      <FavoriteButton />
      <ConfigButton />
    </>
  )
}

/**
 * Controlled tab show/hide state for the manage-tabs (⋯) menu. Pass the current
 * active tab value to get back an `activeValue` clamped to the visible set — so
 * hiding the active tab cleanly falls back to the first visible one, derived in
 * render (no effect, no one-frame mismatch between the header and the body).
 */
export function useTabVisibility(tabs: ManageTab[], active?: string) {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const toggle = React.useCallback((value: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }, [])
  const visible = tabs.filter((t) => !hidden.has(t.value))
  const activeValue =
    active != null && visible.some((t) => t.value === active)
      ? active
      : visible[0]?.value
  return { hidden, toggle, visible, activeValue }
}

/**
 * The body of the content-header's manage-tabs (⋯) menu: a "Choose tabs"
 * submenu with an eye / eye-off toggle per tab. The first tab is always-on
 * (can't be hidden), mirroring the Table demo. Pass as `ContentHeader.manageTabs`.
 */
export function ManageTabsMenu({
  tabs,
  hidden,
  onToggle,
}: {
  tabs: ManageTab[]
  hidden: ReadonlySet<string>
  onToggle: (value: string) => void
}) {
  const icons = useIcons()
  const EyeIcon = icons.Eye
  const EyeOffIcon = icons.EyeOff
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Choose tabs</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44">
        {tabs.map((tab, i) => {
          const isHidden = hidden.has(tab.value)
          const alwaysOn = i === 0
          const Icon = isHidden ? EyeOffIcon : EyeIcon
          return (
            <DropdownMenuItem
              key={tab.value}
              disabled={alwaysOn}
              onSelect={(event) => {
                event.preventDefault()
                if (!alwaysOn) onToggle(tab.value)
              }}
              className="justify-between gap-6"
            >
              <span className={cn(isHidden && "text-muted-foreground")}>
                {tab.label}
              </span>
              <Icon className="text-muted-foreground" />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
