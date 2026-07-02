"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  DashboardChartCard,
  DashboardGrid,
} from "@workspace/ui/blocks/app-content"
import { toast } from "@workspace/ui/components/sonner"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"
import { HOME_CHARTS, buildHomeMetrics } from "./data"

/**
 * Home — the accountant-office overview. Dashboard archetype: ops-focused KPI
 * tiles (deadlines / overdue / open work / pending approvals / active clients)
 * over mock chart cards. `activeClients` is the real client-book count; the rest
 * is mock, matching the org tier's analytics maturity.
 *
 * The content-header title is the WORKSPACE NAME (not "Home") so it doesn't echo
 * the sidebar's "Home" module title — the shell shows the office you're in, the
 * rail shows which module. Any `?error=` redirected here from the org layout is
 * surfaced as a toast.
 */
export function HomeDashboard({
  workspaceName,
  activeClients,
  errorMessage,
}: {
  workspaceName: string
  activeClients: number
  errorMessage?: string
}) {
  React.useEffect(() => {
    if (errorMessage) toast.error(errorMessage)
  }, [errorMessage])

  const metrics = React.useMemo(
    () => buildHomeMetrics({ activeClients }),
    [activeClients],
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title={workspaceName} actions={<PageHeaderActions />} />
      </AppPageHeader>
      <ContentPanel>
        <DashboardGrid metrics={metrics} mode="chart">
          {HOME_CHARTS.map((chart) => (
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
