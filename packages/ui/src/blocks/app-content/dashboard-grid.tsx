"use client"

import {
  type CellContext,
  type ColumnDef,
  getExpandedRowModel,
} from "@tanstack/react-table"
import * as React from "react"

import {
  ActionBar,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Card } from "@workspace/ui/components/card"
import {
  ChartBar,
  ChartLine,
  ChartSparkLine,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { useDataTable } from "@workspace/ui/components/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { ChevronRight } from "@workspace/ui/lib/icons"
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

/**
 * One KPI tile — the metric name as a proper card title on top (with the `⋮`
 * menu on the same row), then the big value, a delta-only line, and an optional
 * sparkline. Mirrors `DashboardChartCard`'s title treatment so the metric name
 * reads as a heading, not as buried caption text.
 */
function MetricTile({ label, value, delta, series }: MetricTileProps) {
  const icons = useIcons()
  const direction = delta?.direction ?? "flat"
  const DeltaIcon = delta ? icons[DELTA[direction].icon] : null

  return (
    <Card data-slot="metric-tile" className="gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-sm font-medium">{label}</span>
        <CardMenu />
      </div>
      <span className="font-heading text-2xl leading-none font-semibold tracking-tight">
        {value}
      </span>
      {delta && DeltaIcon ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            DELTA[direction].tint,
          )}
        >
          <DeltaIcon className="size-3.5" />
          {delta.label}
        </span>
      ) : null}
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

/** One hierarchical row of the metrics-as-rows matrix. */
interface DashboardMatrixRow {
  label: string
  /** Pre-formatted cell per bucket column. */
  cells: string[]
  /** Pre-formatted row total. */
  total: string
  /** Child breakdown rows (e.g. Revenue → Sales, Services). */
  children?: DashboardMatrixRow[]
}

/** The metrics-as-rows matrix (the "Line"/table dashboard view). */
interface DashboardMatrixData {
  /** Time-bucket column headers (e.g. ["Jan", "Feb", …] or ["Q1", "Q2"]). */
  columns: string[]
  /** Top-level metric rows; each may carry `children` for expansion. */
  rows: DashboardMatrixRow[]
}

/** Parse a pre-formatted cs-CZ cell ("1 240 800 Kč" / "12") to a number.
 * Normalises a Unicode minus (U+2212), which some ICU builds emit for cs-CZ
 * negatives, to an ASCII hyphen so the sign survives the strip. */
function numberFromCell(cell: string | undefined): number {
  if (!cell) return 0
  const digits = cell.replace(/−/g, "-").replace(/[^\d-]/g, "")
  return digits ? Number(digits) : 0
}

/** A numeric bucket / total cell — right-aligned, `tabular-nums`, indent-agnostic. */
function NumericCell({
  ctx,
  emphasis,
}: {
  ctx: CellContext<DashboardMatrixRow, unknown>
  emphasis?: "total"
}) {
  const value = ctx.getValue<string>()
  const isChild = ctx.row.depth > 0
  return (
    <div
      className={cn(
        "w-full text-right tabular-nums",
        emphasis === "total"
          ? "font-semibold text-foreground"
          : "text-foreground",
        isChild && emphasis !== "total" && "text-muted-foreground",
      )}
    >
      {value}
    </div>
  )
}

/** The metric-name cell — carries the expander toggle + depth indent. */
function MetricCell({
  ctx,
}: {
  ctx: CellContext<DashboardMatrixRow, unknown>
}) {
  const { row } = ctx
  return (
    <div
      className="flex w-full items-center gap-1.5"
      style={{ paddingLeft: `${row.depth * 1.25}rem` }}
    >
      {row.getCanExpand() ? (
        <button
          type="button"
          aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
          onClick={(event) => {
            // Stop the grid cell from stealing focus / the toggle from being
            // swallowed by the row's pointer handling.
            event.stopPropagation()
            row.toggleExpanded()
          }}
          className="-ml-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              row.getIsExpanded() && "rotate-90",
            )}
          />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span
        className={cn(
          "truncate",
          row.depth === 0
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {row.original.label}
      </span>
    </div>
  )
}

/**
 * The matrix / financial-statement view: metrics down the rows, time buckets
 * across the columns. Built on the SAME grid the Table archetype uses —
 * `useDataTable` + `DataGridView` — so headers sort/hover/resize/reorder,
 * rows hover, and the leading checkbox column drives real row selection
 * exactly like the Table. Extras layered on top: expandable subrows
 * (Revenue/Expenses break down by category) via the metric column's expander,
 * and a selected-rows sum surfaced in an `ActionBar`. Numeric cells right-align
 * with `tabular-nums`; the metric column pins left. Tokens only.
 */
function DashboardMatrixTable({ matrix }: { matrix: DashboardMatrixData }) {
  const columns = React.useMemo<ColumnDef<DashboardMatrixRow>[]>(() => {
    const bucketColumns = matrix.columns.map<ColumnDef<DashboardMatrixRow>>(
      (bucket, index) => ({
        id: `bucket-${index}`,
        header: bucket,
        meta: { label: bucket },
        // Display the pre-formatted string; sort by the underlying magnitude
        // (not the formatted text) so ordering is numeric.
        accessorFn: (row) => row.cells[index] ?? "",
        sortingFn: (a, b) =>
          numberFromCell(a.original.cells[index]) -
          numberFromCell(b.original.cells[index]),
        cell: (ctx) => <NumericCell ctx={ctx} />,
        size: 120,
        enableSorting: true,
        enableHiding: false,
      }),
    )
    return [
      {
        id: "select",
        size: 40,
        minSize: 40,
        maxSize: 40,
        meta: { align: "center" },
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            className="border-primary"
            checked={
              table.getIsAllRowsSelected() ||
              (table.getIsSomeRowsSelected() ? "indeterminate" : false)
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.label}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
      {
        id: "metric",
        header: "Metric",
        meta: { label: "Metric" },
        accessorFn: (row) => row.label,
        cell: (ctx) => <MetricCell ctx={ctx} />,
        size: 220,
        minSize: 160,
        enableSorting: true,
        enableHiding: false,
      },
      ...bucketColumns,
      {
        id: "total",
        header: "Total",
        meta: { label: "Total" },
        accessorFn: (row) => row.total,
        sortingFn: (a, b) =>
          numberFromCell(a.original.total) - numberFromCell(b.original.total),
        cell: (ctx) => <NumericCell ctx={ctx} emphasis="total" />,
        size: 140,
        enableSorting: true,
        enableHiding: false,
      },
    ]
  }, [matrix.columns])

  const { table } = useDataTable<DashboardMatrixRow>({
    data: matrix.rows,
    columns,
    getSubRows: (row) => row.children,
    getExpandedRowModel: getExpandedRowModel(),
    // Each checkbox is independent: selecting a parent must NOT auto-select its
    // children, or the selected-sum would double-count (parent total already
    // equals the sum of its child rows).
    enableSubRowSelection: false,
    columnResizeMode: "onChange",
    initialState: {
      pagination: { pageIndex: 0, pageSize: 100 },
      columnPinning: { left: ["select", "metric"] },
    },
    // Parent rows are aggregates of their children — expand to browse, not to
    // re-order. Auto-expand-all keeps the breakdown visible by default.
    autoResetExpanded: false,
  })

  React.useEffect(() => {
    table.toggleAllRowsExpanded(true)
  }, [table, matrix.rows])

  // `flatRows` (not `.rows`, which is top-level only) so an individually
  // selected child row counts too. `enableSubRowSelection: false` keeps each
  // checkbox independent, so a selected parent never silently adds its
  // children — the sum is exactly the rows the user ticked.
  const selectedRows = table.getSelectedRowModel().flatRows
  const selectedCount = selectedRows.length
  const selectedSum = selectedRows.reduce(
    (sum, row) => sum + numberFromCell(row.original.total),
    0,
  )

  return (
    <Card data-slot="dashboard-matrix" className="p-0">
      <DataGridView table={table} />
      <ActionBar
        open={selectedCount > 0}
        onOpenChange={(open) => {
          if (!open) table.resetRowSelection()
        }}
        aria-label="Selected rows"
      >
        <ActionBarSelection>{selectedCount} selected</ActionBarSelection>
        <ActionBarSeparator />
        <ActionBarSelection className="border-transparent text-muted-foreground">
          Σ {formatMatrixSum(selectedSum)}
        </ActionBarSelection>
      </ActionBar>
    </Card>
  )
}

/**
 * Format a selected-rows sum for the ActionBar. The matrix's `total` cells are
 * already cs-CZ formatted (space thousands, "Kč" suffix); we re-derive the same
 * grouping from the raw sum so the running total matches the cells exactly.
 * Bare integers (the Transactions count row) sum to a plain number — but a mix
 * of money + count rows is nonsensical to add, so a "Kč" suffix is appended
 * only when the sum plausibly represents money (any non-trivial magnitude).
 */
function formatMatrixSum(value: number): string {
  const grouped = Math.round(value)
    .toLocaleString("cs-CZ")
    .replace(/[  ]/g, " ")
  // The count row's totals are small integers; money totals are large. Suffix
  // "Kč" for money-scale sums so the running total reads like the cells.
  return Math.abs(value) >= 1000 ? `${grouped} Kč` : grouped
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
