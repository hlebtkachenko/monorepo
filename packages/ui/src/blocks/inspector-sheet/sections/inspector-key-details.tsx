"use client"

import * as React from "react"

import { format, isValid, parseISO } from "date-fns"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { DatePicker } from "@workspace/ui/components/date-picker"
import { Input } from "@workspace/ui/components/input"
import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsList,
} from "@workspace/ui/components/input-tags"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { CalendarIcon } from "@workspace/ui/lib/icons"
import { formatMoney } from "@workspace/ui/lib/format-number"
import { cn } from "@workspace/ui/lib/utils"

import { useInspectorEditing } from "./inspector-edit-context"

type Option = { value: string; label: string }

export type InspectorKeyLineType =
  "text" | "number" | "money" | "date" | "select" | "badge" | "tags"

/** Split a comma-joined tag string into a clean list. */
function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}

export interface InspectorKeyLine {
  label: string
  /** Money is MAJOR units (e.g. `12400` → 12 400 Kč). */
  value: string | number | null | undefined
  /** Leading glyph next to the label. */
  icon?: IconName
  /** Editor/display kind. Defaults to `"text"`. */
  type?: InspectorKeyLineType
  options?: Option[]
  /** ISO-4217 for `type: "money"`. Defaults to `"CZK"`. */
  currency?: string
  badgeVariant?: React.ComponentProps<typeof Badge>["variant"]
  placeholder?: string
  /** Static line — no click-to-edit affordance. */
  readOnly?: boolean
  /**
   * A trailing button next to the (text) editor, same height as the input —
   * e.g. "Načíst z ARES" beside an IČO field. Receives the current value.
   */
  action?: { label: string; icon?: IconName; onClick: (value: string) => void }
  onChange?: (value: string) => void
  /**
   * Fired when the value SETTLES — input blur / Enter, or a select / date pick —
   * with the final value, and only when it actually changed from the incoming
   * value. Unlike `onChange` (which fires on every keystroke), this is the commit
   * boundary: persist here so a save + re-render can't tear down the still-open
   * editor mid-edit and drop keystrokes.
   */
  onCommit?: (value: string) => void
}

export interface InspectorKeyDetailsProps {
  /** Optional heading above the lines. */
  title?: string
  lines: InspectorKeyLine[]
  className?: string
}

function formatMoneyMajor(value: unknown, currency = "CZK"): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "—"
  return formatMoney({ amount: BigInt(Math.round(n * 100)), currency })
}

function displayText(line: InspectorKeyLine): string | null {
  const { value, type = "text" } = line
  if (value == null || value === "") return null
  if (type === "money") return formatMoneyMajor(value, line.currency)
  if (type === "select" || type === "badge") {
    return (
      line.options?.find((o) => o.value === String(value))?.label ??
      String(value)
    )
  }
  if (type === "tags") return splitTags(String(value)).join(", ")
  return String(value)
}

/** Date field editor — our Calendar in a Popover, not a native date input. */
function DateEditor({
  value,
  autoOpen,
  placeholder,
  onCommit,
}: {
  value: string
  autoOpen: boolean
  placeholder?: string
  onCommit: (value: string) => void
}) {
  const [open, setOpen] = React.useState(autoOpen)
  const parsed = value ? parseISO(value) : undefined
  const date = parsed && isValid(parsed) ? parsed : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start font-normal"
        >
          <CalendarIcon aria-hidden className="text-muted-foreground" />
          {value ? (
            value
          ) : (
            <span className="text-muted-foreground">
              {placeholder ?? "Pick a date"}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <DatePicker
          value={date}
          onValueChange={(next) => {
            onCommit(next ? format(next, "yyyy-MM-dd") : "")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Tags field editor — our InputTags chips, not free text. */
function TagsEditor({
  value,
  placeholder,
  onCommit,
}: {
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  const tags = splitTags(value)
  return (
    <InputTags
      value={tags}
      onValueChange={(next) => onCommit(next.join(","))}
      className="text-sm"
    >
      <InputTagsList className="min-h-8">
        {tags.map((tag, i) => (
          <InputTagsItem key={`${tag}-${i}`} value={tag}>
            {tag}
          </InputTagsItem>
        ))}
        <InputTagsInput placeholder={placeholder} />
      </InputTagsList>
    </InputTags>
  )
}

/**
 * A single value cell. Idle it is plain text with no field chrome; on hover it
 * reveals a subtle grey background (the only affordance that it is editable),
 * and clicking swaps it in place for the matching control (the ClickUp inline
 * feel). The body's global "Edit" toggle folds EVERY editable line open at once
 * — same as clicking each. Read-only lines stay static in both cases.
 */
function InlineValue({ line }: { line: InspectorKeyLine }) {
  const globalEditing = useInspectorEditing()
  const incoming = line.value == null ? "" : String(line.value)
  // `committed` is the optimistic in-place value so an inline edit shows
  // immediately; it resets when the record (and thus the prop) changes — the
  // render-phase reset is React's sanctioned alternative to a sync effect.
  const [committed, setCommitted] = React.useState(incoming)
  const [lastProp, setLastProp] = React.useState(incoming)
  const [localEditing, setLocalEditing] = React.useState(false)

  if (incoming !== lastProp) {
    setLastProp(incoming)
    setCommitted(incoming)
    if (localEditing) setLocalEditing(false)
  }

  const icons = useIcons()
  const text = displayText({ ...line, value: committed })
  const numeric = line.type === "number" || line.type === "money"
  const showEditor = !line.readOnly && (globalEditing || localEditing)

  // Live-commit: the control reads and writes `committed` directly, so a global
  // fold-open and a single-line click share one code path and one value.
  const set = (next: string) => {
    setCommitted(next)
    line.onChange?.(next)
  }
  const closeLocal = () => {
    if (!globalEditing) setLocalEditing(false)
  }
  // Commit boundary: fire onCommit with the settled value (only when it actually
  // changed from `incoming`, so opening and closing a field untouched is a no-op),
  // then close. Callers persist here — never per keystroke — so the save-driven
  // re-render lands after the editor is already gone.
  const commitAndClose = (value: string) => {
    if (value !== incoming) line.onCommit?.(value)
    closeLocal()
  }

  if (line.readOnly) {
    return (
      <div className="px-2 py-1 text-sm">
        {line.type === "badge" && text ? (
          <Badge variant={line.badgeVariant ?? "secondary"}>{text}</Badge>
        ) : (
          <span className={cn(numeric && "tabular-nums")}>
            {text ?? <span className="text-muted-foreground">—</span>}
          </span>
        )}
      </div>
    )
  }

  if (!showEditor) {
    return (
      <button
        type="button"
        onClick={() => setLocalEditing(true)}
        className="flex w-full items-center rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-grey-subtle focus-visible:bg-grey-subtle focus-visible:outline-none"
      >
        {line.type === "badge" && text ? (
          <Badge variant={line.badgeVariant ?? "secondary"}>{text}</Badge>
        ) : text ? (
          <span className={cn("truncate", numeric && "tabular-nums")}>
            {text}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {line.placeholder ?? "Empty"}
          </span>
        )}
      </button>
    )
  }

  if (line.type === "select" || line.type === "badge") {
    return (
      <Select
        // Auto-open only when a single line was clicked open (not on a global
        // fold, where every select opening at once would be chaos).
        defaultOpen={localEditing && !globalEditing}
        value={committed}
        onValueChange={(v) => {
          set(v)
          commitAndClose(v)
        }}
        onOpenChange={(open) => {
          if (!open) closeLocal()
        }}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder={line.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {line.options?.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (line.type === "date") {
    return (
      <DateEditor
        value={committed}
        autoOpen={localEditing && !globalEditing}
        placeholder={line.placeholder}
        onCommit={(v) => {
          set(v)
          commitAndClose(v)
        }}
      />
    )
  }

  if (line.type === "tags") {
    return (
      <TagsEditor
        value={committed}
        placeholder={line.placeholder ?? "Add tag…"}
        onCommit={set}
      />
    )
  }

  const input = (
    <Input
      autoFocus={localEditing && !globalEditing}
      inputMode={numeric ? "decimal" : undefined}
      value={committed}
      placeholder={line.placeholder}
      onChange={(e) => set(e.target.value)}
      onBlur={() => commitAndClose(committed)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className={cn("h-8 text-sm", numeric && "tabular-nums")}
    />
  )

  if (line.action) {
    const ActionIcon = line.action.icon ? icons[line.action.icon] : null
    return (
      <div className="flex items-center gap-2">
        {input}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          // Keep the input focused so committing this line doesn't blur-close it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => line.action?.onClick(committed)}
        >
          {ActionIcon ? <ActionIcon aria-hidden /> : null}
          {line.action.label}
        </Button>
      </div>
    )
  }

  return input
}

/**
 * InspectorKeyDetails — the headline record properties, pushed to the very top
 * of a tab with no box or border. Each line is `[icon] label` on the left and a
 * click-to-edit value on the right that stays plain text until you click it.
 * Data-in via `lines`; no hardcoded labels, values, or colors.
 */
export function InspectorKeyDetails({
  title,
  lines,
  className,
}: InspectorKeyDetailsProps) {
  const icons = useIcons()
  return (
    <section
      data-slot="inspector-key-details"
      className={cn("flex flex-col gap-1", className)}
    >
      {title ? (
        <h3 className="px-2 pb-0.5 text-[0.9375rem] font-semibold">{title}</h3>
      ) : null}
      <div className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-x-2 gap-y-0.5">
        {lines.map((line, i) => {
          const Icon = line.icon ? icons[line.icon] : null
          return (
            <React.Fragment key={`${line.label}-${i}`}>
              <div className="flex min-w-0 items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
                <span className="truncate">{line.label}</span>
              </div>
              <InlineValue line={line} />
            </React.Fragment>
          )
        })}
      </div>
    </section>
  )
}
