"use client"

import * as React from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"

export interface ContentHeaderBreadcrumbItem {
  /** Crumb label. */
  label: string
  /** Navigation target. Omit for a non-navigable ancestor (rendered inert). */
  href?: string
}

export interface ContentHeaderBreadcrumbProps {
  /** Ancestor trail, root-first. The current page is the Title, not a crumb. */
  items: ContentHeaderBreadcrumbItem[]
}

/**
 * ContentHeaderBreadcrumb — the ancestor trail, shown left of the title. Data
 * in (a flat `{label, href?}[]`), never nodes. Hidden below `lg` (the 45px
 * header is a single row). The last item ends with a trailing separator that
 * leads into the Title.
 */
export function ContentHeaderBreadcrumb({
  items,
}: ContentHeaderBreadcrumbProps) {
  if (items.length === 0) return null
  return (
    <Breadcrumb className="hidden min-w-0 shrink lg:flex">
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, i) => (
          <React.Fragment key={`${item.label}-${i}`}>
            <BreadcrumbItem className="min-w-0">
              {item.href ? (
                <BreadcrumbLink href={item.href} className="truncate">
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">
                  {item.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
