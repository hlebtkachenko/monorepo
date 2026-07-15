"use client"

import * as React from "react"

import { InspectorBodyContent } from "./inspector-body-content"
import {
  InspectorBodyHeader,
  type InspectorBadge,
} from "./inspector-body-header"
import type { InspectorFlagValue } from "./inspector-flag-picker"
import { InspectorFooter, type InspectorFooterProps } from "./inspector-footer"
import { InspectorEditProvider } from "./sections/inspector-edit-context"

export interface InspectorBodyProps {
  name: string
  onNameChange: (name: string) => void
  flag: InspectorFlagValue
  onFlagChange: (flag: InspectorFlagValue) => void
  /** Optional posting-status badge shown next to the name. */
  badge?: InspectorBadge
  content?: React.ReactNode
  /** Optional sticky decline/approve footer. Omitted → no footer. */
  footer?: InspectorFooterProps
}

/**
 * InspectorBody — the flexible column left of the rail: name/flag/badge header,
 * the active tab's content, then an optional sticky decline/approve footer. Owns
 * the body-wide edit mode: "Make changes" in the header flips every changeable
 * field on. Edit mode starts idle on mount (a freshly opened inspector always
 * remounts), so no per-record reset is needed — and one keyed on `name` would
 * wrongly cancel edit mode on every rename.
 */
export function InspectorBody({
  name,
  onNameChange,
  flag,
  onFlagChange,
  badge,
  content,
  footer,
}: InspectorBodyProps) {
  const [editing, setEditing] = React.useState(false)

  return (
    <InspectorEditProvider editing={editing}>
      <div
        data-slot="inspector-body"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <InspectorBodyHeader
          name={name}
          onNameChange={onNameChange}
          flag={flag}
          onFlagChange={onFlagChange}
          badge={badge}
          editing={editing}
          onEditingChange={setEditing}
        />
        <InspectorBodyContent>{content}</InspectorBodyContent>
        {footer ? <InspectorFooter {...footer} /> : null}
      </div>
    </InspectorEditProvider>
  )
}
