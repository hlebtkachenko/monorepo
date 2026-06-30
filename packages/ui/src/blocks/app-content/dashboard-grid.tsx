"use client"

import * as React from "react"

import { Card } from "@workspace/ui/components/card"
import {
  ChartBar,
  ChartLine,
  ChartSparkLine,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

type Direction = "up" | "down" | "flat"

const DELTA: Record<
  Direction,
  { tint: string; icon: IconName; color: string }
> = {
  up: {
    tint: "text-brand-primary-light dark:text-brand-primary-dark",
    icon: "ArrowUp",
    color: "var(--brand-primary-light)",
  },
  down: {
    tint: "text-destructive",
    icon: "ArrowDown",
    color: "var(--destructive)",
  },
  flat: {
    tint: "text-muted-foreground",
    icon: "ArrowRightIcon",
    color: "var(--muted-foreground)",
  },
}

/** The per-card `⋮` overflow menu (stub actions for the prototype). */
function CardMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon="Ellipsis"
          aria-label="Widget options"
          className="text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem>Refresh</DropdownMenuItem>
        <DropdownMenuItem>Export</DropdownMenuItem>
        <DropdownMenuItem>Hide widget</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface MetricTileProps {
  /** The metric name (e.g. "Revenue"). */
  label: string
  /** The headline value, pre-formatted (e.g. "1 240 800 Kč"). */
  value: React.ReactNode
  /** Optional period-over-period change; `direction` drives the arrow + tint. */
  delta?: { label: React.ReactNode; direction: Direction }
  /** Optional sparkline series shown under the value. */
  series?: number[]
}

/** One KPI tile — value, a delta + label line, and an optional sparkline. */
function MetricTile({ label, value, delta, series }: MetricTileProps) {
  const icons = useIcons()
  const direction = delta?.direction ?? "flat"
  const DeltaIcon = delta ? icons[DELTA[direction].icon] : null

  return (
    <Card data-slot="metric-tile" className="gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-heading text-2xl leading-none font-semibold tracking-tight">
          {value}
        </span>
        <CardMenu />
      </div>
      <div className="flex items-center gap-2 text-xs">
        {delta && DeltaIcon ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              DELTA[direction].tint,
            )}
          >
            <DeltaIcon className="size-3.5" />
            {delta.label}
          </span>
        ) : null}
        <span className="text-muted-foreground">{label}</span>
      </div>
      {series && series.length > 1 ? (
        <ChartSparkLine
          className="h-12 w-full"
          data={series.map((v, i) => ({ i, v }))}
          index="i"
          categories={["v"]}
          colors={[DELTA[direction].color]}
        />
      ) : null}
    </Card>
  )
}

export interface DashboardChartCardProps {
  /** Card heading. */
  title: React.ReactNode
  /** Chart rows. Omit to render a labelled placeholder box. */
  data?: Record<string, unknown>[]
  /** Series config — keys map to `data` fields, with label + color. */
  chartConfig?: ChartConfig
  /** The `data` field used for the x axis. */
  xKey?: string
  /** Which prebuilt chart to render. Default `"bar"`. */
  chartType?: "bar" | "line"
  /** Column span on the lg grid (1 or 2). Default 1. */
  span?: 1 | 2
  className?: string
}

/**
 * Recharts clips the first/last category tick + the edge bars when the plot
 * runs flush to the SVG bounds: the ChartContainer's ResponsiveContainer fills
 * the wrapper edge-to-edge, so the leftmost Y-axis labels and the rightmost bar
 * sit on (and get cut by) the card edge. We pad the wrapper horizontally so the
 * SVG keeps an inset gutter on each side — every axis tick + edge bar then lands
 * inside the card. The `overflow-visible` lets any sub-pixel tick text that
 * still reaches the gutter render instead of being clipped by the wrapper box.
 */
const CHART_WRAPPER = "h-56 w-full min-w-0 overflow-visible px-2"

/** A titled card framing one chart (or a placeholder until wired). */
export function DashboardChartCard({
  title,
  data,
  chartConfig,
  xKey,
  chartType = "bar",
  span = 1,
  className,
}: DashboardChartCardProps) {
  const hasChart = data != null && chartConfig != null && xKey != null
  return (
    <Card
      data-slot="dashboard-chart-card"
      className={cn("gap-3 p-4", span === 2 && "@4xl:col-span-2", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-sm font-medium">{title}</span>
        <CardMenu />
      </div>
      <div className={CHART_WRAPPER}>
        {hasChart ? (
          // Tooltips are intentionally left ON (no `hideTooltip`) so the big
          // chart shows an interactive hover readout. Sparklines stay quiet.
          chartType === "line" ? (
            <ChartLine data={data} chartConfig={chartConfig} xDataKey={xKey} />
          ) : (
            <ChartBar data={data} chartConfig={chartConfig} xDataKey={xKey} />
          )
        ) : (
          <div className="grid h-full place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Chart placeholder
          </div>
        )}
      </div>
    </Card>
  )
}

/** One column of the metrics-as-rows matrix (the "Line"/table dashboard view). */
interface DashboardMatrixData {
  /** Time-bucket column headers (e.g. ["Jan", "Feb", …] or ["Q1", "Q2"]). */
  columns: string[]
  /** One row per metric — pre-formatted cells + a row total. */
  rows: {
    label: string
    cells: React.ReactNode[]
    total: React.ReactNode
  }[]
}

/**
 * The matrix / financial-statement view of the dashboard: metrics down the
 * rows, time buckets across the columns. The first column (metric name) sticks
 * on horizontal scroll; numeric cells right-align. Tokens only.
 */
function DashboardMatrixTable({ matrix }: { matrix: DashboardMatrixData }) {
  return (
    <Card data-slot="dashboard-matrix" className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium text-muted-foreground">
                Metric
              </th>
              {matrix.columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-right font-medium text-muted-foreground"
                >
                  {col}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium text-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border-subtle last:border-b-0"
              >
                <td className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium text-foreground">
                  {row.label}
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className="px-4 py-2.5 text-right text-foreground tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-semibold text-foreground tabular-nums">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export interface DashboardGridProps {
  /** The KPI tiles. */
  metrics: MetricTileProps[]
  /** Chart cards below the tiles. Render `DashboardChartCard`s here. */
  children?: React.ReactNode
  /**
   * Body mode. `"chart"` (default) shows the tiles + chart cards. `"table"`
   * swaps the chart grid for a metrics-as-rows matrix (`matrix` required).
   */
  mode?: "chart" | "table"
  /** The matrix shown when `mode === "table"`. */
  matrix?: DashboardMatrixData
  /** Show the KPI tiles row. Default `true` — toggled by the Widgets menu. */
  showTiles?: boolean
  className?: string
}

/**
 * Dashboard archetype — an analytics body: a responsive row of KPI tiles (each
 * with a sparkline), then either a grid of chart cards (`mode="chart"`) or a
 * metrics-as-rows matrix table (`mode="table"`). Container-query responsive, so
 * it reflows on content-panel resize, not just viewport. Presentational; feed
 * `metrics`, pass `DashboardChartCard`s as `children`, and a `matrix` for the
 * table mode. Period / scope controls belong in the `ContentToolbar` above it,
 * not here. Drop into a `ContentPanel`.
 */
export function DashboardGrid({
  metrics,
  children,
  mode = "chart",
  matrix,
  showTiles = true,
  className,
}: DashboardGridProps) {
  return (
    <div
      data-slot="dashboard-grid"
      className={cn("@container flex flex-col gap-4", className)}
    >
      {showTiles ? (
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {metrics.map((m) => (
            <MetricTile key={m.label} {...m} />
          ))}
        </div>
      ) : null}
      {mode === "table" && matrix ? (
        <DashboardMatrixTable matrix={matrix} />
      ) : children ? (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}
