"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  DashboardChartCard,
  DashboardGrid,
} from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "../../app-page-header"
import { ANALYSE_CHARTS, buildAnalyseMetrics } from "./data"

/**
 * Analyse — the accountant-office overview. Dashboard archetype: ops-focused KPI
 * tiles (deadlines / overdue / open work / active companies) over mock chart
 * cards. `companyCount` is the real client-book count; the rest is mock,
 * matching the org tier's analytics maturity.
 *
 * The content-header title is the WORKSPACE NAME (not "Analyse") so it doesn't echo
 * the sidebar's "Analyse" module title — the shell shows the office you're in, the
 * rail shows which module.
 */
export function AnalyseDashboard({
  workspaceName,
  companyCount,
}: {
  workspaceName: string
  companyCount: number
}) {
  const metrics = React.useMemo(
    () => buildAnalyseMetrics({ companyCount }),
    [companyCount],
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title={workspaceName} />
      </AppPageHeader>
      <ContentPanel>
        <DashboardGrid metrics={metrics} mode="chart">
          {ANALYSE_CHARTS.map((chart) => (
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
