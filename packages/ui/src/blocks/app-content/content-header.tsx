"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Separator } from "@workspace/ui/components/separator"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"

/** One content tab — a view/segment of the current page (e.g. Všechny). */
export interface ContentTab {
  value: string
  label: React.ReactNode
  badge?: string | number
}

export interface ContentHeaderProps {
  /** The active Page/Subpage name, shown left of the separator. */
  title: React.ReactNode
  /** Optional leading node before the title (an icon / emoji). */
  icon?: React.ReactNode
  /** Tabs after the separator (rendered in the underline "line" style). */
  tabs?: ContentTab[]
  /** Controlled active tab value. */
  value?: string
  onValueChange?: (value: string) => void
  /**
   * Menu body for the "manage tabs" overflow (⋯ after the tabs) — show/hide,
   * reorder, add. Omit to hide the button. Pass DropdownMenu* items.
   */
  manageTabs?: React.ReactNode
  /** Right-aligned, page-level actions (favorite, manage-page menu, …). */
  actions?: React.ReactNode
  className?: string
}

/**
 * The content panel's header content — designed to sit inside the app-shell's
 * 45px panel header (via the `contentHeader` slot), to the right of the
 * sidebar toggle and left of the assistant toggle.
 *
 * Layout: `[icon] Title │ ⟨tabs⟩ ⋯ ……… ⟨actions⟩`. The vertical separator is
 * inset top/bottom (doesn't touch the header edges, like the rail divider).
 * Tabs are controlled — wire `value`/`onValueChange` to whatever drives the
 * body (the body reads the same active value to switch its content).
 */
export function ContentHeader({
  title,
  icon,
  tabs,
  value,
  onValueChange,
  manageTabs,
  actions,
  className,
}: ContentHeaderProps) {
  const hasTabs = tabs != null && tabs.length > 0
  return (
    <div
      data-slot="content-header"
      className={cn("flex min-w-0 flex-1 items-center gap-1", className)}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        {icon}
        <span className="truncate text-sm font-semibold text-foreground">
          {title}
        </span>
      </div>

      {hasTabs ? (
        <>
          {/* Inset divider — short, centred, doesn't touch the header edges. */}
          <Separator
            orientation="vertical"
            className="mx-1.5 !h-5 self-center"
          />
          {/* `contents` keeps Radix Tabs context without adding a layout box,
              so the List flows inline in the header row. */}
          <Tabs
            value={value}
            onValueChange={onValueChange}
            className="contents"
          >
            <TabsList variant="line" className="h-8 min-w-0 overflow-x-auto">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  {tab.badge != null ? (
                    <Badge variant="secondary" className="ml-1">
                      {tab.badge}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {manageTabs ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* No `tooltip` here: an IconButton with a tooltip returns a
                    TooltipProvider tree and can't double as a Radix trigger. */}
                <IconButton
                  icon="Ellipsis"
                  aria-label="Manage tabs"
                  className="shrink-0"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {manageTabs}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      ) : null}

      {actions != null ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
