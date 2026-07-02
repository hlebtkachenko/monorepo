"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentToolbar,
  DashboardChartCard,
  DashboardGrid,
} from "@workspace/ui/blocks/app-content"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useIcons } from "@workspace/ui/icon-packs"

import { PageHeaderActions } from "../../_shared/content-header-extras"
import { AppPageHeader } from "../../app-page-header"
import { CHARTS, METRICS, TIMEFRAME_OPTIONS } from "./data"

/**
 * Agents — the firm-office automation control center for a workspace
 * (`/workspace/agents`). The Dashboard archetype: KPI tiles (active agents,
 * runs today, pending approvals, exceptions) over chart cards (runs over time,
 * bookings by confidence), rolled up across every client book. MOCK data — see
 * `data.ts`. The title lives only in `ContentHeader`; there is no body heading.
 *
 * A single presentational timeframe `Select` sits in the toolbar (local state,
 * no re-aggregation yet) so the chrome reads like the other archetype pages
 * without the demo's widget-reorder / filter-bar / add-widget excess.
 */
export function AgentsDashboard() {
  const icons = useIcons()
  const CalendarIcon = icons.CalendarIcon
  const [timeframe, setTimeframe] = React.useState("today")

  const toolbar = (
    <ContentToolbar
      left={
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger size="sm" className="w-40">
            <CalendarIcon className="text-muted-foreground" />
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
      }
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Overview" actions={<PageHeaderActions />} />
      </AppPageHeader>
      <ContentPanel toolbar={toolbar}>
        <DashboardGrid metrics={METRICS} mode="chart">
          {CHARTS.map((chart) => (
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
