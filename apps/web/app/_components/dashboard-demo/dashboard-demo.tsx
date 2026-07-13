"use client"

import * as React from "react"
import {
  Activity,
  AreaChart,
  BarChart3,
  Banknote,
  Building2,
  Calendar,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  Layers,
  PieChart,
  Plus,
  Rows3,
  Tag,
} from "lucide-react"

import {
  ContentHeader,
  ContentPanel,
  ContentToolbarLegacy,
  DashboardChartCard,
  DashboardGrid,
  type ViewTab,
} from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  ActiveFilters,
  createColumnConfigHelper,
  FilterActions,
  FilterSelector,
  useFilterBar,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { applyFilterBar } from "../_shared/apply-filter-bar"
import {
  useTabVisibility,
  type ManageTab,
} from "../_shared/content-header-extras"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  ACCOUNT_OPTIONS,
  aggregate,
  CATEGORY_OPTIONS,
  COST_CENTER_OPTIONS,
  DASHBOARD_TABS,
  granularityOf,
  TIMEFRAME_OPTIONS,
  TRANSACTIONS,
  type DashboardView,
  type Timeframe,
  type Transaction,
} from "./data"

const dtf = createColumnConfigHelper<Transaction>()

// FilterBar columns — the dashboard's real, working filters. Setting any of
// these narrows the ledger before aggregation, so every tile + chart updates.
const FB_CONFIG = [
  dtf
    .option()
    .id("account")
    .accessor((t) => t.account)
    .displayName("Account")
    .icon(Building2)
    .options(ACCOUNT_OPTIONS)
    .build(),
  dtf
    .option()
    .id("category")
    .accessor((t) => t.category)
    .displayName("Category")
    .icon(Tag)
    .options(CATEGORY_OPTIONS)
    .build(),
  dtf
    .option()
    .id("costCenter")
    .accessor((t) => t.costCenter)
    .displayName("Cost centre")
    .icon(Layers)
    .options(COST_CENTER_OPTIONS)
    .build(),
  dtf
    .number()
    .id("amount")
    .accessor((t) => t.amount)
    .displayName("Amount")
    .icon(Banknote)
    .min(0)
    .max(140000)
    .build(),
  dtf
    .date()
    .id("date")
    .accessor((t) => new Date(t.date))
    .displayName("Date")
    .icon(Calendar)
    .build(),
]

// Analytic-format switch (Chart cards vs. matrix table).
type AnalyticFormat = "chart" | "table"

// The dashboard's widgets, surfaced in the "Widgets" show/hide menu. "tiles" is
// the KPI row; the rest are the per-view chart cards (id matches the chart id).
const WIDGETS: { id: string; label: string }[] = [
  { id: "tiles", label: "KPI tiles" },
  { id: "rev-exp", label: "Revenue vs. expenses" },
  { id: "result", label: "Running result" },
  { id: "rev-trend", label: "Revenue trend" },
  { id: "rev-bar", label: "Revenue by period" },
  { id: "exp-trend", label: "Expenses trend" },
  { id: "exp-bar", label: "Expenses by period" },
]

const WIDGET_LABELS = new Map(WIDGETS.map((w) => [w.id, w.label]))

// The "+ Add widget" split-button menu: chart types, each with a lucide icon.
const ADD_WIDGET_TYPES: { label: string; icon: React.ComponentType }[] = [
  { label: "Bar chart", icon: BarChart3 },
  { label: "Line chart", icon: Activity },
  { label: "Area chart", icon: AreaChart },
  { label: "Pie chart", icon: PieChart },
]

/**
 * The Widgets manager menu body — the same drag-reorderable grip + eye pattern
 * as the Table demo's column manager (`ColumnManagerMenuContent`), but scoped
 * to this demo's widget list. Each row: a grip handle, the widget label, and an
 * eye / eye-off toggle. Drag reorders `order`; the eye drives `hidden`.
 */
function WidgetManagerMenu({
  order,
  hidden,
  onReorder,
  onToggle,
}: {
  order: string[]
  hidden: ReadonlySet<string>
  onReorder: (
    sourceId: string,
    targetId: string,
    edge: "top" | "bottom",
  ) => void
  onToggle: (id: string) => void
}) {
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    id: string
    edge: "top" | "bottom"
  } | null>(null)

  return (
    <>
      <DropdownMenuLabel>Widgets</DropdownMenuLabel>
      {order.map((id) => {
        const label = WIDGET_LABELS.get(id) ?? id
        const visible = !hidden.has(id)
        const ToggleIcon = visible ? Eye : EyeOff
        const over = dropTarget?.id === id
        return (
          <div key={id} className="relative">
            {over && dropTarget.edge === "top" ? (
              <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
            <div
              draggable
              onDragStart={(event) => {
                // setData + effectAllowed are required for the drag to actually
                // start (Firefox) and for the native "held" drag image to show.
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", id)
                setDragId(id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropTarget(null)
              }}
              onDragOver={(event) => {
                if (!dragId || dragId === id) return
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = "move"
                const rect = event.currentTarget.getBoundingClientRect()
                const edge =
                  event.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
                setDropTarget({ id, edge })
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (dragId) onReorder(dragId, id, dropTarget?.edge ?? "top")
                setDragId(null)
                setDropTarget(null)
              }}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                // The dragged row "lifts": it dims in place while its full-opacity
                // native ghost follows the cursor.
                dragId === id && "opacity-40",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
              <span
                className={cn(
                  "flex-1 truncate",
                  !visible && "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <button
                type="button"
                aria-label={visible ? `Hide ${label}` : `Show ${label}`}
                onClick={() => onToggle(id)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ToggleIcon className="size-4" />
              </button>
            </div>
            {over && dropTarget.edge === "bottom" ? (
              <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/**
 * Dashboard archetype demo (#425). A real analytics workbench mirroring the
 * Table demo's chrome: the content header carries scoped view tabs (+ the shared
 * manage-tabs / favorite / config cluster); the toolbar carries a predefined-
 * timeframe Select then a working FilterBar on the LEFT, and an action cluster
 * on the RIGHT — a "Widgets" grip+eye reorder menu, an "+ Add widget" split
 * button, and a Chart/Table format switch. Both filter and re-bucket the
 * transaction ledger the KPI tiles + charts aggregate from, so the chrome is
 * functional.
 */
export function DashboardDemo() {
  const [view, setView] = React.useState<DashboardView>("overview")
  const [timeframe, setTimeframe] = React.useState<Timeframe>("last-6-months")
  const [format, setFormat] = React.useState<AnalyticFormat>("chart")
  const [filters, setFilters] = React.useState<FiltersState>([])
  const [selectorOpen, setSelectorOpen] = React.useState(false)
  const [selectorProperty, setSelectorProperty] = React.useState<
    string | undefined
  >(undefined)
  const [hiddenWidgets, setHiddenWidgets] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [widgetOrder, setWidgetOrder] = React.useState<string[]>(() =>
    WIDGETS.map((w) => w.id),
  )

  const granularity = granularityOf(timeframe)

  const {
    hidden: hiddenTabs,
    toggle: toggleTab,
    visible: visibleTabs,
    activeValue,
  } = useTabVisibility(DASHBOARD_TABS as ManageTab[], view)
  const activeView = (activeValue ?? "overview") as DashboardView

  const {
    columns: filterColumns,
    actions: filterActions,
    strategy: filterStrategy,
  } = useFilterBar({
    strategy: "client" as const,
    data: TRANSACTIONS,
    columnsConfig: FB_CONFIG,
    filters,
    onFiltersChange: setFilters,
  })

  const filtered = React.useMemo(
    () => applyFilterBar(TRANSACTIONS, filters, FB_CONFIG),
    [filters],
  )
  const { metrics, charts, matrix } = React.useMemo(
    () => aggregate(filtered, activeView, granularity),
    [filtered, activeView, granularity],
  )

  const toggleWidget = React.useCallback((id: string) => {
    setHiddenWidgets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const reorderWidget = React.useCallback(
    (sourceId: string, targetId: string, edge: "top" | "bottom") => {
      if (sourceId === targetId) return
      setWidgetOrder((prev) => {
        const next = [...prev]
        const from = next.indexOf(sourceId)
        if (from < 0) return prev
        next.splice(from, 1)
        const to = next.indexOf(targetId)
        if (to < 0) return prev
        next.splice(edge === "top" ? to : to + 1, 0, sourceId)
        return next
      })
    },
    [],
  )

  // Render the visible chart cards in the user's widget order. Charts are keyed
  // by id; a widget id with no chart in the active view simply has no card.
  const chartById = new Map(charts.map((chart) => [chart.id, chart]))
  const orderedCharts = widgetOrder
    .map((id) => chartById.get(id))
    .filter(
      (chart): chart is NonNullable<typeof chart> =>
        chart != null && !hiddenWidgets.has(chart.id),
    )

  const tabs: ViewTab[] = visibleTabs.map((t) => ({
    value: t.value,
    label: t.label,
  }))

  const toolbar = (
    <ContentToolbarLegacy
      left={
        <>
          {/* Predefined-timeframe control FIRST — maps to the granularity
              aggregate() buckets by, so switching it visibly re-buckets every
              tile + chart. */}
          <Select
            value={timeframe}
            onValueChange={(v) => setTimeframe(v as Timeframe)}
          >
            <SelectTrigger size="sm" className="w-40">
              <Calendar className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {TIMEFRAME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* The filter bar travels as one unit: funnel + active filters + Clear
              wrap together when they overflow. */}
          <div className="ms-1 flex flex-wrap items-center gap-1.5">
            <FilterSelector
              columns={filterColumns}
              filters={filters}
              actions={filterActions}
              strategy={filterStrategy}
              open={selectorOpen}
              onOpenChange={setSelectorOpen}
              property={selectorProperty}
              onPropertyChange={setSelectorProperty}
            />
            <ActiveFilters
              columns={filterColumns}
              filters={filters}
              actions={filterActions}
              strategy={filterStrategy}
            />
            <FilterActions
              hasFilters={filters.length > 0}
              actions={filterActions}
            />
          </div>
        </>
      }
      right={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <LayoutGrid />
                Widgets
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <WidgetManagerMenu
                order={widgetOrder}
                hidden={hiddenWidgets}
                onReorder={reorderWidget}
                onToggle={toggleWidget}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <ButtonGroup>
            <Button
              size="sm"
              onClick={() => toast.success("Add widget — pick a type")}
            >
              <Plus />
              Add widget
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" aria-label="Choose widget type">
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {ADD_WIDGET_TYPES.map((type) => {
                  const Icon = type.icon
                  return (
                    <DropdownMenuItem
                      key={type.label}
                      onSelect={() =>
                        toast.success(`Adding a ${type.label.toLowerCase()}…`)
                      }
                    >
                      <Icon />
                      {type.label}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroup
                  type="single"
                  value={format}
                  onValueChange={(value) => {
                    if (value) setFormat(value as AnalyticFormat)
                  }}
                  variant="outline"
                  size="sm"
                  // Extra left margin = double the toolbar gap between the
                  // "Add widget" group and the format switch.
                  className="ms-1"
                >
                  <ToggleGroupItem value="chart" aria-label="Chart view">
                    <BarChart3 />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="table" aria-label="Table view">
                    <Rows3 />
                  </ToggleGroupItem>
                </ToggleGroup>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Format — chart cards or matrix table
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      }
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="Dashboard"
          viewTabs={tabs}
          value={activeView}
          onValueChange={(value) => setView(value as DashboardView)}
          manageViews={{
            tabs: DASHBOARD_TABS as ManageTab[],
            hidden: hiddenTabs,
            onToggle: toggleTab,
          }}
        />
      </AppPageHeader>
      <ContentPanel toolbar={toolbar}>
        <DashboardGrid
          metrics={metrics}
          mode={format}
          matrix={matrix}
          showTiles={!hiddenWidgets.has("tiles")}
        >
          {orderedCharts.map((chart) => (
            <DashboardChartCard
              key={chart.id}
              title={chart.title}
              data={chart.data}
              chartConfig={chart.chartConfig}
              xKey={chart.xKey}
              chartType={chart.chartType}
            />
          ))}
        </DashboardGrid>
      </ContentPanel>
    </>
  )
}
