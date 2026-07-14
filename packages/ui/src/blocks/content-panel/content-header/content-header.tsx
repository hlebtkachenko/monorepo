"use client"

import { Separator } from "@workspace/ui/components/separator"
import type { IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { ContentHeaderActions } from "./content-header-actions"
import {
  ContentHeaderBackLink,
  type ContentHeaderBackLinkData,
} from "./content-header-back-link"
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

export interface ContentHeaderProps {
  /** The active Page/Subpage name. Scalar string — never a node. */
  title: string
  /** Optional decorative leading icon (closed `IconName`, never a node). */
  titleIcon?: IconName
  /**
   * Optional `‹ Back to {label}` link — the Single archetype only (a record
   * opened from its source list). A vertical separator then leads into the trail.
   */
  backTo?: ContentHeaderBackLinkData
  /** Optional ancestor trail, shown left of the title (crumbs may carry icons). */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /** The visible views after the separator (underline strip, mandatory badges). */
  viewTabs?: ViewTab[]
  /** Controlled active view value. */
  value?: string
  onValueChange?: (value: string) => void
  /** Adds the trailing "+ Add view" button to the views strip. */
  onAddView?: () => void
  /**
   * @deprecated Ignored. The old ⋯ configure menu is gone; view show/hide/pin/
   * save moves into the "+ Add view" dropdown (deferred). Kept so un-migrated
   * callers still type-check.
   */
  manageViews?: ViewTabsConfigure
  className?: string
}

/**
 * The one vertical divider used across the header (native). `mx-2` on top of the
 * row's `gap-2` gives it 16px of breathing room each side — matching the
 * left-edge→title-icon indent (`px-2` + `ml-2`).
 */
function HeaderSeparator() {
  return (
    <Separator orientation="vertical" inset className="mx-2 h-5 shrink-0" />
  )
}

/**
 * The content panel's header — general, closed chrome for EVERY page, in the
 * app-shell's panel header (via the `contentHeader` slot).
 *
 * Layout: `⟨‹ Back to X │⟩ ⟨[icon] trail ›⟩ Title ⟨│ views + Add view⟩ … {Favorite}`.
 * ONE flat flex row with a SINGLE gap between every item (back-link, separators,
 * crumbs, chevrons, title, tabs) — so all gaps are equal. The breadcrumb + title
 * are fixed at the left, the actions are fixed at the right, and the views strip
 * is the flex-grow middle that scrolls horizontally when the row runs out of room
 * (so nothing overlaps). Views are controlled via `value`/`onValueChange`.
 */
export function ContentHeader({
  title,
  titleIcon,
  backTo,
  breadcrumb,
  viewTabs,
  value,
  onValueChange,
  onAddView,
  className,
}: ContentHeaderProps) {
  const hasTabs = viewTabs != null && viewTabs.length > 0
  const hasBreadcrumb = breadcrumb != null && breadcrumb.length > 0

  return (
    <div
      data-slot="content-header"
      // `@container/ch` makes the whole row responsive to ITS OWN width (which
      // shrinks as the sidebar / assistant panels widen), driving the progressive
      // collapse in the back-link, breadcrumb, and view tabs.
      className={cn(
        "@container/ch flex h-full min-w-0 flex-1 items-center gap-2",
        className,
      )}
    >
      {backTo ? (
        <>
          <ContentHeaderBackLink label={backTo.label} href={backTo.href} />
          <HeaderSeparator />
        </>
      ) : null}

      {hasBreadcrumb ? <ContentHeaderBreadcrumb items={breadcrumb} /> : null}
      <ContentHeaderTitle title={title} titleIcon={titleIcon} />

      {hasTabs ? (
        <>
          <HeaderSeparator />
          <ContentHeaderViewTabs
            viewTabs={viewTabs}
            value={value}
            onValueChange={onValueChange}
            onAddView={onAddView}
          />
        </>
      ) : null}

      <ContentHeaderActions />
    </div>
  )
}
