"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  YAxis,
} from "recharts"
import { cn } from "@workspace/ui/lib/utils"

const SPARK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

export interface ChartSparkAreaProps extends React.ComponentProps<"div"> {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: string[]
  fill?: "gradient" | "solid" | "none"
  curveType?: "linear" | "monotone" | "natural" | "step"
  minValue?: number
  maxValue?: number
  connectNulls?: boolean
}

function ChartSparkArea({
  data,
  index: _index,
  categories,
  colors,
  fill = "gradient",
  curveType = "monotone",
  minValue,
  maxValue,
  connectNulls = false,
  className,
  ...props
}: ChartSparkAreaProps) {
  const resolvedColors =
    colors && colors.length > 0
      ? colors
      : SPARK_COLORS.slice(0, categories.length)
  const id = React.useId().replace(/:/g, "")

  return (
    <div
      data-slot="chart-spark-area"
      className={cn("h-12 w-28", className)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <YAxis domain={[minValue ?? "auto", maxValue ?? "auto"]} hide />
          {categories.map((cat, i) => {
            const color = resolvedColors[i % resolvedColors.length]
            const gradientId = `spark-area-${id}-${i}`
            return (
              <React.Fragment key={cat}>
                {fill === "gradient" && (
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                )}
                <Area
                  dataKey={cat}
                  type={curveType}
                  stroke={color}
                  strokeWidth={2}
                  fill={
                    fill === "gradient"
                      ? `url(#${gradientId})`
                      : fill === "solid"
                        ? color
                        : "transparent"
                  }
                  fillOpacity={fill === "solid" ? 0.3 : 1}
                  dot={false}
                  connectNulls={connectNulls}
                  isAnimationActive={false}
                />
              </React.Fragment>
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface ChartSparkLineProps extends React.ComponentProps<"div"> {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: string[]
  curveType?: "linear" | "monotone" | "natural" | "step"
  strokeWidth?: number
  minValue?: number
  maxValue?: number
  connectNulls?: boolean
}

function ChartSparkLine({
  data,
  index: _index,
  categories,
  colors,
  curveType = "monotone",
  strokeWidth = 2,
  minValue,
  maxValue,
  connectNulls = false,
  className,
  ...props
}: ChartSparkLineProps) {
  const resolvedColors =
    colors && colors.length > 0
      ? colors
      : SPARK_COLORS.slice(0, categories.length)

  return (
    <div
      data-slot="chart-spark-line"
      className={cn("h-12 w-28", className)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <YAxis domain={[minValue ?? "auto", maxValue ?? "auto"]} hide />
          {categories.map((cat, i) => {
            const color = resolvedColors[i % resolvedColors.length]
            return (
              <Line
                key={cat}
                dataKey={cat}
                type={curveType}
                stroke={color}
                strokeWidth={strokeWidth}
                dot={false}
                connectNulls={connectNulls}
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface ChartSparkBarProps extends React.ComponentProps<"div"> {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: string[]
  minValue?: number
  maxValue?: number
  barCategoryGap?: number | string
}

function ChartSparkBar({
  data,
  index: _index,
  categories,
  colors,
  minValue,
  maxValue,
  barCategoryGap = "20%",
  className,
  ...props
}: ChartSparkBarProps) {
  const resolvedColors =
    colors && colors.length > 0
      ? colors
      : SPARK_COLORS.slice(0, categories.length)

  return (
    <div
      data-slot="chart-spark-bar"
      className={cn("h-12 w-28", className)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={barCategoryGap}
        >
          <YAxis domain={[minValue ?? "auto", maxValue ?? "auto"]} hide />
          {categories.map((cat, i) => {
            const color = resolvedColors[i % resolvedColors.length]
            return (
              <Bar
                key={cat}
                dataKey={cat}
                fill={color}
                radius={2}
                isAnimationActive={false}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export { ChartSparkArea, ChartSparkLine, ChartSparkBar }
