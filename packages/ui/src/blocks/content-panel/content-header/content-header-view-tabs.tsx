"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

/** One view — a segment of the current page (e.g. All, Advances). */
export interface ViewTab {
  value: string
  label: string
  badge?: string | number
}

/**
 * Data for the views' configure (⋯) menu. Presence adds the button. It carries
 * the FULL view list (so hidden ones can be re-shown) plus the visibility
 * toggle — all DATA, never a page-supplied menu node.
 */
export interface ViewTabsConfigure {
  /** The full set of views (incl. hidden), for the "Choose views" list. */
  tabs: ViewTab[]
  /** Hidden view values. The first view is always-on and cannot be hidden. */
  hidden: ReadonlySet<string>
  /** Toggle a view's visibility. */
  onToggle: (value: string) => void
}

export interface ContentHeaderViewTabsProps {
  /** The visible views, rendered as the underline tab strip. */
  viewTabs: ViewTab[]
  /** Controlled active view value. */
  value?: string
  onValueChange?: (value: string) => void
  /** Optional configure (⋯) menu data — omit to hide the button. */
  manageViews?: ViewTabsConfigure
  /** When true (narrow header), collapse the strip into a single dropdown. */
  collapsed: boolean
}

/** The configure (⋯) menu body — Choose views + scope + sort, all from data. */
function ConfigureBody({ manageViews }: { manageViews: ViewTabsConfigure }) {
  const icons = useIcons()
  const EyeIcon = icons.Eye
  const EyeOffIcon = icons.EyeOff
  const [scope, setScope] = React.useState("all")
  const [sort, setSort] = React.useState("alpha")
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Choose views</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-44">
          {manageViews.tabs.map((tab, i) => {
            const isHidden = manageViews.hidden.has(tab.value)
            const alwaysOn = i === 0
            const Icon = isHidden ? EyeOffIcon : EyeIcon
            return (
              <DropdownMenuItem
                key={tab.value}
                disabled={alwaysOn}
                onSelect={(event) => {
                  event.preventDefault()
                  if (!alwaysOn) manageViews.onToggle(tab.value)
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
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Show in this section</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
        <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="unread">
          Unread updates only
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="mentions">
          Mentions only
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Sort this section</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
        <DropdownMenuRadioItem value="alpha">
          Alphabetically
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="recent">
          By most recent
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  )
}

/**
 * ContentHeaderViewTabs — the views strip after the title separator. Renders the
 * underline tabs plus a data-driven configure (⋯) menu. When the header is too
 * narrow (`collapsed`), the strip becomes a single dropdown whose last item
 * ("Manage views") holds the same configure body. Controlled via
 * `value`/`onValueChange`.
 */
export function ContentHeaderViewTabs({
  viewTabs,
  value,
  onValueChange,
  manageViews,
  collapsed,
}: ContentHeaderViewTabsProps) {
  const icons = useIcons()
  const ChevronDown = icons.ChevronDown
  const activeLabel =
    viewTabs.find((tab) => tab.value === value)?.label ?? "Views"

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Compose our Button (ghost) so hover/focus tokens track the
              primitive; keep the bespoke h-7 / shrink tab-selector sizing. */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 min-w-0 shrink gap-1 px-2 font-medium"
          >
            <span className="truncate">{activeLabel}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
            {viewTabs.map((tab) => (
              <DropdownMenuRadioItem key={tab.value} value={tab.value}>
                {tab.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {manageViews != null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Manage views</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-56">
                  <ConfigureBody manageViews={manageViews} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      {/* `contents` keeps Radix Tabs context without adding a layout box, so
          the List flows inline in the header row. */}
      <Tabs value={value} onValueChange={onValueChange} className="contents">
        {/* `overflow-visible` (not `-x-auto`) so the active tab's underline can
            sit below the list, on the header's bottom hairline — a scroll
            container would clip it. The header collapses to a dropdown when it
            runs out of room. */}
        <TabsList variant="line" className="h-8 min-w-0 overflow-visible">
          {viewTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              // Drop the active underline onto the panel header's bottom
              // hairline (its bottom pixel sits on the 45px border line).
              className="group-data-horizontal/tabs:after:bottom-[-7px]"
            >
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
      {manageViews != null ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* No `tooltip`: a tooltip'd IconButton returns a TooltipProvider
                tree and can't double as a Radix trigger. */}
            <IconButton
              icon="Ellipsis"
              aria-label="Manage views"
              className="shrink-0"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <ConfigureBody manageViews={manageViews} />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
