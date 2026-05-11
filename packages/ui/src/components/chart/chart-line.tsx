"use client"

import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
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

type CurveType =
  | "linear"
  | "monotone"
  | "natural"
  | "step"
  | "stepBefore"
  | "stepAfter"
type StrokeVariant = "solid" | "dashed"

export interface ChartLineProps<TData extends Record<string, unknown>> {
  data: TData[]
  chartConfig: ChartConfig
  xDataKey: keyof TData & string
  className?: string
  curveType?: CurveType
  strokeVariant?: StrokeVariant
  strokeWidth?: number
  showDots?: boolean
  hideTooltip?: boolean
  hideLegend?: boolean
  hideCartesianGrid?: boolean
}

export function ChartLine<TData extends Record<string, unknown>>({
  data,
  chartConfig,
  xDataKey,
  className,
  curveType = "monotone",
  strokeVariant = "solid",
  strokeWidth = 2,
  showDots = false,
  hideTooltip = false,
  hideLegend = false,
  hideCartesianGrid = false,
}: ChartLineProps<TData>) {
  const seriesKeys = Object.keys(chartConfig)
  const strokeDasharray = strokeVariant === "dashed" ? "4 4" : undefined

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", className)}
    >
      <RechartsLineChart data={data}>
        {!hideCartesianGrid && <CartesianGrid vertical={false} />}
        <XAxis
          dataKey={xDataKey as string}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        {!hideTooltip && (
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        )}
        {!hideLegend && <ChartLegend content={<ChartLegendContent />} />}
        {seriesKeys.map((key) => (
          <Line
            key={key}
            dataKey={key}
            type={curveType}
            stroke={`var(--color-${key})`}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            dot={showDots}
            isAnimationActive
            animationDuration={400}
          />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  )
}
