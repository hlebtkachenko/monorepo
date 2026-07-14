"use client"

import * as React from "react"

import { BreadcrumbEllipsis } from "@workspace/ui/components/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"

export interface ContentHeaderBreadcrumbItem {
  /** Crumb label. */
  label: string
  /** Navigation target. Omit for a non-navigable ancestor (rendered inert). */
  href?: string
  /** Optional leading glyph (closed `IconName`) — typically on the module crumb. */
  icon?: IconName
}

export interface ContentHeaderBreadcrumbProps {
  /** Ancestor trail, root-first. The current page is the Title, not a crumb. */
  items: ContentHeaderBreadcrumbItem[]
}

/**
 * ContentHeaderBreadcrumb — the ancestor trail (the "Page name" crumbs), left of
 * the title. Non-selected styling, identical to the back-link + inactive tabs;
 * icons match the sidebar width. Uses the ONE header gap (`gap-2`) between crumb
 * and chevron. Responsive: when the header narrows the whole ancestor trail
 * collapses to a single `…` (container query on the header, `/ch`), so the
 * current title always stays visible as `… › Title`.
 */
export function ContentHeaderBreadcrumb({
  items,
}: ContentHeaderBreadcrumbProps) {
  const icons = useIcons()
  const ChevronRight = icons.ChevronRight
  if (items.length === 0) return null
  return (
    <>
      {/* Full trail — hidden once the header gets narrow. */}
      <span className="flex items-center gap-2 @max-[44rem]/ch:hidden">
        {items.map((item, i) => {
          const Icon = item.icon ? icons[item.icon] : null
          const inner = (
            <span className="flex min-w-0 items-center gap-1.5">
              {Icon ? <Icon className="size-4 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
            </span>
          )
          return (
            <React.Fragment key={`${item.label}-${i}`}>
              {item.href ? (
                <a
                  href={item.href}
                  className="flex min-w-0 text-sm font-normal text-muted-foreground transition-colors hover:text-foreground"
                >
                  {inner}
                </a>
              ) : (
                <span className="flex min-w-0 text-sm font-normal text-muted-foreground">
                  {inner}
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </React.Fragment>
          )
        })}
      </span>
      {/* Collapsed trail — shown only when narrow. The native BreadcrumbEllipsis
          with a dropdown of the folded ancestor pages. */}
      <span className="hidden items-center gap-2 @max-[44rem]/ch:flex">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Show ancestor pages"
            className="flex items-center text-muted-foreground transition-colors outline-none hover:text-foreground"
          >
            <BreadcrumbEllipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {items.map((item, i) => {
              const Icon = item.icon ? icons[item.icon] : null
              const content = (
                <span className="flex items-center gap-1.5">
                  {Icon ? <Icon className="size-4 shrink-0" /> : null}
                  {item.label}
                </span>
              )
              return item.href ? (
                <DropdownMenuItem key={`${item.label}-${i}`} asChild>
                  <a href={item.href}>{content}</a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={`${item.label}-${i}`} disabled>
                  {content}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </span>
    </>
  )
}
