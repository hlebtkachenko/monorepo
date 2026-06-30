"use client"

import * as React from "react"
import { Banknote, Building2, Calendar, Layers, Tag } from "lucide-react"

import {
  ContentHeader,
  ContentPanel,
  ContentToolbar,
  DashboardChartCard,
  DashboardGrid,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { IconButton } from "@workspace/ui/components/icon-button"
import {
  ActiveFilters,
  createColumnConfigHelper,
  FilterActions,
  FilterSelector,
  useFilterBar,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { toast } from "@workspace/ui/components/sonner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { applyFilterBar } from "../_shared/apply-filter-bar"
import { OrgPageHeader } from "../org-page-header"
import {
  aggregate,
  DASHBOARD_TABS,
  TRANSACTIONS,
  type DashboardView,
  type Granularity,
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
    .build(),
  dtf
    .option()
    .id("category")
    .accessor((t) => t.category)
    .displayName("Category")
    .icon(Tag)
    .build(),
  dtf
    .option()
    .id("costCenter")
    .accessor((t) => t.costCenter)
    .displayName("Cost centre")
    .icon(Layers)
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

/**
 * Dashboard archetype demo (#425). A real analytics workbench: the content
 * header carries scoped view tabs; the toolbar carries a working FilterBar
 * (account / category / cost centre / amount / date) + a granularity toggle.
 * Both filter and re-bucket the transaction ledger that the KPI tiles + charts
 * are aggregated from, so the chrome is functional, not decorative.
 */
export function DashboardDemo() {
  const [view, setView] = React.useState<DashboardView>("overview")
  const [granularity, setGranularity] = React.useState<Granularity>("month")
  const [filters, setFilters] = React.useState<FiltersState>([])
  const [selectorOpen, setSelectorOpen] = React.useState(false)
  const [selectorProperty, setSelectorProperty] = React.useState<
    string | undefined
  >(undefined)
  const [ledger, setLedger] = React.useState<Transaction[]>(TRANSACTIONS)

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
  const { metrics, charts } = React.useMemo(
    () => aggregate(filtered, view, granularity),
    [filtered, view, granularity],
  )

  const reload = React.useCallback(() => {
    setLedger(TRANSACTIONS.map((t) => ({ ...t })))
    toast.success("Dashboard refreshed")
  }, [])

  const tabs: ContentTab[] = DASHBOARD_TABS.map((t) => ({
    value: t.value,
    label: t.label,
  }))

  const toolbar = (
    <ContentToolbar
      left={
        <>
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
          <ToggleGroup
            type="single"
            value={granularity}
            onValueChange={(v) => {
              if (v) setGranularity(v as Granularity)
            }}
            variant="outline"
            size="sm"
            className="ms-1"
          >
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
            <ToggleGroupItem value="quarter">Quarter</ToggleGroupItem>
          </ToggleGroup>
        </>
      }
      right={
        <>
          <IconButton
            icon="Download"
            aria-label="Export"
            tooltip="Export"
            tooltipSide="bottom"
            onClick={() =>
              toast.success(`Exporting ${filtered.length} transactions…`)
            }
          />
          <IconButton
            icon="RefreshCw"
            aria-label="Refresh"
            tooltip="Refresh"
            tooltipSide="bottom"
            onClick={reload}
          />
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
        />
      </OrgPageHeader>
      <ContentPanel toolbar={toolbar}>
        <DashboardGrid metrics={metrics}>
          {charts.map((chart) => (
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
