"use client"

import * as React from "react"
import { addDays, isSameDay, startOfMonth } from "date-fns"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Card, CardContent, CardFooter } from "@workspace/ui/components/card"

interface DatePickerPreset {
  label: string
  /** Offset in days from today. */
  days: number
}

const DEFAULT_PRESETS: DatePickerPreset[] = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "In 2 weeks", days: 14 },
]

interface DatePickerProps {
  value?: Date
  defaultValue?: Date
  onValueChange?: (date: Date | undefined) => void
  /** Preset list. Defaults to the shadcn set; pass `[]` to hide presets. */
  presets?: DatePickerPreset[]
  /**
   * `vertical` (default) stacks the presets below the calendar; `horizontal`
   * places them in a column to the left of the calendar.
   */
  orientation?: "vertical" | "horizontal"
  className?: string
}

/**
 * The shadcn "Calendar with presets" date picker as one component — a Card
 * wrapping a Calendar with a preset list. Faithful to the base-UI example
 * (controlled month so presets navigate, `fixedWeeks`, dropdown caption).
 * Uses our surface radius (`rounded-lg`) and a 2px cell gap, both scoped to the
 * picker. Controlled or uncontrolled on the selected date.
 */
function DatePicker({
  value,
  defaultValue,
  onValueChange,
  presets = DEFAULT_PRESETS,
  orientation = "vertical",
  className,
}: DatePickerProps) {
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(
    defaultValue,
  )
  const date = value !== undefined ? value : internalDate

  const [month, setMonth] = React.useState<Date>(() =>
    startOfMonth(date ?? new Date()),
  )

  // Year range for the caption dropdown: wide enough for birthdates back and
  // near-future scheduling forward.
  const thisYear = new Date().getFullYear()

  const select = React.useCallback(
    (next: Date | undefined) => {
      if (value === undefined) setInternalDate(next)
      onValueChange?.(next)
    },
    [value, onValueChange],
  )

  const selectPreset = (days: number) => {
    const next = addDays(new Date(), days)
    select(next)
    setMonth(startOfMonth(next))
  }

  const calendar = (
    <Calendar
      mode="single"
      selected={date}
      onSelect={select}
      month={month}
      onMonthChange={setMonth}
      captionLayout="dropdown"
      startMonth={new Date(thisYear - 100, 0)}
      endMonth={new Date(thisYear + 10, 11)}
      fixedWeeks
      // Scoped to this picker (the shared Calendar keeps its own spacing):
      // 2px gap between cells both axes, and +4px below the weekday header.
      className="p-0 [&_.rdp-week]:mt-0.5 [&_.rdp-week]:gap-0.5 [&_.rdp-weekdays]:mb-1 [&_.rdp-weekdays]:gap-0.5"
    />
  )

  const presetButtons = presets.map((preset, index) => {
    const selected = !!date && isSameDay(date, addDays(new Date(), preset.days))
    return (
      <Button
        key={preset.label}
        type="button"
        // The active preset flips to the filled variant, matching the selected
        // calendar day.
        variant={selected ? "default" : "outline"}
        size="sm"
        aria-pressed={selected}
        // In the vertical grid a lone trailing preset spans the row; harmless in
        // the horizontal column (flex item, no grid track to span).
        className={cn(
          index === presets.length - 1 &&
            presets.length % 2 === 1 &&
            "col-span-2",
        )}
        onClick={() => selectPreset(preset.days)}
      >
        {preset.label}
      </Button>
    )
  })

  if (orientation === "horizontal") {
    // Not a <Card>: its flex-col + `py` model fights a full-height grey preset
    // column. Mirror the card surface directly so both panels own their padding
    // and the divider/grey bg span the full height.
    return (
      <div
        className={cn(
          "flex w-fit overflow-hidden rounded-lg bg-card text-sm text-card-foreground ring-1 ring-foreground/10",
          className,
        )}
      >
        {presets.length > 0 ? (
          <div className="flex flex-col gap-2 border-r bg-muted/50 p-3">
            {presetButtons}
          </div>
        ) : null}
        <div className="p-3">{calendar}</div>
      </div>
    )
  }

  return (
    <Card size="sm" className={cn("w-fit rounded-lg", className)}>
      <CardContent>{calendar}</CardContent>
      {presets.length > 0 ? (
        <CardFooter className="grid grid-cols-2 gap-2 border-t">
          {presetButtons}
        </CardFooter>
      ) : null}
    </Card>
  )
}

export { DatePicker, DEFAULT_PRESETS }
export type { DatePickerProps, DatePickerPreset }
