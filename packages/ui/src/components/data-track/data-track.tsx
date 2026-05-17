"use client"

import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

export interface DataTrackListItem {
  name: string
  value: number
  href?: string
}

export interface DataTrackBlock {
  key?: string | number
  color?: string
  tooltip?: string
}

export interface DataTrackListProps {
  variant?: "list"
  data: DataTrackListItem[]
  sortOrder?: "ascending" | "descending" | "none"
  valueFormatter?: (value: number) => string
  onValueChange?: (item: DataTrackListItem) => void
  className?: string
}

export interface DataTrackTrackerProps {
  variant: "tracker"
  data: DataTrackBlock[]
  defaultColor?: string
  hoverEffect?: boolean
  className?: string
}

export type DataTrackProps = DataTrackListProps | DataTrackTrackerProps

/**
 * Compact data visualization with two variants:
 * - `list`: a ranked list of labelled values with proportional inline bars
 * - `tracker`: a row of status blocks (uptime / status timeline)
 */
function DataTrack(props: DataTrackProps) {
  if (props.variant === "tracker") {
    return <DataTrackTracker {...props} />
  }
  return <DataTrackList {...props} />
}

function DataTrackList({
  data,
  sortOrder = "descending",
  valueFormatter = (v) => String(v),
  onValueChange,
  className,
}: DataTrackListProps) {
  const sorted = React.useMemo(() => {
    if (sortOrder === "none") return data
    return [...data].sort((a, b) =>
      sortOrder === "ascending" ? a.value - b.value : b.value - a.value,
    )
  }, [data, sortOrder])

  const maxValue = Math.max(...sorted.map((d) => d.value), 0)

  return (
    <div
      data-slot="data-track"
      data-variant="list"
      className={cn("flex w-full flex-col gap-1.5", className)}
    >
      {sorted.map((item, index) => {
        const widthPct =
          maxValue === 0 ? 0 : Math.max((item.value / maxValue) * 100, 2)
        const isInteractive = !!onValueChange

        return (
          <div
            key={item.href ?? item.name ?? index}
            data-slot="data-track-row"
            className="flex items-center justify-between gap-2"
          >
            <div className="relative flex min-w-0 flex-1 items-center">
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-sm bg-primary/10"
                style={{ width: `${widthPct}%` }}
              />
              {/*
                Interactive row uses div + role="button" rather than the
                Button primitive: a row may render an <a> (the href case
                below), and an anchor cannot be nested inside a <button>.
                Keyboard handling (Enter/Space) is wired explicitly.
              */}
              <div
                className={cn(
                  "relative z-10 flex min-w-0 flex-1 items-center rounded-sm px-2 py-1.5 text-sm text-foreground",
                  isInteractive &&
                    "cursor-pointer transition-colors hover:bg-muted/60",
                )}
                role={isInteractive ? "button" : undefined}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={isInteractive ? () => onValueChange(item) : undefined}
                onKeyDown={
                  isInteractive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onValueChange(item)
                        }
                      }
                    : undefined
                }
              >
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-primary underline-offset-4 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.name}
                  </a>
                ) : (
                  <span className="truncate">{item.name}</span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-sm text-foreground tabular-nums">
              {valueFormatter(item.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function DataTrackTracker({
  data,
  defaultColor = "var(--muted-foreground)",
  hoverEffect = false,
  className,
}: DataTrackTrackerProps) {
  return (
    <TooltipProvider>
      <div
        data-slot="data-track"
        data-variant="tracker"
        className={cn("flex w-full gap-0.5", className)}
      >
        {data.map((block, index) => {
          const blockColor = block.color ?? defaultColor
          const inner = (
            <div
              data-slot="data-track-block"
              className={cn(
                "h-8 flex-1 rounded-sm",
                hoverEffect && "transition-opacity hover:opacity-70",
              )}
              style={{ backgroundColor: blockColor }}
            />
          )

          if (block.tooltip) {
            return (
              <Tooltip key={block.key ?? index}>
                <TooltipTrigger asChild>{inner}</TooltipTrigger>
                <TooltipContent side="top">{block.tooltip}</TooltipContent>
              </Tooltip>
            )
          }

          return (
            <React.Fragment key={block.key ?? index}>{inner}</React.Fragment>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

export { DataTrack }
