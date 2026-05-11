"use client"

import * as React from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
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

type RadarVariant = "filled" | "lines"

export interface ChartRadarProps<TData extends Record<string, unknown>> {
  data: TData[]
  chartConfig: ChartConfig
  /** Axis label key (each data point's category). */
  nameKey: keyof TData & string
  className?: string
  radarVariant?: RadarVariant
  hideTooltip?: boolean
  hideLegend?: boolean
  hideRadiusAxis?: boolean
}

export function ChartRadar<TData extends Record<string, unknown>>({
  data,
  chartConfig,
  nameKey,
  className,
  radarVariant = "filled",
  hideTooltip = false,
  hideLegend = false,
  hideRadiusAxis = true,
}: ChartRadarProps<TData>) {
  const seriesKeys = Object.keys(chartConfig)
  const isFilled = radarVariant === "filled"

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", className)}
    >
      <RechartsRadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey={nameKey as string} />
        {!hideRadiusAxis && <PolarRadiusAxis />}
        {!hideTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
        {!hideLegend && <ChartLegend content={<ChartLegendContent />} />}
        {seriesKeys.map((key) => (
          <Radar
            key={key}
            dataKey={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            fill={isFilled ? `var(--color-${key})` : "transparent"}
            fillOpacity={isFilled ? 0.4 : 0}
            isAnimationActive
            animationDuration={400}
          />
        ))}
      </RechartsRadarChart>
    </ChartContainer>
  )
}
