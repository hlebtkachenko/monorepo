"use client"

import * as React from "react"
import {
  Activity,
  AreaChart,
  BarChart3,
  Banknote,
  Building2,
  Calendar,
  LayoutGrid,
  Layers,
  PieChart,
  Rows3,
  Tag,
} from "lucide-react"

import {
  ContentHeader,
  ContentPanel,
  ContentToolbar,
  DashboardChartCard,
  DashboardGrid,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

import { applyFilterBar } from "../_shared/apply-filter-bar"
import {
  ManageTabsMenu,
  PageHeaderActions,
  useTabVisibility,
  type ManageTab,
} from "../_shared/content-header-extras"
import { OrgPageHeader } from "../org-page-header"
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

// The "+ Add widget" split-button menu: chart types, each with a lucide icon.
const ADD_WIDGET_TYPES: { label: string; icon: React.ComponentType }[] = [
  { label: "Bar chart", icon: BarChart3 },
  { label: "Line chart", icon: Activity },
  { label: "Area chart", icon: AreaChart },
  { label: "Pie chart", icon: PieChart },
]

/**
 * Dashboard archetype demo (#425). A real analytics workbench mirroring the
 * Table demo's chrome: the content header carries scoped view tabs (+ the shared
 * manage-tabs / favorite / config cluster); the toolbar carries a working
 * FilterBar and a predefined-timeframe Select on the LEFT, and an action cluster
 * on the RIGHT — a "Widgets" show/hide menu, an "+ Add widget" split button, and
 * a Chart/Table format switch. Both filter and re-bucket the transaction ledger
 * the KPI tiles + charts aggregate from, so the chrome is functional.
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
  const [ledger, setLedger] = React.useState<Transaction[]>(TRANSACTIONS)

  const granularity = granularityOf(timeframe)

  const {
    hidden: hiddenTabs,
    toggle: toggleTab,
    visible: visibleTabs,
  } = useTabVisibility(DASHBOARD_TABS as ManageTab[])

  const {
    columns: filterColumns,
    actions: filterActions,
    strategy: filterStrategy,
  } = useFilterBar({
    strategy: "client" as const,
    data: ledger,
    columnsConfig: FB_CONFIG,
    filters,
    onFiltersChange: setFilters,
  })

  const filtered = React.useMemo(
    () => applyFilterBar(ledger, filters, FB_CONFIG),
    [ledger, filters],
  )
  const { metrics, charts, matrix } = React.useMemo(
    () => aggregate(filtered, view, granularity),
    [filtered, view, granularity],
  )

  const reload = React.useCallback(() => {
    setLedger(TRANSACTIONS.map((t) => ({ ...t })))
    toast.success("Dashboard refreshed")
  }, [])

  const toggleWidget = React.useCallback((id: string) => {
    setHiddenWidgets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const tabs: ContentTab[] = visibleTabs.map((t) => ({
    value: t.value,
    label: t.label,
  }))

  const toolbar = (
    <ContentToolbar
      left={
        <>
          {/* The filter bar travels as one unit: funnel + active filters + Clear
              wrap together when they overflow. */}
          <div className="flex flex-wrap items-center gap-1.5">
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
          {/* Predefined-timeframe control — maps to the granularity aggregate()
              buckets by, so switching it visibly re-buckets every tile + chart. */}
          <Select
            value={timeframe}
            onValueChange={(v) => setTimeframe(v as Timeframe)}
          >
            <SelectTrigger size="sm" className="ms-1 w-40">
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
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuLabel>Widgets</DropdownMenuLabel>
              {WIDGETS.map((widget) => (
                <DropdownMenuCheckboxItem
                  key={widget.id}
                  checked={!hiddenWidgets.has(widget.id)}
                  onCheckedChange={() => toggleWidget(widget.id)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {widget.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ButtonGroup>
            <Button
              size="sm"
              onClick={() => toast.success("Add widget — pick a type")}
            >
              <BarChart3 />
              Add widget
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" aria-label="Choose widget type">
                  <Activity />
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
      <OrgPageHeader>
        <ContentHeader
          title="Dashboard"
          tabs={tabs}
          value={view}
          onValueChange={(value) => setView(value as DashboardView)}
          manageTabs={
            <ManageTabsMenu
              tabs={DASHBOARD_TABS as ManageTab[]}
              hidden={hiddenTabs}
              onToggle={toggleTab}
            />
          }
          actions={<PageHeaderActions />}
        />
      </OrgPageHeader>
      <ContentPanel toolbar={toolbar}>
        <DashboardGrid
          metrics={metrics}
          mode={format}
          matrix={matrix}
          showTiles={!hiddenWidgets.has("tiles")}
        >
          {charts
            .filter((chart) => !hiddenWidgets.has(chart.id))
            .map((chart) => (
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
