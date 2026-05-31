"use client"

import * as React from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export type RailMode = "expanded" | "icon-only"

export interface RailItem {
  /** Stable identifier — used as React key and for active-state matching. */
  key: string
  /** Visible label below the icon (in expanded mode). Tooltip in icon-only mode. */
  label: string
  /**
   * Icon source — pick ONE:
   *   - `iconName`: string from the `IconName` union. The rail resolves
   *     the component from the active `IconProvider` pack at render
   *     time. Use this when constructing items in a server component
   *     so the icon JSX stays out of the server boundary (and the
   *     active pack drives which library renders).
   *   - `icon`: a pre-built React node (e.g. `<Home className="size-5" />`).
   *     Use this when you have a custom icon that isn't part of any pack.
   * If both are provided, `icon` wins.
   */
  iconName?: IconName
  icon?: React.ReactNode
  /** Href for the underlying `<a>`. Defaults to `#`. */
  href?: string
  /** Adds active styling (filled wrap, black icon). */
  active?: boolean
  /** Inserts a 30px-wide hairline separator BELOW this item. */
  separatorAfter?: boolean
}

interface AppRailProps {
  items: RailItem[]
  /** Initial mode if none persisted in localStorage. */
  defaultMode?: RailMode
  /** Persisted-mode storage key. Override to scope per-app. */
  storageKey?: string
  /** Rail width in `expanded` mode. Should match `--shell-rail-width` default. */
  expandedWidth?: string
  /** Rail width in `icon-only` mode. Spec: 10px narrower than expanded. */
  collapsedWidth?: string
  className?: string
}

const SHELL_RAIL_WIDTH_VAR = "--shell-rail-width"

/**
 * App-shell rail navigation. Stacked icon-above-label items with two
 * display modes:
 *   - `expanded`  (240px) → icon + label centered, stacked
 *   - `icon-only` (230px) → label hidden; same icons + spacing
 *
 * Mode toggles via right-click `ContextMenu` (`ContextMenuRadioGroup`
 * with two items). Mode persists in localStorage.
 *
 * Side-effect: writes `--shell-rail-width` on `<html>` so the
 * surrounding `AppShell` resizes its rail aside + header + content
 * area in sync. AppShell has `transition-[width,left]` so the change
 * animates.
 */
export function AppRail({
  items,
  defaultMode = "expanded",
  storageKey = "app-rail-mode",
  expandedWidth = "60px",
  collapsedWidth = "50px",
  className,
}: AppRailProps) {
  const [mode, setMode] = React.useState<RailMode>(defaultMode)

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === "expanded" || stored === "icon-only") {
        setMode(stored)
      }
    } catch {
      // localStorage unavailable — fall through to defaultMode.
    }
  }, [storageKey])

  React.useEffect(() => {
    const width = mode === "expanded" ? expandedWidth : collapsedWidth
    document.documentElement.style.setProperty(SHELL_RAIL_WIDTH_VAR, width)
    try {
      localStorage.setItem(storageKey, mode)
    } catch {
      // ignore
    }
  }, [mode, expandedWidth, collapsedWidth, storageKey])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <nav
          data-slot="app-rail"
          data-mode={mode}
          // Stop the global AppContextMenu from also firing.
          onContextMenu={(e) => e.stopPropagation()}
          className={cn(
            "flex h-full flex-col items-center overflow-x-hidden overflow-y-auto pt-3.5 pb-2",
            className,
          )}
        >
          {items.map((item) => (
            <React.Fragment key={item.key}>
              <RailNavItem item={item} mode={mode} />
              {item.separatorAfter && <RailSeparator />}
            </React.Fragment>
          ))}
        </nav>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuRadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as RailMode)}
        >
          <ContextMenuRadioItem value="expanded">
            Show labels
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="icon-only">
            Icons only
          </ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function RailNavItem({ item, mode }: { item: RailItem; mode: RailMode }) {
  const icons = useIcons()
  const PackIcon = item.iconName ? icons[item.iconName] : null
  const iconNode =
    item.icon ?? (PackIcon ? <PackIcon className="size-5" /> : null)

  return (
    <a
      href={item.href ?? "#"}
      title={mode === "icon-only" ? item.label : undefined}
      aria-label={mode === "icon-only" ? item.label : undefined}
      data-active={item.active || undefined}
      className={cn(
        // The item BBOX is just the icon wrap. Label is absolute below
        // so it doesn't contribute to flex height — keeps icon-to-icon
        // gap clean: mb-3.5 (14) + mt-3.5 (14) = 28px between icons.
        // First item overridden to 0 so it sits 14px below the
        // logomark (nav's pt-3.5).
        "group relative flex w-full flex-col items-center [&:first-child]:mt-0",
        "mt-3.5 mb-3.5",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-sm",
          // Icon color: idle gray, black when active.
          // Text color (`#4E5255`) is set separately on the label span.
          "text-[#808689] group-data-[active]:text-black",
          "group-hover:bg-[#E3E5E5]",
          "group-data-[active]:bg-[#CDCECE]",
        )}
      >
        {iconNode}
      </span>
      {mode === "expanded" && (
        <span className="absolute inset-x-0 top-full mt-0.5 text-center text-[11px] leading-tight font-semibold text-[#4E5255]">
          {item.label}
        </span>
      )}
    </a>
  )
}

/**
 * 30px-wide hairline separator. Total hit height 3px (1px line
 * centered with 1px above + 1px below). Centered in the rail.
 */
function RailSeparator() {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      // Negative `-my-[1.5px]` cancels the 3px hit-box height in flex
      // layout (3 + -3 = 0 effective). The separator sits visually
      // centered in the existing 28px gap between items, not adding
      // to it.
      className="-my-[1.5px] flex h-[3px] w-[30px] items-center justify-center"
    >
      <div className="h-px w-full bg-[#4E5255]" />
    </div>
  )
}
