"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Progress } from "@workspace/ui/components/progress"
import { Text } from "@workspace/ui/components/text"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Shared card chrome for every Insight template — flat (no shadow), small text,
 * tight gaps. The Insight section just pins whatever template it's handed; the
 * card lives here so each template is self-contained and droppable anywhere.
 */
function InsightCard({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-slot="sidebar-insight-card"
      className={cn("shrink-0 gap-2 p-3 text-xs shadow-none", className)}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Template 1 — Media: thumbnail + title + clamped description         */
/* ------------------------------------------------------------------ */

export interface InsightMediaProps {
  title: string
  description: string
  /** Optional image node; falls back to a grey placeholder block. */
  image?: React.ReactNode
}

/** Promo / tip card: a square thumbnail beside a 1-line title + 3-line body. */
export function InsightMedia({ title, description, image }: InsightMediaProps) {
  return (
    <InsightCard>
      <div className="flex gap-2.5">
        <div
          aria-hidden={image == null ? true : undefined}
          className="size-14 shrink-0 overflow-hidden rounded-md bg-muted"
        >
          {image}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Text variant="small" className="truncate">
            {title}
          </Text>
          <p className="line-clamp-3 text-muted-foreground">{description}</p>
        </div>
      </div>
    </InsightCard>
  )
}

/* ------------------------------------------------------------------ */
/* Template 2 — Checklist: read-only task list with real checkboxes    */
/* ------------------------------------------------------------------ */

export interface InsightChecklistItem {
  label: string
  done?: boolean
}

export interface InsightChecklistProps {
  title: string
  items: InsightChecklistItem[]
}

/**
 * Onboarding / task card: a title with a done/total count and a list of tasks
 * rendered with the real Checkbox (display-only — not focusable, not togglable).
 * Done items read muted + struck through.
 */
export function InsightChecklist({ title, items }: InsightChecklistProps) {
  const done = items.filter((item) => item.done).length
  return (
    <InsightCard>
      <div className="flex items-center justify-between gap-2">
        <Text variant="small" className="truncate">
          {title}
        </Text>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {done}/{items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <Checkbox
              defaultChecked={item.done}
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none shrink-0"
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                item.done
                  ? "text-muted-foreground line-through"
                  : "text-foreground",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </InsightCard>
  )
}

/* ------------------------------------------------------------------ */
/* Template 3 — Progress: title + meta + bar + full-width action       */
/* ------------------------------------------------------------------ */

export interface InsightProgressProps {
  title: string
  /** Right-aligned context, e.g. "15 days left". */
  meta: string
  /** Bar fill, 0–100. */
  value: number
  actionLabel: string
  onAction?: () => void
}

/**
 * Trial / usage card: a title with right-aligned meta, a brand-green progress
 * bar and a full-width action button (the "Free trial → Upgrade" pattern).
 */
export function InsightProgress({
  title,
  meta,
  value,
  actionLabel,
  onAction,
}: InsightProgressProps) {
  return (
    <InsightCard className="gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Text variant="small" className="truncate">
          {title}
        </Text>
        <span className="shrink-0 text-muted-foreground">{meta}</span>
      </div>
      <Progress value={value} aria-label={title} />
      <Button variant="outline" size="sm" className="w-full" onClick={onAction}>
        {actionLabel}
      </Button>
    </InsightCard>
  )
}
