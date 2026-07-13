import type {
  DashboardChartCardProps,
  MetricTileProps,
} from "@workspace/ui/blocks/content-panel"

/**
 * Analyse (office overview) dashboard data. `Active companies` is REAL (the workspace
 * client-book count, injected). Every other tile + both charts are MOCK
 * operational placeholders (no source table yet), deterministic and static —
 * they mirror the org tier's mock-backed analytics. The tiles are ops-focused
 * (deadlines / overdue / work / companies), not vanity SaaS counters, and each
 * reads as a triage number an accountant-office principal actually opens with.
 */

export interface AnalyseChart extends Pick<
  DashboardChartCardProps,
  "title" | "data" | "chartConfig" | "xKey" | "chartType"
> {
  id: string
}

export function buildAnalyseMetrics(counts: {
  companyCount: number
}): MetricTileProps[] {
  return [
    {
      label: "Deadlines this week",
      value: "7",
      delta: { label: "3 due soon", direction: "flat" },
      series: [2, 3, 4, 4, 6, 7],
    },
    {
      label: "Overdue",
      value: "1",
      delta: { label: "needs attention", direction: "down" },
      series: [0, 0, 1, 1, 1, 1],
    },
    {
      label: "Open work items",
      value: "14",
      delta: { label: "+3 this week", direction: "up" },
      series: [9, 10, 11, 12, 13, 14],
    },
    {
      label: "Active companies",
      value: String(counts.companyCount),
      delta: { label: "company books", direction: "flat" },
      series: [
        Math.max(counts.companyCount - 3, 0),
        Math.max(counts.companyCount - 2, 0),
        Math.max(counts.companyCount - 2, 0),
        Math.max(counts.companyCount - 1, 0),
        counts.companyCount,
        counts.companyCount,
      ],
    },
  ]
}

export const ANALYSE_CHARTS: AnalyseChart[] = [
  {
    id: "deadlines-by-week",
    title: "Deadlines by week",
    chartType: "bar",
    xKey: "week",
    chartConfig: { count: { label: "Deadlines", color: "var(--chart-1)" } },
    data: [
      { week: "W1", count: 4 },
      { week: "W2", count: 7 },
      { week: "W3", count: 5 },
      { week: "W4", count: 9 },
      { week: "W5", count: 6 },
      { week: "W6", count: 8 },
    ],
  },
  {
    id: "agent-activity",
    title: "Agent activity",
    chartType: "line",
    xKey: "day",
    chartConfig: { runs: { label: "Runs", color: "var(--chart-2)" } },
    data: [
      { day: "Mon", runs: 18 },
      { day: "Tue", runs: 24 },
      { day: "Wed", runs: 21 },
      { day: "Thu", runs: 30 },
      { day: "Fri", runs: 27 },
      { day: "Sat", runs: 6 },
      { day: "Sun", runs: 3 },
    ],
  },
]
