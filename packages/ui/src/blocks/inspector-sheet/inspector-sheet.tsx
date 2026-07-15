"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { InspectorBody } from "./inspector-body"
import type { InspectorBadge } from "./inspector-body-header"
import type { InspectorFlagValue } from "./inspector-flag-picker"
import type { InspectorFooterProps } from "./inspector-footer"
import { InspectorHeader, type InspectorCopyTarget } from "./inspector-header"
import { InspectorRail, type InspectorTab } from "./inspector-rail"

export interface InspectorSheetProps {
  /** Exactly two ancestor crumbs shown in the header (root-first). */
  breadcrumb: readonly [string, string]
  /** Navigate to the previous item. Omit to disable (first item). */
  onPrevious?: () => void
  /** Navigate to the next item. Omit to disable (last item). */
  onNext?: () => void
  /** Copy dropdown in the header (link / number / id). */
  onCopy?: (what: InspectorCopyTarget) => void
  /** Maximize2 "Switch layout" affordance in the header. */
  onSwitchLayout?: () => void
  /** X "Close" affordance in the header. */
  onClose?: () => void

  /** Editable record name shown in the body header. */
  name: string
  onNameChange: (name: string) => void
  /** Flag/tone picker shown in the body header. */
  flag: InspectorFlagValue
  onFlagChange: (flag: InspectorFlagValue) => void
  /** Optional posting-status badge shown next to the name. */
  badge?: InspectorBadge

  /** Active rail tab. Defaults to `"details"`. */
  activeTab?: InspectorTab
  onTabChange?: (tab: InspectorTab) => void
  /** Body content per tab. Missing tabs render nothing. */
  content?: Partial<Record<InspectorTab, React.ReactNode>>
  /** Optional sticky decline/approve footer. Omitted → no footer. */
  footer?: InspectorFooterProps

  className?: string
}

/**
 * InspectorSheet — the reusable right-docked record detail surface: a fixed
 * 40px header, then a flexible body row of `InspectorBody` (name/flag +
 * per-tab content) and a fixed `InspectorRail` (w-12, tab switcher). Fills its
 * parent; layout/positioning (docking, resize) is the consumer's concern.
 */
export function InspectorSheet({
  breadcrumb,
  onPrevious,
  onNext,
  onCopy,
  onSwitchLayout,
  onClose,
  name,
  onNameChange,
  flag,
  onFlagChange,
  badge,
  activeTab = "details",
  onTabChange,
  content,
  footer,
  className,
}: InspectorSheetProps) {
  return (
    <div
      data-slot="inspector-sheet"
      className={cn("flex h-full min-h-0 w-full flex-col", className)}
    >
      <InspectorHeader
        breadcrumb={breadcrumb}
        onPrevious={onPrevious}
        onNext={onNext}
        onCopy={onCopy}
        onSwitchLayout={onSwitchLayout}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1">
        <InspectorBody
          name={name}
          onNameChange={onNameChange}
          flag={flag}
          onFlagChange={onFlagChange}
          badge={badge}
          content={content?.[activeTab]}
          footer={footer}
        />
        <InspectorRail activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </div>
  )
}
