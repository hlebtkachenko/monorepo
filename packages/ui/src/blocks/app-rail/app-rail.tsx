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
import { longestPrefixMatch } from "@workspace/ui/lib/active-path"
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
  /**
   * Accessible name for the primary-navigation landmark. English default;
   * pass a localized string from an i18n'd app.
   */
  navLabel?: string
  className?: string
}

const SHELL_RAIL_WIDTH_VAR = "--shell-rail-width"
// Rail geometry. Expanded mirrors the `--shell-rail-width: 70px` default in
// globals.css; collapsed is the icon-only width. Module constants, not props:
// no caller overrode these, and the AppShell reads the width back off the
// `--shell-rail-width` var this effect writes.
const RAIL_WIDTH_EXPANDED = "70px"
const RAIL_WIDTH_COLLAPSED = "50px"

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
  const hrefs = items
    .filter(isItem)
    .map((entry) => entry.href)
    .filter((href): href is string => Boolean(href))
  return longestPrefixMatch(hrefs, currentPath)
}

/**
 * Resolve the active rail item (the longest-prefix `href` match) for a
 * path — e.g. to title the Module the user is currently in. Returns null
 * when nothing matches or no path is given.
 */
export function activeRailEntry(
  items: RailMenuEntry[],
  currentPath: string | undefined,
): RailMenuItem | null {
  const href = activeHrefFor(items, currentPath)
  if (!href) return null
  for (const entry of items) {
    if (isItem(entry) && entry.href === href) return entry
  }
  return null
}

/**
 * App-shell rail navigation. Stacked icon-above-label items in two
 * modes:
 *   - `expanded`  (70px) → icon + label centered, stacked
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
  navLabel = "Primary",
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
    const width =
      mode === "expanded" ? RAIL_WIDTH_EXPANDED : RAIL_WIDTH_COLLAPSED
    document.documentElement.style.setProperty(SHELL_RAIL_WIDTH_VAR, width)
    try {
      localStorage.setItem(storageKey, mode)
    } catch {
      // ignore
    }
  }, [mode, storageKey])

  const activeHref = activeHrefFor(items, currentPath)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <nav
          data-slot="app-rail"
          data-mode={mode}
          // Names the primary-navigation landmark for screen readers (the
          // sidebar's module nav labels itself "Module", so the two rails
          // are distinguishable in the landmark list).
          aria-label={navLabel}
          // Stop the global AppContextMenu from also firing.
          onContextMenu={(e) => e.stopPropagation()}
          className={cn(
            "flex h-full flex-col items-center overflow-hidden",
            className,
          )}
        >
          {/* Scrolling item list. The toggle below stays pinned; items
              scroll behind it. */}
          <div
            data-mode={mode}
            className="flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto pt-[var(--rail-pad-top)] data-[mode=expanded]:gap-y-[var(--rail-gap)] data-[mode=icon-only]:gap-y-[var(--rail-gap-collapsed)]"
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
                <RailSeparator key={`sep-${i}`} mode={mode} />
              ),
            )}
          </div>
          {/* Pinned collapse/expand toggle — fixed at the bottom; the list
              above scrolls behind it (bg-canvas masks the overlap). Sits
              before the bottom pad. */}
          <div className="flex w-full shrink-0 flex-col items-center bg-canvas pt-2 pb-2">
            <RailToggle
              mode={mode}
              onToggle={() =>
                setMode(mode === "expanded" ? "icon-only" : "expanded")
              }
            />
          </div>
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

function RailSeparator({ mode }: { mode: RailMode }) {
  // The nav applies a uniform flex gap (`--rail-gap` / `--rail-gap-collapsed`)
  // between every child. To give the separator its OWN spacing, cancel that
  // gap with margin and re-add the separator's top/bottom tokens: the
  // effective space above/below becomes `--rail-separator-gap-top` /
  // `-bottom`, independent of the item gap and of each other.
  const activeGap =
    mode === "expanded" ? "var(--rail-gap)" : "var(--rail-gap-collapsed)"
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      style={{
        marginTop: `calc(var(--rail-separator-gap-top) - ${activeGap})`,
        marginBottom: `calc(var(--rail-separator-gap-bottom) - ${activeGap})`,
      }}
      className="flex h-[3px] w-[var(--rail-separator-width)] items-center justify-center"
    >
      <div className="h-[1.25px] w-full bg-rail-separator" />
    </div>
  )
}

/**
 * Pinned rail collapse/expand toggle. Icon + tooltip flip with the mode;
 * no label in either state. Toggles the same `mode` the right-click menu
 * controls, so the AppShell width animates in sync.
 */
function RailToggle({
  mode,
  onToggle,
}: {
  mode: RailMode
  onToggle: () => void
}) {
  const expanded = mode === "expanded"
  return (
    <IconButton
      icon={expanded ? "PanelLeftClose" : "PanelLeftOpen"}
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      tooltip={expanded ? "Collapse" : "Expand"}
      onClick={onToggle}
    />
  )
}
