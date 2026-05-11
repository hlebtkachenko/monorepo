"use client"

import * as React from "react"
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@workspace/ui/lib/utils"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./chart"

type BarVariant = "solid" | "gradient"
type StackType = "default" | "stacked" | "expanded"
type Orientation = "vertical" | "horizontal"

export interface ChartBarProps<TData extends Record<string, unknown>> {
  data: TData[]
  chartConfig: ChartConfig
  xDataKey: keyof TData & string
  className?: string
  barVariant?: BarVariant
  stackType?: StackType
  orientation?: Orientation
  radius?: number
  hideTooltip?: boolean
  hideLegend?: boolean
  hideCartesianGrid?: boolean
}

export function ChartBar<TData extends Record<string, unknown>>({
  data,
  chartConfig,
  xDataKey,
  className,
  barVariant = "solid",
  stackType = "default",
  orientation = "vertical",
  radius = 4,
  hideTooltip = false,
  hideLegend = false,
  hideCartesianGrid = false,
}: ChartBarProps<TData>) {
  const seriesKeys = Object.keys(chartConfig)
  const id = React.useId().replace(/:/g, "")
  const stackId = stackType === "default" ? undefined : "a"
  const isHorizontal = orientation === "horizontal"

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", className)}
    >
      <RechartsBarChart
        data={data}
        layout={isHorizontal ? "vertical" : "horizontal"}
        stackOffset={stackType === "expanded" ? "expand" : undefined}
      >
        {!hideCartesianGrid && (
          <CartesianGrid vertical={isHorizontal} horizontal={!isHorizontal} />
        )}
        {isHorizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              dataKey={xDataKey as string}
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xDataKey as string}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
          </>
        )}
        {!hideTooltip && (
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        )}
        {!hideLegend && <ChartLegend content={<ChartLegendContent />} />}
        {seriesKeys.map((key, i) => {
          const gradientId = `${id}-gradient-${key}`
          const hasGradient = !!chartConfig[key]?.gradient
          const isStacked = stackId !== undefined
          const isTop = i === seriesKeys.length - 1
          const isBottom = i === 0
          // For stacked bars in vertical orientation:
          //   - Top segment gets rounded top corners
          //   - Bottom segment gets rounded bottom corners
          //   - Middle segments stay flat
          // Non-stacked: all corners rounded.
          // Recharts radius order: [topLeft, topRight, bottomRight, bottomLeft]
          const barRadius: number | [number, number, number, number] = isStacked
            ? isHorizontal
              ? [
                  isBottom ? radius : 0, // leftmost = first in stack
                  isTop ? radius : 0, // rightmost = last in stack
                  isTop ? radius : 0,
                  isBottom ? radius : 0,
                ]
              : [
                  isTop ? radius : 0, // top of column = last in stack
                  isTop ? radius : 0,
                  isBottom ? radius : 0, // bottom of column = first in stack
                  isBottom ? radius : 0,
                ]
            : radius
          return (
            <React.Fragment key={key}>
              {barVariant === "gradient" && hasGradient && (
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${key}-0)`} />
                    <stop
                      offset="100%"
                      stopColor={`var(--color-${key}-${(chartConfig[key]?.gradient?.light?.length ?? 1) - 1})`}
                    />
                  </linearGradient>
                </defs>
              )}
              <Bar
                dataKey={key}
                fill={
                  barVariant === "gradient" && hasGradient
                    ? `url(#${gradientId})`
                    : `var(--color-${key})`
                }
                stackId={stackId}
                radius={barRadius}
                isAnimationActive
                animationDuration={400}
              />
            </React.Fragment>
          )
        })}
      </RechartsBarChart>
    </ChartContainer>
  )
}
