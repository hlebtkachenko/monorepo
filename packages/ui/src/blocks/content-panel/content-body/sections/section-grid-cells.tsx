"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { CheckIcon } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The grid select-column checkbox — a dedicated variant (NOT the global
 * `Checkbox`, whose restyle would leak everywhere). Per the table spec:
 * - unchecked: white fill, a `--grid-checkbox-border` (#8d8d8d) border INSIDE
 *   the box (border-box, so checked stays the same size),
 * - checked: no border, filled with the brand token, a SMALL check glyph
 *   (`size-2.5`, not the oversized global one),
 * - header uses it in binary mode only (checked = all, else empty; never an
 *   indeterminate dash) — just pass a boolean `checked`.
 */
export function GridCheckbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="grid-checkbox"
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-grid-checkbox-border bg-background transition-colors outline-none",
        "data-checked:border-transparent data-checked:bg-brand-primary-light dark:data-checked:bg-brand-primary-dark",
        "data-checked:text-brand-mono-light dark:data-checked:text-brand-mono-dark",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current [&>svg]:size-3 [&>svg]:stroke-[3]">
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

/**
 * The shared right-aligned tabular-number body cell — the single source of the
 * number-cell presentation used by BOTH the flat Table section
 * (`section-table-renderer`) and the Pivot section (`section-pivot-table-renderer`).
 * Keeping it here means a change to how a numeric cell looks lands in one place
 * and both sections inherit it (no per-section restyle). The wrapping grid-cell
 * chrome — borders, width, pin, focus ring, alignment padding — is owned by
 * `DataGridView`; this is only the cell CONTENT.
 */
export function GridNumberCell({
  children,
  negative,
  className,
}: {
  children: React.ReactNode
  /** Tint the value with the destructive token (e.g. a negative amount). */
  negative?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "w-full text-right tabular-nums",
        negative && "text-destructive",
        className,
      )}
    >
      {children}
    </div>
  )
}
