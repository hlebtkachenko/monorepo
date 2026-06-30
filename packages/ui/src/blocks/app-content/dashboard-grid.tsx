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
      <div className="h-56 w-full min-w-0">
        {hasChart ? (
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

export interface DashboardGridProps {
  /** The KPI tiles. */
  metrics: MetricTileProps[]
  /** Chart cards below the tiles. Render `DashboardChartCard`s here. */
  children?: React.ReactNode
  className?: string
}

/**
 * Dashboard archetype — an analytics body: a responsive row of KPI tiles (each
 * with a sparkline), then a grid of chart cards. Container-query responsive, so
 * it reflows on content-panel resize, not just viewport. Presentational; feed
 * `metrics` and pass `DashboardChartCard`s as `children`. Period / scope controls
 * belong in the `ContentToolbar` above it, not here. Drop into a `ContentPanel`.
 */
export function DashboardGrid({
  metrics,
  children,
  className,
}: DashboardGridProps) {
  return (
    <div
      data-slot="dashboard-grid"
      className={cn("@container flex flex-col gap-4", className)}
    >
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {metrics.map((m) => (
          <MetricTile key={m.label} {...m} />
        ))}
      </div>
      {children ? (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}
