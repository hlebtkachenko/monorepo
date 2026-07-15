"use client"

import * as React from "react"

import { formatMoney } from "@workspace/ui/lib/format-number"
import { cn } from "@workspace/ui/lib/utils"

import { InspectorSection } from "./inspector-section"

export interface InspectorMoneyRow {
  label: string
  /** MAJOR units (e.g. `12400` → 12 400 Kč). */
  amount: number
  /** ISO-4217 for this row; falls back to the section `currency`. */
  currency?: string
  /** Muted second line under the label (e.g. a rate note). */
  note?: string
  /** Render as the emphasised grand-total row (top rule, bold). */
  emphasis?: boolean
}

export interface InspectorMoneyTotalsProps {
  title?: string
  rows: InspectorMoneyRow[]
  /** Default ISO-4217 for rows without their own. Defaults to `"CZK"`. */
  currency?: string
  className?: string
}

function formatMoneyMajor(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—"
  return formatMoney({ amount: BigInt(Math.round(amount * 100)), currency })
}

/**
 * InspectorMoneyTotals — a money breakdown that sits between the key details and
 * a details table: `label … amount` rows with right-aligned tabular figures, an
 * optional muted note per row, and an emphasised grand-total row separated by a
 * hairline. Body text size and border tokens match every other section (no
 * bespoke sizing). Read-only — totals are derived. Data-in via `rows`.
 */
export function InspectorMoneyTotals({
  title,
  rows,
  currency = "CZK",
  className,
}: InspectorMoneyTotalsProps) {
  return (
    <InspectorSection
      title={title}
      className={className}
      contentClassName="flex flex-col gap-1"
    >
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className={cn(
            "flex items-baseline justify-between gap-3 text-sm",
            row.emphasis &&
              "mt-1 border-t border-border-subtle pt-2 font-semibold",
          )}
        >
          <div className="min-w-0">
            <span
              className={cn(
                "truncate",
                !row.emphasis && "text-muted-foreground",
              )}
            >
              {row.label}
            </span>
            {row.note ? (
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {row.note}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 tabular-nums">
            {formatMoneyMajor(row.amount, row.currency ?? currency)}
          </span>
        </div>
      ))}
    </InspectorSection>
  )
}
