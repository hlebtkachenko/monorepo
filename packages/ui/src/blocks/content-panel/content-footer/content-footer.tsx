"use client"

import { Button } from "@workspace/ui/components/button"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Button treatment for a footer action. Closed set — maps 1:1 onto Button's
 * `variant`.
 */
export type ContentFooterActionVariant =
  "default" | "secondary" | "ghost" | "destructive"

/** One bulk action in selection mode. Plain data — never a node. */
export interface ContentFooterAction {
  id: string
  label: string
  /** Icon-pack glyph name (closed `IconName` union). Omit for text-only. */
  icon?: IconName
  /** Button treatment. Default `"secondary"`. */
  variant?: ContentFooterActionVariant
  disabled?: boolean
  onSelect: () => void
}

/** Selection surface — bulk actions over the chosen rows. */
export interface ContentFooterSelection {
  /** How many items are selected. The footer is hidden when `0`. */
  count: number
  actions: ContentFooterAction[]
  /** Clears the selection (the leading ✕). */
  onClear: () => void
  /** Override the `"{count} selected"` status text. */
  countLabel?: (count: number) => string
}

/** Changed-data surface — Save / Discard for a dirty record. */
export interface ContentFooterSave {
  /** Whether the record has unsaved edits. The footer is hidden when `false`. */
  dirty: boolean
  /** A save is in flight — both buttons disable, Save shows `savingLabel`. */
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
  message?: string
  saveLabel?: string
  savingLabel?: string
  discardLabel?: string
}

export interface ContentFooterProps {
  /** Bulk-selection surface. Mutually exclusive with `save`. */
  selection?: ContentFooterSelection
  /** Changed-data surface. Mutually exclusive with `selection`. */
  save?: ContentFooterSave
  className?: string
}

const BAR =
  "flex shrink-0 items-center gap-2 border-t border-border-subtle bg-shell-surface px-3 py-2"

/**
 * ContentFooter — the single sticky bottom action surface of the Content Panel.
 * A layout row (nothing scrolls below it), optional + self-hiding. Two
 * mutually-exclusive DATA-driven modes: `selection` (bulk actions over N rows)
 * and `save` (Unsaved changes / Discard / Save). Absorbs the retired-from-CP
 * `ActionBar` role — but as a normal-flow bar, not a floating overlay, so none
 * of the roving-focus / portal / clearance machinery applies.
 */
export function ContentFooter({
  selection,
  save,
  className,
}: ContentFooterProps) {
  const icons = useIcons()

  if (selection && save && process.env.NODE_ENV !== "production") {
    throw new Error(
      "ContentFooter: pass either `selection` or `save`, not both.",
    )
  }

  // Selection precedence (also the prod resolution when both are passed).
  if (selection && selection.count > 0) {
    return (
      <div
        data-slot="content-footer"
        role="group"
        aria-label="Actions"
        className={cn(BAR, className)}
      >
        <span className="text-sm font-medium tabular-nums">
          {selection.countLabel?.(selection.count) ??
            `${selection.count} selected`}
        </span>
        <IconButton
          icon="X"
          aria-label="Clear selection"
          tooltip="Clear"
          tooltipSide="top"
          onClick={selection.onClear}
        />
        <div className="ml-auto flex items-center gap-1.5">
          {selection.actions.map((action) => {
            const Icon = action.icon ? icons[action.icon] : null
            return (
              <Button
                key={action.id}
                size="sm"
                variant={action.variant ?? "secondary"}
                disabled={action.disabled}
                onClick={action.onSelect}
                data-action={action.id}
              >
                {Icon ? <Icon /> : null}
                {action.label}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  if (save && save.dirty === true && !selection) {
    return (
      <div
        data-slot="content-footer"
        role="group"
        aria-label="Unsaved changes"
        className={cn(BAR, className)}
      >
        <span className="text-sm text-muted-foreground">
          {save.message ?? "Unsaved changes"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={save.saving}
            onClick={save.onDiscard}
          >
            {save.discardLabel ?? "Discard"}
          </Button>
          <Button size="sm" disabled={save.saving} onClick={save.onSave}>
            {save.saving
              ? (save.savingLabel ?? "Saving…")
              : (save.saveLabel ?? "Save changes")}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
