"use client"

import * as React from "react"
import { Cell, Pie, PieChart as RechartsPieChart } from "recharts"
import { cn } from "@workspace/ui/lib/utils"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./chart"

export interface ChartPieProps<TData extends Record<string, unknown>> {
  data: TData[]
  chartConfig: ChartConfig
  /** Field to group by (becomes slice label). */
  nameKey: keyof TData & string
  /** Field with the numeric value for each slice. */
  dataKey: keyof TData & string
  className?: string
  /** Inner radius creates a donut (0 = pie, >0 = donut). */
  innerRadius?: number
  outerRadius?: number | string
  paddingAngle?: number
  hideTooltip?: boolean
  hideLegend?: boolean
}

export function ChartPie<TData extends Record<string, unknown>>({
  data,
  chartConfig,
  nameKey,
  dataKey,
  className,
  innerRadius = 0,
  outerRadius = "80%",
  paddingAngle = 0,
  hideTooltip = false,
  hideLegend = false,
}: ChartPieProps<TData>) {
  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", className)}
    >
      <RechartsPieChart>
        {!hideTooltip && (
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        )}
        {!hideLegend && (
          <ChartLegend content={<ChartLegendContent nameKey={nameKey} />} />
        )}
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={paddingAngle}
          isAnimationActive
          animationDuration={400}
        >
          {data.map((entry) => {
            const key = String(entry[nameKey])
            return <Cell key={key} fill={`var(--color-${key})`} />
          })}
        </Pie>
      </RechartsPieChart>
    </ChartContainer>
  )
}
