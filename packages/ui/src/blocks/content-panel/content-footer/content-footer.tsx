"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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

/** One item in a footer action's split-button dropdown menu (e.g. Export →
 *  "Copy to clipboard"). Plain data — never a node. */
export interface ContentFooterActionButton {
  id: string
  label: string
  icon?: IconName
  variant?: ContentFooterActionVariant
  onSelect: () => void
}

/** One bulk action in selection mode. Plain data — never a node. */
export interface ContentFooterAction {
  id: string
  label: string
  /** Icon-pack glyph name (closed `IconName` union). Omit for text-only. */
  icon?: IconName
  /** Button treatment. Default `"secondary"`. */
  variant?: ContentFooterActionVariant
  disabled?: boolean
  /** Primary click handler — also the primary button of a split action when
   *  `menu` is set. */
  onSelect?: () => void
  /**
   * When present, the action is a SPLIT BUTTON (shadcn ButtonGroup + DropdownMenu):
   * the primary button fires `onSelect`, and an attached chevron opens a dropdown
   * of these items (e.g. Export as CSV | ▾ → Copy to clipboard).
   */
  menu?: ContentFooterActionButton[]
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
  /** Whether the record has unsaved edits. */
  dirty: boolean
  /** A save is in flight — both buttons disable, Save shows `savingLabel`. */
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
  message?: string
  saveLabel?: string
  savingLabel?: string
  discardLabel?: string
  /** Optional page action that remains visible when the form is clean. */
  persistentLink?: { label: string; href: string }
  /** Optional local action that remains visible when the form is clean. */
  persistentAction?: { label: string; onSelect: () => void }
}

export interface ContentFooterProps {
  /** Bulk-selection surface. Mutually exclusive with `save`. */
  selection?: ContentFooterSelection
  /** Changed-data surface. Mutually exclusive with `selection`. */
  save?: ContentFooterSave
  className?: string
}

const BAR =
  "flex shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle bg-shell-surface px-3 py-2"

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
  const barRef = React.useRef<HTMLDivElement>(null)

  const selectionActive = !!selection && selection.count > 0
  const saveActive =
    !!save &&
    (save.dirty || !!save.persistentLink || !!save.persistentAction) &&
    !selection
  const active = selectionActive || saveActive

  // While the bar is shown it covers the bottom of the Content Panel, so publish
  // its height as `--app-statusbar-clearance` — toasts (and any other consumer of
  // the token) lift clear of it, and drop back to the default once it hides. Same
  // mechanism the workspace status bar uses.
  React.useEffect(() => {
    const root = document.documentElement
    if (!active) {
      root.style.removeProperty("--app-statusbar-clearance")
      return
    }
    const height = barRef.current?.offsetHeight ?? 52
    root.style.setProperty(
      "--app-statusbar-clearance",
      `calc(var(--shell-bottom-inset, 0px) + ${height}px + 8px)`,
    )
    return () => {
      root.style.removeProperty("--app-statusbar-clearance")
    }
  }, [active, selection?.count])

  if (selection && save && process.env.NODE_ENV !== "production") {
    throw new Error(
      "ContentFooter: pass either `selection` or `save`, not both.",
    )
  }

  // Selection precedence (also the prod resolution when both are passed).
  if (selection && selection.count > 0) {
    return (
      <div
        ref={barRef}
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
            const variant = action.variant ?? "secondary"
            const primary = (
              <Button
                type="button"
                variant={variant}
                disabled={action.disabled}
                onClick={action.onSelect}
                data-action={action.id}
              >
                {Icon ? <Icon /> : null}
                {action.label}
              </Button>
            )
            // A split action (shadcn ButtonGroup + DropdownMenu): the primary
            // button fires `onSelect`; the attached chevron opens the menu.
            if (action.menu && action.menu.length > 0) {
              const Chevron = icons.ChevronDown
              return (
                <ButtonGroup key={action.id} data-action={action.id}>
                  {primary}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant={variant}
                        disabled={action.disabled}
                        aria-label={`More ${action.label} options`}
                      >
                        <Chevron />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {action.menu.map((item) => {
                        const ItemIcon = item.icon ? icons[item.icon] : null
                        return (
                          <DropdownMenuItem
                            key={item.id}
                            onSelect={item.onSelect}
                            className="gap-1.5"
                          >
                            {ItemIcon ? <ItemIcon /> : null}
                            {item.label}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ButtonGroup>
              )
            }
            return <React.Fragment key={action.id}>{primary}</React.Fragment>
          })}
        </div>
      </div>
    )
  }

  if (
    save &&
    (save.dirty || save.persistentLink || save.persistentAction) &&
    !selection
  ) {
    return (
      <div
        ref={barRef}
        data-slot="content-footer"
        role="group"
        aria-label={save.dirty ? "Unsaved changes" : "Page actions"}
        className={cn(BAR, className)}
      >
        {save.persistentLink ? (
          <Button asChild variant="outline">
            <a href={save.persistentLink.href}>{save.persistentLink.label}</a>
          </Button>
        ) : null}
        {save.persistentAction ? (
          <Button
            type="button"
            variant="outline"
            onClick={save.persistentAction.onSelect}
          >
            {save.persistentAction.label}
          </Button>
        ) : null}
        {save.dirty ? (
          <>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {save.message ?? "Unsaved changes"}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                disabled={save.saving}
                onClick={save.onDiscard}
              >
                {save.discardLabel ?? "Discard"}
              </Button>
              <Button
                type="button"
                disabled={save.saving}
                onClick={save.onSave}
              >
                {save.saving
                  ? (save.savingLabel ?? "Saving…")
                  : (save.saveLabel ?? "Save changes")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    )
  }

  return null
}
