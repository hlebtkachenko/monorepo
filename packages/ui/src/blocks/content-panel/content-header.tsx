"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Separator } from "@workspace/ui/components/separator"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

/** One content tab — a view/segment of the current page (e.g. All). */
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
   * sort, … . Omit to hide the button. Pass DropdownMenu* items. When the
   * header is too narrow and the tabs collapse into a dropdown, this is mounted
   * under a "Manage tabs" submenu (its last item).
   */
  manageTabs?: React.ReactNode
  /** Right-aligned, page-level actions (favorite, settings, …). */
  actions?: React.ReactNode
  className?: string
}

// Below this header width the inline tabs collapse into a single dropdown.
// (Approximate — tuned for a handful of short tabs; revisit per surface.)
const COLLAPSE_AT = 560

/**
 * The content panel's header content — designed to sit inside the app-shell's
 * 45px panel header (via the `contentHeader` slot), to the right of the
 * sidebar toggle and left of the assistant toggle.
 *
 * Layout: `[icon] Title │ ⟨tabs⟩ ⋯ ……… ⟨actions⟩`. When the header is too
 * narrow to show everything, the tabs collapse into a single dropdown whose
 * last item ("Manage tabs") holds the manage menu. Tabs are controlled — wire
 * `value`/`onValueChange` to whatever drives the body.
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
  const icons = useIcons()
  const ChevronDown = icons.ChevronDown
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = React.useState(false)

  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setCollapsed(w > 0 && w < COLLAPSE_AT)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasTabs = tabs != null && tabs.length > 0
  const activeLabel = hasTabs
    ? (tabs.find((tab) => tab.value === value)?.label ?? "Tabs")
    : null

  const manageMenu =
    manageTabs != null ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* No `tooltip`: a tooltip'd IconButton returns a TooltipProvider
              tree and can't double as a Radix trigger. */}
          <IconButton
            icon="Ellipsis"
            aria-label="Manage tabs"
            className="shrink-0"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {manageTabs}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  return (
    <div
      ref={rootRef}
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
          {/* Inset divider between the page name and the tabs. */}
          <Separator orientation="vertical" inset className="mx-2 !h-6" />

          {collapsed ? (
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
                <DropdownMenuRadioGroup
                  value={value}
                  onValueChange={onValueChange}
                >
                  {tabs.map((tab) => (
                    <DropdownMenuRadioItem key={tab.value} value={tab.value}>
                      {tab.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {manageTabs != null ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        Manage tabs
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-56">
                        {manageTabs}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              {/* `contents` keeps Radix Tabs context without adding a layout
                  box, so the List flows inline in the header row. */}
              <Tabs
                value={value}
                onValueChange={onValueChange}
                className="contents"
              >
                {/* `overflow-visible` (not `-x-auto`) so the active tab's
                    underline can sit below the list, on the header's bottom
                    hairline — a scroll container would clip it. The header
                    already collapses to a dropdown when it runs out of room. */}
                <TabsList
                  variant="line"
                  className="h-8 min-w-0 overflow-visible"
                >
                  {tabs.map((tab) => (
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
              {manageMenu}
            </>
          )}
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
