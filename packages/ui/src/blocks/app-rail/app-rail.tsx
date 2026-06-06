"use client"

import * as React from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import type { IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export type RailMode = "expanded" | "icon-only"

/**
 * One rail menu item. Author these as a plain list per surface — the
 * block handles all rendering + behaviour. Visual design (sizes, colors,
 * weights, gaps) comes from the `--rail-*` tokens in globals.css, NOT
 * from props. The only per-item visual knobs are `iconSize` /
 * `iconStrokeWidth` for the occasional icon that needs to read bigger.
 */
export interface RailMenuItem {
  /** Visible label — below the icon (expanded), tooltip (icon-only). */
  label: string
  /** Icon name; resolved from the active IconProvider pack. */
  icon: IconName
  /** Link target. Omit for a non-navigating placeholder (renders `#`). */
  href?: string
  /** Icon size in px. Default: `--icon-size` (20). */
  iconSize?: number
  /** Icon stroke width (lucide). Default: pack default (2). */
  iconStrokeWidth?: number
}

/** A rail entry: a menu item, or a `"separator"` divider. */
export type RailMenuEntry = RailMenuItem | "separator"

interface AppRailProps {
  /** Ordered menu entries (items + separators). */
  items: RailMenuEntry[]
  /**
   * Current route path. The item whose `href` is the longest prefix of
   * this path renders active. Pass `usePathname()` from a client parent
   * — the block stays router-agnostic.
   */
  currentPath?: string
  /** Initial mode if none persisted in localStorage. */
  defaultMode?: RailMode
  /** Persisted-mode storage key. Override to scope per-app. */
  storageKey?: string
  /** Rail width in expanded mode. Match `--shell-rail-width` default. */
  expandedWidth?: string
  /** Rail width in icon-only mode. */
  collapsedWidth?: string
  className?: string
}

const SHELL_RAIL_WIDTH_VAR = "--shell-rail-width"

function isItem(entry: RailMenuEntry): entry is RailMenuItem {
  return entry !== "separator"
}

/**
 * Longest-prefix active match: `/acme/finance/123` activates the
 * Finance item; `/acme` activates only the index item. Null when
 * nothing matches or no path is given.
 */
function activeHrefFor(
  items: RailMenuEntry[],
  currentPath: string | undefined,
): string | null {
  if (!currentPath) return null
  let best: string | null = null
  for (const entry of items) {
    if (!isItem(entry) || !entry.href) continue
    const h = entry.href
    const matches =
      currentPath === h || currentPath.startsWith(h.endsWith("/") ? h : `${h}/`)
    if (matches && (best === null || h.length > best.length)) best = h
  }
  return best
}

/**
 * App-shell rail navigation. Stacked icon-above-label items in two
 * modes:
 *   - `expanded`  (60px) → icon + label centered, stacked
 *   - `icon-only` (50px) → labels hidden; hover shows a right tooltip
 *
 * Mode toggles via right-click `ContextMenu` and persists to
 * localStorage. Writes `--shell-rail-width` on `<html>` so the
 * surrounding AppShell animates rail/header/content width in sync.
 *
 * All visual design lives in `--rail-*` tokens (globals.css). Each
 * surface passes only data — an ordered `items` list + `currentPath`.
 */
export function AppRail({
  items,
  currentPath,
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
      if (stored === "expanded" || stored === "icon-only") setMode(stored)
    } catch {
      // localStorage unavailable — keep defaultMode.
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

  const activeHref = activeHrefFor(items, currentPath)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <nav
          data-slot="app-rail"
          data-mode={mode}
          // Stop the global AppContextMenu from also firing.
          onContextMenu={(e) => e.stopPropagation()}
          className={cn(
            "flex h-full flex-col items-center overflow-x-hidden overflow-y-auto pt-[var(--rail-pad-top)] pb-2",
            // Inter-item gap from tokens; icon-only is tighter (no labels).
            "data-[mode=expanded]:gap-y-[var(--rail-gap)] data-[mode=icon-only]:gap-y-[var(--rail-gap-collapsed)]",
            className,
          )}
        >
          {items.map((entry, i) =>
            isItem(entry) ? (
              <RailNavItem
                key={entry.href ?? `${entry.label}-${i}`}
                item={entry}
                mode={mode}
                active={entry.href != null && entry.href === activeHref}
              />
            ) : (
              <RailSeparator key={`sep-${i}`} />
            ),
          )}
        </nav>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 p-2 [&_[data-slot=context-menu-radio-item]]:gap-2 [&_[data-slot=context-menu-radio-item]]:py-1.5 [&_[data-slot=context-menu-radio-item]]:pl-2">
        <ContextMenuRadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as RailMode)}
        >
          <ContextMenuRadioItem value="expanded">
            Icon with name
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="icon-only">
            Icon only
          </ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function RailNavItem({
  item,
  mode,
  active,
}: {
  item: RailMenuItem
  mode: RailMode
  active: boolean
}) {
  const iconOnly = mode === "icon-only"
  return (
    <IconButton
      icon={item.icon}
      label={iconOnly ? undefined : item.label}
      labelPosition="below"
      aria-label={item.label}
      href={item.href ?? "#"}
      active={active}
      iconSize={item.iconSize}
      iconStrokeWidth={item.iconStrokeWidth}
      tooltip={iconOnly ? item.label : undefined}
      // Tooltip side + gap come from IconButton's defaults — change them
      // there and every rail item follows.
      // Fill the rail so the stacked label can truncate + center; the
      // icon-only square stays its natural 32px (centered by the nav).
      className={iconOnly ? undefined : "w-full"}
    />
  )
}

function RailSeparator() {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      // No own margins — the nav's `--rail-gap` is the only spacing, so
      // the gap before and after the separator is equal.
      className="flex h-[3px] w-[var(--rail-separator-width)] items-center justify-center"
    >
      <div className="h-px w-full bg-rail-separator" />
    </div>
  )
}
