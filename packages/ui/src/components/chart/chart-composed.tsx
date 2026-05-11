"use client"

import * as React from "react"
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart as RechartsComposedChart,
  Line,
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

type SeriesType = "bar" | "line" | "area"

export interface ChartComposedProps<TData extends Record<string, unknown>> {
  data: TData[]
  chartConfig: ChartConfig
  xDataKey: keyof TData & string
  /** Map series key to chart element type. Default: "bar" */
  seriesTypes?: Record<string, SeriesType>
  className?: string
  hideTooltip?: boolean
  hideLegend?: boolean
  hideCartesianGrid?: boolean
}

export function ChartComposed<TData extends Record<string, unknown>>({
  data,
  chartConfig,
  xDataKey,
  seriesTypes = {},
  className,
  hideTooltip = false,
  hideLegend = false,
  hideCartesianGrid = false,
}: ChartComposedProps<TData>) {
  const seriesKeys = Object.keys(chartConfig)

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", className)}
    >
      <RechartsComposedChart data={data}>
        {!hideCartesianGrid && <CartesianGrid vertical={false} />}
        <XAxis
          dataKey={xDataKey as string}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        {!hideTooltip && (
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        )}
        {!hideLegend && <ChartLegend content={<ChartLegendContent />} />}
        {seriesKeys.map((key) => {
          const type = seriesTypes[key] ?? "bar"
          const color = `var(--color-${key})`
          if (type === "line") {
            return (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive
                animationDuration={400}
              />
            )
          }
          if (type === "area") {
            return (
              <Area
                key={key}
                dataKey={key}
                type="monotone"
                stroke={color}
                fill={color}
                fillOpacity={0.3}
                isAnimationActive
                animationDuration={400}
              />
            )
          }
          return (
            <Bar
              key={key}
              dataKey={key}
              fill={color}
              radius={4}
              isAnimationActive
              animationDuration={400}
            />
          )
        })}
      </RechartsComposedChart>
    </ChartContainer>
  )
}
