"use client"

import * as React from "react"

import { Separator } from "@workspace/ui/components/separator"
import type { IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { ContentHeaderActions } from "./content-header-actions"
import {
  ContentHeaderBreadcrumb,
  type ContentHeaderBreadcrumbItem,
} from "./content-header-breadcrumb"
import { ContentHeaderTitle } from "./content-header-title"
import {
  ContentHeaderViewTabs,
  type ViewTab,
  type ViewTabsConfigure,
} from "./content-header-view-tabs"

// Below this header width the inline views collapse into a single dropdown.
// (Approximate — tuned for a handful of short views; revisit per surface.)
const COLLAPSE_AT = 560

export interface ContentHeaderProps {
  /** The active Page/Subpage name. Scalar string — never a node. */
  title: string
  /** Optional decorative leading icon (closed `IconName`, never a node). */
  titleIcon?: IconName
  /** Optional ancestor trail, shown left of the title. */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /** The visible views after the separator (underline "line" style). */
  viewTabs?: ViewTab[]
  /** Controlled active view value. */
  value?: string
  onValueChange?: (value: string) => void
  /** Optional configure (⋯) menu DATA — show/hide views. Omit to hide it. */
  manageViews?: ViewTabsConfigure
  className?: string
}

/**
 * The content panel's header — general, closed chrome for EVERY page. It sits
 * inside the app-shell's 45px panel header (via the `contentHeader` slot), to
 * the right of the sidebar toggle and left of the assistant toggle.
 *
 * Layout: `⟨breadcrumb⟩ [titleIcon] Title │ ⟨views⟩ ⋯ ……… {Favorite, Configure}`.
 * The action cluster is a fixed internal set — there is NO page-injection slot.
 * When the header is too narrow, the views collapse into a single dropdown.
 * Views are controlled — wire `value`/`onValueChange` to whatever drives the body.
 */
export function ContentHeader({
  title,
  titleIcon,
  breadcrumb,
  viewTabs,
  value,
  onValueChange,
  manageViews,
  className,
}: ContentHeaderProps) {
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

  const hasTabs = viewTabs != null && viewTabs.length > 0
  const hasBreadcrumb = breadcrumb != null && breadcrumb.length > 0

  return (
    <div
      ref={rootRef}
      data-slot="content-header"
      className={cn("flex min-w-0 flex-1 items-center gap-1", className)}
    >
      {hasBreadcrumb ? <ContentHeaderBreadcrumb items={breadcrumb} /> : null}
      <ContentHeaderTitle title={title} titleIcon={titleIcon} />

      {hasTabs ? (
        <>
          {/* Inset divider between the page name and the views. */}
          <Separator orientation="vertical" inset className="mx-2 !h-6" />
          <ContentHeaderViewTabs
            viewTabs={viewTabs}
            value={value}
            onValueChange={onValueChange}
            manageViews={manageViews}
            collapsed={collapsed}
          />
        </>
      ) : null}

      <ContentHeaderActions />
    </div>
  )
}
