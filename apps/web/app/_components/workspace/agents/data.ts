import type {
  DashboardChartCardProps,
  MetricTileProps,
} from "@workspace/ui/blocks/app-content"

/**
 * Mock data for the Agents dashboard (`/workspace/agents`) — the firm-office
 * automation control center. Afframe is agent-native: AI agents do the
 * bookkeeping across every client book and accountants supervise. This surface
 * rolls that up across ALL clients: how many agents are working, how much they
 * ran today, what's waiting for human approval, and where they hit exceptions.
 *
 * Fully static + deterministic (no `Math.random` / `Date.now`) so the render is
 * stable across reloads. A real page swaps these constants for query results;
 * the `DashboardGrid` / `DashboardChartCard` block contracts are unchanged.
 */

/** The four KPI tiles, top row of the dashboard. */
export const METRICS: MetricTileProps[] = [
  {
    label: "Active agents",
    value: "12",
    delta: { label: "+2", direction: "up" },
    series: [8, 9, 9, 10, 11, 12],
  },
  {
    label: "Runs today",
    value: "184",
    delta: { label: "+18%", direction: "up" },
    series: [96, 121, 138, 150, 167, 184],
  },
  {
    label: "Pending approvals",
    value: "27",
    delta: { label: "-6", direction: "down" },
    series: [41, 38, 35, 33, 30, 27],
  },
  {
    label: "Exceptions",
    value: "5",
    delta: { label: "+1", direction: "up" },
    series: [2, 3, 3, 4, 4, 5],
  },
]

/**
 * One chart card's props. Extends the block's `DashboardChartCardProps` (title +
 * data + chartConfig + xKey + chartType) with a stable `id` for React keys.
 */
export interface AgentsChart extends Pick<
  DashboardChartCardProps,
  "title" | "data" | "chartConfig" | "xKey" | "chartType"
> {
  id: string
}

/** Agent runs per day over the trailing week — a line trend. */
const RUNS_OVER_TIME = [
  { day: "Mon", runs: 96 },
  { day: "Tue", runs: 121 },
  { day: "Wed", runs: 138 },
  { day: "Thu", runs: 150 },
  { day: "Fri", runs: 167 },
  { day: "Sat", runs: 62 },
  { day: "Sun", runs: 184 },
]

/**
 * Today's bookings bucketed by the agent's confidence in the posting — how much
 * cleared automatically vs. landed in the review queue.
 */
const BOOKINGS_BY_CONFIDENCE = [
  { band: "High", bookings: 132 },
  { band: "Medium", bookings: 41 },
  { band: "Low", bookings: 27 },
  { band: "Needs review", bookings: 11 },
]

export const CHARTS: AgentsChart[] = [
  {
    id: "runs-over-time",
    title: "Runs over time",
    chartType: "line",
    xKey: "day",
    chartConfig: { runs: { label: "Runs", color: "var(--chart-2)" } },
    data: RUNS_OVER_TIME,
  },
  {
    id: "bookings-by-confidence",
    title: "Bookings by confidence",
    chartType: "bar",
    xKey: "band",
    chartConfig: { bookings: { label: "Bookings", color: "var(--chart-1)" } },
    data: BOOKINGS_BY_CONFIDENCE,
  },
]

/** Timeframe options for the toolbar Select (presentational only). */
export const TIMEFRAME_OPTIONS: { value: string; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This week" },
  { value: "this-month", label: "This month" },
]
