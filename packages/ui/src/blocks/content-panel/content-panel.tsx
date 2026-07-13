"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { ContentBody } from "./content-body"
import type { SectionDescriptor } from "./content-body"
import { Inspector } from "./inspector"
import type { InspectorMode } from "./inspector"

export interface ContentPanelProps {
  /** The 36px toolbar row (usually a `ContentToolbar`). Optional. */
  toolbar?: React.ReactNode
  /**
   * An optional band BELOW the toolbar for a filter bar (e.g. the data-table
   * toolbar). Kept separate from the toolbar so the toolbar height never jumps
   * — filters can wrap / grow on their own row. Toggle by passing/omitting it.
   */
  filters?: React.ReactNode
  /**
   * The optional 24px status bar pinned at the bottom (a `ContentStatusBar`).
   * @deprecated Leaving the Content Panel — the status bar is part of the Table
   * section, not the CP. It relocates into the table section on the conform pass.
   * See `.context/archetype-system/03-plan.md`.
   */
  statusBar?: React.ReactNode
  /**
   * The sticky bottom action surface (a `ContentFooter`). Optional; nothing
   * scrolls below it. Replaces the retired floating `actionBar` slot — selection
   * and changed-data (Save / Discard) actions live here.
   */
  footer?: React.ReactNode
  /**
   * The Inspector — detail of the element chosen in the body (an invoice, a
   * transaction, …). Presented two ways (user's choice via `inspectorMode`):
   *   - `"panel"`  → a resizable side panel docked at the body's right edge
   *     (warm `--inspector-surface` bg).
   *   - `"dialog"` → a centred modal (normal white surface).
   * Omit `inspector` (or pass `inspectorOpen=false`) to show neither.
   */
  inspector?: React.ReactNode
  inspectorOpen?: boolean
  inspectorMode?: InspectorMode
  onInspectorOpenChange?: (open: boolean) => void
  /** Title shown in the panel header / dialog header (also the dialog a11y name). */
  inspectorTitle?: React.ReactNode
  /** Extra classes for the scrolling body region. */
  bodyClassName?: string
  /**
   * The body: the ordered Sections that fill it, rendered via ContentBody's
   * closed `SECTION_REGISTRY`. An Archetype composes this whole panel and supplies
   * its sections. Mutually exclusive with the grandfathered `children`.
   */
  sections?: readonly SectionDescriptor[]
  /**
   * @deprecated Legacy free-JSX body. Frozen to the grandfather allowlist in
   * `scripts/governance/archetype-body-allowlist.json`; the `check` CI job
   * rejects any NEW file that passes `children`. Migrate to `sections` (branded
   * Sections), composed by an archetype component.
   */
  children?: React.ReactNode
}

/**
 * The content panel body — everything BELOW the shell's 45px panel header.
 * Vertical stack that fills the panel: a fixed toolbar, an optional filter
 * band, the body row (the scrolling body + an optional Inspector panel beside
 * it), an optional status bar, and the floating action bar. Only the body and
 * the inspector scroll; the chrome rows stay pinned.
 *
 * The shell's panel header (with the page title + tabs via the `contentHeader`
 * slot) sits ABOVE this — this component owns rows 2…n. The Inspector (docked
 * panel / dialog) is delegated to the `Inspector` block.
 */
export function ContentPanel({
  toolbar,
  filters,
  statusBar,
  footer,
  inspector,
  inspectorOpen,
  inspectorMode = "panel",
  onInspectorOpenChange,
  inspectorTitle,
  bodyClassName,
  sections,
  children,
}: ContentPanelProps) {
  return (
    <div data-slot="content-panel" className="flex h-full min-h-0 flex-col">
      {toolbar}
      {filters}
      <div data-slot="content-row" className="flex min-h-0 flex-1">
        {sections != null ? (
          <ContentBody sections={sections} className={bodyClassName} />
        ) : (
          <div
            data-slot="content-body"
            className={cn("min-w-0 flex-1 overflow-auto p-3", bodyClassName)}
          >
            {children}
          </div>
        )}
        <Inspector
          open={inspectorOpen ?? false}
          mode={inspectorMode}
          onOpenChange={onInspectorOpenChange}
          title={inspectorTitle}
        >
          {inspector}
        </Inspector>
      </div>
      {statusBar}
      {footer}
    </div>
  )
}
