import type {
  DashboardChartCardProps,
  MetricTileProps,
} from "@workspace/ui/blocks/app-content"

/**
 * Home (office overview) dashboard data. `Active clients` is REAL (the workspace
 * client-book count, injected). Every other tile + both charts are MOCK
 * operational placeholders (no source table yet), deterministic and static —
 * they mirror the org tier's mock-backed analytics. The tiles are ops-focused
 * (deadlines / overdue / work / approvals), not vanity SaaS counters, and each
 * reads as a triage number an accountant-office principal actually opens with.
 */

export interface HomeChart extends Pick<
  DashboardChartCardProps,
  "title" | "data" | "chartConfig" | "xKey" | "chartType"
> {
  id: string
}

export function buildHomeMetrics(counts: {
  activeClients: number
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
      label: "Pending approvals",
      value: "5",
      delta: { label: "agent bookings", direction: "flat" },
      series: [4, 3, 5, 4, 5, 5],
    },
    {
      label: "Active clients",
      value: String(counts.activeClients),
      delta: { label: "client books", direction: "flat" },
      series: [
        Math.max(counts.activeClients - 3, 0),
        Math.max(counts.activeClients - 2, 0),
        Math.max(counts.activeClients - 2, 0),
        Math.max(counts.activeClients - 1, 0),
        counts.activeClients,
        counts.activeClients,
      ],
    },
  ]
}

export const HOME_CHARTS: HomeChart[] = [
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
