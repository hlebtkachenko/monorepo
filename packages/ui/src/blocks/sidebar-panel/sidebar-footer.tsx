"use client"

import * as React from "react"

import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"

import { SidebarRow, activeHref } from "./sidebar-row"

/** A footer link — icon + label, NOT part of the module nav hierarchy. */
export interface SidebarFooterLink {
  icon: IconName
  label: string
  href: string
}

export interface SidebarFooterProps {
  links: SidebarFooterLink[]
  /** Current route — pass `usePathname()` from the app wrapper. */
  currentPath?: string
}

/**
 * Section 5 — the footer link list. Same `SidebarRow` as the module nav, but
 * standalone (its own `Secondary` landmark, not tied to the module hierarchy)
 * and icon-led (the module nav is text-only). Swapped per page — e.g. module
 * Settings, help. Renders nothing when there are no links.
 */
export function SidebarFooter({ links, currentPath }: SidebarFooterProps) {
  const icons = useIcons()
  if (links.length === 0) return null
  const active = activeHref(
    links.map((l) => l.href),
    currentPath,
  )
  return (
    <nav
      aria-label="Secondary"
      data-slot="sidebar-footer"
      className="flex shrink-0 flex-col gap-0.5"
    >
      {links.map((link) => {
        const Icon = icons[link.icon]
        return (
          <SidebarRow
            key={link.href}
            href={link.href}
            active={link.href === active}
            icon={<Icon className="size-4 shrink-0" />}
          >
            {link.label}
          </SidebarRow>
        )
      })}
    </nav>
  )
}
