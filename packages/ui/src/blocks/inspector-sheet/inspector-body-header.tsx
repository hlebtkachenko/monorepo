"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import { useIcons } from "@workspace/ui/icon-packs"

import {
  InspectorFlagPicker,
  type InspectorFlagValue,
} from "./inspector-flag-picker"

/** Hard cap on the editable record name. */
const MAX_NAME_LENGTH = 120

/**
 * Optional status badge shown next to the record name. Reflects the posting
 * state: a `Draft` (secondary) or a `Rejected` (destructive). A posted record
 * carries no badge, so the prop is simply omitted.
 */
export interface InspectorBadge {
  label: string
  variant: "secondary" | "destructive"
}

export interface InspectorBodyHeaderProps {
  name: string
  onNameChange: (name: string) => void
  flag: InspectorFlagValue
  onFlagChange: (flag: InspectorFlagValue) => void
  /** Optional posting-status badge shown next to the name. */
  badge?: InspectorBadge
  /** Whether the body's changeable fields are in edit mode. */
  editing: boolean
  onEditingChange: (editing: boolean) => void
}

/**
 * InspectorBodyHeader — flag picker, the record name (a prominent title, or a
 * capped input while editing) with an optional status badge hugging it, and the
 * "Make changes" toggle that flips the body between idle and edit mode. Enter or
 * blur commits a trimmed non-empty name; Escape reverts. The bar is 43px — 1px
 * taller than the ContentToolbar row, matched by `InspectorFooter`.
 */
export function InspectorBodyHeader({
  name,
  onNameChange,
  flag,
  onFlagChange,
  badge,
  editing,
  onEditingChange,
}: InspectorBodyHeaderProps) {
  const icons = useIcons()
  const SquarePen = icons.SquarePen

  // Draft only backs the input while editing; idle renders `name` directly, and
  // every entry into edit mode re-seeds the draft — so no name→draft sync effect
  // is needed.
  const [draft, setDraft] = React.useState(name)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed.length > 0 && trimmed !== name) onNameChange(trimmed)
    setDraft(trimmed.length > 0 ? trimmed : name)
  }

  const toggleEditing = () => {
    if (editing) {
      commit()
      onEditingChange(false)
    } else {
      setDraft(name)
      onEditingChange(true)
    }
  }

  return (
    <div
      data-slot="inspector-body-header"
      className="flex h-[43px] shrink-0 items-center gap-2 border-b border-border-subtle px-4"
    >
      <InspectorFlagPicker value={flag} onValueChange={onFlagChange} />

      {/* Name + badge form the left cluster: the badge hugs the name's right
          edge (never pushed to the far side), and the remaining space sits
          after it so the edit toggle anchors to the right. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <InputGroup className="h-8 min-w-0 flex-1">
            <InputGroupInput
              autoFocus
              value={draft}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commit()
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  setDraft(name)
                  onEditingChange(false)
                }
              }}
              className="text-[15px]"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText className="text-xs tabular-nums">
                {draft.length}/{MAX_NAME_LENGTH}
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <>
            {/* Idle: ellipsis marks overflow. Hover: becomes a horizontal
                scroller with a hard-cut edge (no ellipsis) so the full name is
                reachable without leaving the row. */}
            <span className="min-w-0 truncate text-[15px] font-semibold hover:overflow-x-auto hover:text-clip">
              {name}
            </span>
            {badge ? (
              <Badge variant={badge.variant} className="shrink-0">
                {badge.label}
              </Badge>
            ) : null}
          </>
        )}
      </div>

      {/* Bare text affordance (no button box): the label's right edge sits 16px
          from the sheet edge via the row's `px-4` + this button's `px-0`. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleEditing}
        aria-pressed={editing}
        className="shrink-0 gap-1.5 px-0 text-info hover:bg-transparent hover:text-info dark:hover:bg-transparent"
      >
        <SquarePen />
        {editing ? "Done" : "Edit"}
      </Button>
    </div>
  )
}
