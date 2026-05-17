"use client"

import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

export interface ChartCategoryBarMarker {
  value: number
  tooltip?: string
  showAnimation?: boolean
}

export interface ChartCategoryBarProps extends React.ComponentProps<"div"> {
  values: number[]
  colors?: string[]
  marker?: ChartCategoryBarMarker
  showLabels?: boolean
}

export function ChartCategoryBar({
  values,
  colors,
  marker,
  showLabels = true,
  className,
  ...props
}: ChartCategoryBarProps) {
  const total = values.reduce((sum, v) => sum + v, 0)

  const resolvedColors =
    colors && colors.length > 0
      ? colors
      : CATEGORY_COLORS.slice(0, values.length)

  // Cumulative sums for label positions and marker placement
  const cumulative = values.reduce<number[]>((acc, v) => {
    const prev = acc[acc.length - 1] ?? 0
    return [...acc, prev + v]
  }, [])

  const markerPct =
    marker != null && total > 0
      ? Math.min(Math.max((marker.value / total) * 100, 0), 100)
      : null

  return (
    <TooltipProvider>
      <div
        data-slot="chart-category-bar"
        className={cn("w-full", className)}
        {...props}
      >
        {/* Bar */}
        <div className="relative flex h-3 w-full overflow-hidden rounded-full">
          {values.map((v, i) => {
            const pct = total > 0 ? (v / total) * 100 : 0
            const color = resolvedColors[i % resolvedColors.length]
            return (
              <div
                key={i}
                className="h-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                }}
              />
            )
          })}
        </div>

        {/* Marker */}
        {markerPct !== null && (
          <div className="relative h-4 w-full">
            <div
              className={cn(
                "absolute top-1 -translate-x-1/2",
                marker?.showAnimation &&
                  "transition-[left] duration-500 ease-in-out",
              )}
              style={{ left: `${markerPct}%` }}
            >
              {marker?.tooltip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      aria-label={`Marker at ${marker.value}`}
                      className="h-3 w-3 cursor-default rounded-full border-2 border-background bg-foreground ring-2 ring-foreground"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">{marker.tooltip}</TooltipContent>
                </Tooltip>
              ) : (
                <div
                  aria-label={`Marker at ${marker?.value}`}
                  className="h-3 w-3 rounded-full border-2 border-background bg-foreground ring-2 ring-foreground"
                />
              )}
            </div>
          </div>
        )}

        {/* Labels */}
        {showLabels && (
          <div className="relative mt-1 flex w-full justify-between text-xs text-muted-foreground">
            <span>0</span>
            {cumulative.slice(0, -1).map((cum, i) => {
              const pct = total > 0 ? (cum / total) * 100 : 0
              // Hide labels that are too close to edges
              if (pct < 5 || pct > 95) return null
              return (
                <span
                  key={i}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${pct}%` }}
                >
                  {cum}
                </span>
              )
            })}
            <span>{total}</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
