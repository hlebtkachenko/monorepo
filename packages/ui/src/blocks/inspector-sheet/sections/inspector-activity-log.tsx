"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { InspectorSection } from "./inspector-section"

export interface InspectorActivityLogEntry {
  id: string
  /** What changed — a field name or an event ("Attachment", "Amount", …). */
  field?: string
  /** Value before the change (or "—" for an addition). */
  before?: React.ReactNode
  /** Value after the change (or "—" for a removal). */
  after?: React.ReactNode
  /** When it happened. */
  when: string
  /** Who did it. */
  by: string
  /** Revert handler — omit to render no Undo for this row. */
  onUndo?: () => void
}

export interface InspectorActivityLogProps {
  title?: string
  entries: InspectorActivityLogEntry[]
  emptyText?: string
  className?: string
}

const GRID = "grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-x-3"

/**
 * InspectorActivityLog — the Activity tab is a single audit-log table, not a
 * comment feed: one row per change to this record (a field edit, an attachment
 * added / deleted) with Before · After · When · By whom, and an Undo button that
 * reverts that specific change. Data-in via `entries`; no hardcoding.
 */
export function InspectorActivityLog({
  title = "Activity",
  entries,
  emptyText = "No activity yet.",
  className,
}: InspectorActivityLogProps) {
  const icons = useIcons()
  const Undo = icons.RotateCcw

  return (
    <InspectorSection title={title} className={className}>
      <div className="overflow-hidden rounded-md border border-border-subtle text-sm">
        <div
          className={cn(
            GRID,
            "border-b border-border-subtle px-3 py-2 text-xs font-medium text-muted-foreground",
          )}
        >
          <span>Before</span>
          <span>After</span>
          <span>When</span>
          <span>By</span>
          <span className="sr-only">Undo</span>
        </div>
        {entries.length === 0 ? (
          <p className="px-3 py-4 text-center text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                GRID,
                "border-b border-border-subtle px-3 py-2 last:border-b-0",
              )}
            >
              <div className="min-w-0">
                {entry.field ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {entry.field}
                  </span>
                ) : null}
                <span className="block truncate">{entry.before ?? "—"}</span>
              </div>
              <span className="min-w-0 truncate">{entry.after ?? "—"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {entry.when}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {entry.by}
              </span>
              {entry.onUndo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={entry.onUndo}
                >
                  <Undo aria-hidden />
                  Undo
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))
        )}
      </div>
    </InspectorSection>
  )
}
