"use client"

import * as React from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Text } from "@workspace/ui/components/text"
import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"

import { SidebarRow, activeHref } from "./sidebar-row"

/** A clickable child link under a Page. No icon, indented. */
export interface SidebarNavSubpage {
  label: string
  href: string
  /** Trailing live count / label (e.g. unread count). Independent of `tba`. */
  badge?: string | number
  /** Build-status flag — renders a muted "TBA" chip until the page ships. */
  tba?: boolean
}

/**
 * A clickable nav link — always has an icon. May nest Subpages, which makes it
 * an expandable parent (the page itself stays navigable). The tree stops at the
 * Subpage level (Group › Page › Subpage = 3 levels); a Page may own any number
 * of Subpages.
 */
export interface SidebarNavPage {
  label: string
  href: string
  icon: IconName
  /** Trailing live count / label (e.g. unread count). Independent of `tba`. */
  badge?: string | number
  /** Build-status flag — renders a muted "TBA" chip until the page ships. */
  tba?: boolean
  subpages?: SidebarNavSubpage[]
}

/** A non-clickable label that groups Pages under a heading. */
export interface SidebarNavGroup {
  label: string
  pages: SidebarNavPage[]
}

export type SidebarNavEntry = SidebarNavGroup | SidebarNavPage

function isGroup(entry: SidebarNavEntry): entry is SidebarNavGroup {
  return !("href" in entry)
}

/** Every navigable href in the tree, for longest-prefix active matching. */
function allHrefs(entries: SidebarNavEntry[]): string[] {
  const out: string[] = []
  for (const entry of entries) {
    const pages = isGroup(entry) ? entry.pages : [entry]
    for (const page of pages) {
      out.push(page.href)
      for (const sub of page.subpages ?? []) out.push(sub.href)
    }
  }
  return out
}

function NavPage({
  page,
  active,
}: {
  page: SidebarNavPage
  active: string | null
}) {
  const icons = useIcons()
  const Icon = icons[page.icon]
  const ChevronDown = icons.ChevronDown
  const subpages = page.subpages ?? []
  const hasSubs = subpages.length > 0
  const subActive = subpages.some((s) => s.href === active)

  const [open, setOpen] = React.useState(
    () => page.href === active || subActive,
  )
  // Auto-open when navigation lands on one of the subpages.
  React.useEffect(() => {
    if (subActive) setOpen(true)
  }, [subActive])

  const row = (
    <SidebarRow
      href={page.href}
      active={page.href === active}
      icon={<Icon className="size-4 shrink-0" />}
      badge={page.badge}
      tba={page.tba}
      className={hasSubs ? "min-w-0 flex-1" : undefined}
    >
      {page.label}
    </SidebarRow>
  )

  if (!hasSubs) return row

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-0.5">
        {row}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                !open && "-rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        {/* Tree guide: a vertical line under the parent icon connects the
            subpages so they read as children, not floating rows. */}
        <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border pl-1.5">
          {subpages.map((sub) => (
            <SidebarRow
              key={sub.href}
              href={sub.href}
              active={sub.href === active}
              badge={sub.badge}
              tba={sub.tba}
              muted
            >
              {sub.label}
            </SidebarRow>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export interface SidebarNavProps {
  entries: SidebarNavEntry[]
  /** Current route — pass `usePathname()` from the app wrapper. */
  currentPath?: string
}

/**
 * Section 3 — the module's navigation. Three concepts:
 *   - Group   — a non-clickable label heading that groups Pages.
 *   - Page    — a clickable link with an icon; may expand to Subpages.
 *   - Subpage — a clickable child link (indented, no icon).
 * No top/bottom border — rides the panel's normal padding and scrolls.
 */
export function SidebarNav({ entries, currentPath }: SidebarNavProps) {
  const active = activeHref(allHrefs(entries), currentPath)
  return (
    <nav
      aria-label="Module"
      data-slot="sidebar-nav"
      className="flex flex-col gap-0.5"
    >
      {entries.map((entry, i) =>
        isGroup(entry) ? (
          <div
            key={`g-${i}`}
            role="group"
            aria-labelledby={`sidebar-nav-group-${i}`}
            className="mt-2.5 flex flex-col gap-0.5 first:mt-0"
          >
            <Text variant="muted" asChild>
              <span id={`sidebar-nav-group-${i}`} className="px-2 py-1">
                {entry.label}
              </span>
            </Text>
            {entry.pages.map((page) => (
              <NavPage key={page.href} page={page} active={active} />
            ))}
          </div>
        ) : (
          <NavPage key={entry.href} page={entry} active={active} />
        ),
      )}
    </nav>
  )
}
