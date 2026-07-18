"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

/**
 * One view — a saved segment of the current page (e.g. To do, Posted). Always
 * carries a `count` (the badge is mandatory, 0 or more). The FIRST view is the
 * mandatory "All" view — it (plus the active view) always stays inline when the
 * header narrows. Views carry no per-tab icons.
 */
export interface ViewTab {
  value: string
  label: string
  /** The badge value — always shown (0+). */
  count?: number
  /** @deprecated legacy alias for `count`; migrate to `count`. */
  badge?: string | number
}

/**
 * @deprecated The old ⋯ configure menu is gone — view show/hide/pin/save moves
 * into the "+ Add view" dropdown (deferred). Kept only so un-migrated callers
 * still type-check; the prop is ignored.
 */
export interface ViewTabsConfigure {
  tabs: ViewTab[]
  hidden: ReadonlySet<string>
  onToggle: (value: string) => void
}

export interface ContentHeaderViewTabsProps {
  /** The views, rendered as the underline tab strip. */
  viewTabs: ViewTab[]
  /** Controlled active view value. */
  value?: string
  onValueChange?: (value: string) => void
  /** Adds the trailing "+ Add view" button. Its dropdown is wired later. */
  onAddView?: () => void
}

/**
 * ContentHeaderViewTabs — the views strip. Underline tabs flush on the panel
 * header's bottom hairline: the active tab draws a 2px underline exactly its own
 * width (no overhang, no padding), covering label + count badge. No box/ring.
 * Inactive tabs share the exact non-selected style of the back-link + crumbs; the
 * active tab shares the selected title style. A mandatory count badge (primary
 * active / muted inactive). No per-tab icons.
 *
 * Responsive (container query on the header, `/ch`): when the header narrows,
 * every view except the mandatory first ("All") and the active one folds into a
 * trailing chevron-down dropdown that lists ALL views + "+ Add view". The strip
 * is also the flex-grow middle and scrolls horizontally as the last resort.
 */
export function ContentHeaderViewTabs({
  viewTabs,
  value,
  onValueChange,
  onAddView,
}: ContentHeaderViewTabsProps) {
  const icons = useIcons()
  const PlusIcon = icons.Plus

  return (
    <div
      // flex-1 middle that scrolls; drop the bottom edge onto the header's bottom
      // hairline (the bar's `py-1` = 4px) so each tab's underline lands on it.
      className="-mb-1 flex min-w-0 flex-1 items-stretch gap-2 self-stretch overflow-x-auto"
    >
      {/* Only the tabs belong to the tablist. The "+ Add view" button and the
          overflow dropdown are NOT tabs, so they sit OUTSIDE it — a `tablist`
          may only own `tab` children (WCAG / axe aria-required-children). */}
      <div
        role="tablist"
        aria-label="Views"
        className="flex items-stretch gap-2 self-stretch"
      >
        {viewTabs.map((tab, index) => {
          const active = tab.value === value
          // The mandatory first view ("All") + the active view always stay inline;
          // the rest fold into the dropdown when the header narrows.
          const priority = index === 0 || active
          const badgeValue = tab.count ?? tab.badge
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onValueChange?.(tab.value)}
              className={cn(
                "group relative flex h-full shrink-0 items-center gap-1.5 px-1.5 pb-1 whitespace-nowrap",
                // The underline: flush on the hairline, spanning the padded tab.
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:transition-colors",
                active
                  ? "text-sm font-medium text-foreground after:bg-foreground"
                  : "text-sm font-normal text-muted-foreground transition-colors after:bg-transparent hover:text-foreground",
                !priority && "@max-[36rem]/ch:hidden",
              )}
            >
              <span className="truncate">{tab.label}</span>
              {badgeValue != null ? (
                <Badge variant={active ? "default" : "secondary"}>
                  {badgeValue}
                </Badge>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Inline "+ Add view" — hidden when narrow (it moves into the dropdown). */}
      {onAddView ? (
        <button
          type="button"
          onClick={onAddView}
          className="flex h-full shrink-0 items-center gap-1.5 px-1.5 pb-1 text-sm font-normal whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground @max-[36rem]/ch:hidden"
        >
          <PlusIcon className="size-4 shrink-0" />
          Add view
        </button>
      ) : null}

      {/* Overflow "…" dropdown — shown only when narrow; ALL views + Add view.
          The trigger is an action-button-style IconButton (same size-8 square +
          hover box as the header's Favorite / assistant buttons). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon="ChevronDown"
            aria-label="More views"
            className="hidden self-center @max-[36rem]/ch:inline-flex"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {viewTabs.map((tab) => {
            const badgeValue = tab.count ?? tab.badge
            return (
              <DropdownMenuItem
                key={tab.value}
                onSelect={() => onValueChange?.(tab.value)}
                className="justify-between gap-6"
              >
                <span className="flex items-center gap-1.5">{tab.label}</span>
                {badgeValue != null ? (
                  <Badge
                    variant={tab.value === value ? "default" : "secondary"}
                  >
                    {badgeValue}
                  </Badge>
                ) : null}
              </DropdownMenuItem>
            )
          })}
          {onAddView ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onAddView} className="gap-1.5">
                <PlusIcon className="size-4 shrink-0" />
                Add view
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
