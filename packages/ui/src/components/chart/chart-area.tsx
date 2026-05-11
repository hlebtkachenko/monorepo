"use client"

import * as React from "react"
import {
  Area,
  AreaChart as RechartsAreaChart,
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

type AreaVariant = "gradient" | "solid" | "dotted"
type StrokeVariant = "solid" | "dashed"
type CurveType =
  | "linear"
  | "monotone"
  | "natural"
  | "step"
  | "stepBefore"
  | "stepAfter"
type StackType = "default" | "stacked" | "expanded"

export interface ChartAreaProps<TData extends Record<string, unknown>> {
  data: TData[]
  chartConfig: ChartConfig
  xDataKey: keyof TData & string
  className?: string
  curveType?: CurveType
  areaVariant?: AreaVariant
  strokeVariant?: StrokeVariant
  stackType?: StackType
  hideTooltip?: boolean
  hideLegend?: boolean
  hideCartesianGrid?: boolean
}

export function ChartArea<TData extends Record<string, unknown>>({
  data,
  chartConfig,
  xDataKey,
  className,
  curveType = "monotone",
  areaVariant = "gradient",
  strokeVariant = "solid",
  stackType = "default",
  hideTooltip = false,
  hideLegend = false,
  hideCartesianGrid = false,
}: ChartAreaProps<TData>) {
  const seriesKeys = Object.keys(chartConfig)
  const id = React.useId().replace(/:/g, "")
  const stackId = stackType === "default" ? undefined : "a"
  const strokeDasharray = strokeVariant === "dashed" ? "4 4" : undefined

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", className)}
    >
      <RechartsAreaChart
        data={data}
        stackOffset={stackType === "expanded" ? "expand" : undefined}
      >
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
        {seriesKeys.map((key, i) => {
          const gradientId = `${id}-gradient-${key}`
          const hasGradient = !!chartConfig[key]?.gradient
          const fillUrl = `url(#${gradientId})`
          return (
            <React.Fragment key={key}>
              {areaVariant === "gradient" && (
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={
                        hasGradient
                          ? `var(--color-${key}-0)`
                          : `var(--color-${key})`
                      }
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={
                        hasGradient
                          ? `var(--color-${key}-${(chartConfig[key]?.gradient?.light?.length ?? 1) - 1})`
                          : `var(--color-${key})`
                      }
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
              )}
              <Area
                dataKey={key}
                type={curveType}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                strokeDasharray={strokeDasharray}
                fill={
                  areaVariant === "gradient"
                    ? fillUrl
                    : areaVariant === "dotted"
                      ? "transparent"
                      : `var(--color-${key})`
                }
                fillOpacity={
                  areaVariant === "gradient" || areaVariant === "dotted"
                    ? 1
                    : 0.3
                }
                stackId={stackId}
                isAnimationActive
                animationDuration={400}
                animationBegin={i * 80}
              />
            </React.Fragment>
          )
        })}
      </RechartsAreaChart>
    </ChartContainer>
  )
}
