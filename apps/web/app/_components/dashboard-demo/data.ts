import type {
  DashboardChartCardProps,
  MetricTileProps,
} from "@workspace/ui/blocks/app-content"

/**
 * Mock dashboard data for the #425 demo. Unlike a static KPI list, this is a
 * real transaction ledger that the toolbar FILTERS and the body AGGREGATES from
 * — so a filter (account / category / cost centre / date) or the granularity
 * toggle visibly changes every tile and chart. A real page swaps the ledger for
 * query results; the aggregation + `DashboardGrid` block are unchanged.
 */
export type DashboardView = "overview" | "revenue" | "expenses"
export type Granularity = "month" | "quarter"

/**
 * A predefined analytics timeframe. Each maps to the granularity that
 * `aggregate(...)` buckets by, so picking one re-buckets every tile + chart.
 * The mock ledger spans Jan–Jun 2026, so the "window" of every option resolves
 * to that span here; in a real page each would carry its own date filter.
 */
export type Timeframe =
  | "this-month"
  | "this-quarter"
  | "this-year"
  | "last-6-months"

export const TIMEFRAME_OPTIONS: {
  value: Timeframe
  label: string
  granularity: Granularity
}[] = [
  { value: "this-month", label: "This month", granularity: "month" },
  { value: "this-quarter", label: "This quarter", granularity: "quarter" },
  { value: "this-year", label: "This year", granularity: "quarter" },
  { value: "last-6-months", label: "Last 6 months", granularity: "month" },
]

export const granularityOf = (timeframe: Timeframe): Granularity =>
  TIMEFRAME_OPTIONS.find((t) => t.value === timeframe)?.granularity ?? "month"

export interface Transaction {
  id: string
  date: string // ISO yyyy-mm-dd
  account: string
  category: string
  costCenter: string
  type: "income" | "expense"
  amount: number // CZK, always positive; `type` carries the sign
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]

// A compact but varied ledger: 6 months, 3 accounts, 5 categories, 2 centres.
export const TRANSACTIONS: Transaction[] = [
  {
    id: "t1",
    date: "2026-01-09",
    account: "Main",
    category: "Sales",
    costCenter: "HQ",
    type: "income",
    amount: 82000,
  },
  {
    id: "t2",
    date: "2026-01-18",
    account: "Main",
    category: "Energy",
    costCenter: "HQ",
    type: "expense",
    amount: 31000,
  },
  {
    id: "t3",
    date: "2026-01-24",
    account: "Card",
    category: "Office",
    costCenter: "Branch",
    type: "expense",
    amount: 12000,
  },
  {
    id: "t4",
    date: "2026-02-06",
    account: "Main",
    category: "Sales",
    costCenter: "HQ",
    type: "income",
    amount: 90000,
  },
  {
    id: "t5",
    date: "2026-02-15",
    account: "Savings",
    category: "Services",
    costCenter: "HQ",
    type: "income",
    amount: 18000,
  },
  {
    id: "t6",
    date: "2026-02-21",
    account: "Main",
    category: "Energy",
    costCenter: "HQ",
    type: "expense",
    amount: 28000,
  },
  {
    id: "t7",
    date: "2026-02-27",
    account: "Card",
    category: "Travel",
    costCenter: "Branch",
    type: "expense",
    amount: 9000,
  },
  {
    id: "t8",
    date: "2026-03-04",
    account: "Main",
    category: "Sales",
    costCenter: "Branch",
    type: "income",
    amount: 88000,
  },
  {
    id: "t9",
    date: "2026-03-12",
    account: "Main",
    category: "Office",
    costCenter: "HQ",
    type: "expense",
    amount: 14000,
  },
  {
    id: "t10",
    date: "2026-03-22",
    account: "Card",
    category: "Energy",
    costCenter: "Branch",
    type: "expense",
    amount: 22000,
  },
  {
    id: "t11",
    date: "2026-04-03",
    account: "Main",
    category: "Sales",
    costCenter: "HQ",
    type: "income",
    amount: 102000,
  },
  {
    id: "t12",
    date: "2026-04-14",
    account: "Savings",
    category: "Services",
    costCenter: "HQ",
    type: "income",
    amount: 21000,
  },
  {
    id: "t13",
    date: "2026-04-19",
    account: "Main",
    category: "Energy",
    costCenter: "HQ",
    type: "expense",
    amount: 33000,
  },
  {
    id: "t14",
    date: "2026-04-28",
    account: "Card",
    category: "Travel",
    costCenter: "Branch",
    type: "expense",
    amount: 11000,
  },
  {
    id: "t15",
    date: "2026-05-08",
    account: "Main",
    category: "Sales",
    costCenter: "HQ",
    type: "income",
    amount: 115000,
  },
  {
    id: "t16",
    date: "2026-05-17",
    account: "Main",
    category: "Office",
    costCenter: "Branch",
    type: "expense",
    amount: 16000,
  },
  {
    id: "t17",
    date: "2026-05-25",
    account: "Card",
    category: "Energy",
    costCenter: "Branch",
    type: "expense",
    amount: 24000,
  },
  {
    id: "t18",
    date: "2026-06-05",
    account: "Main",
    category: "Sales",
    costCenter: "HQ",
    type: "income",
    amount: 124000,
  },
  {
    id: "t19",
    date: "2026-06-13",
    account: "Savings",
    category: "Services",
    costCenter: "HQ",
    type: "income",
    amount: 19000,
  },
  {
    id: "t20",
    date: "2026-06-22",
    account: "Main",
    category: "Energy",
    costCenter: "HQ",
    type: "expense",
    amount: 35000,
  },
  {
    id: "t21",
    date: "2026-06-29",
    account: "Card",
    category: "Office",
    costCenter: "Branch",
    type: "expense",
    amount: 13000,
  },
]

const distinct = (key: keyof Transaction) =>
  Array.from(new Set(TRANSACTIONS.map((t) => String(t[key])))).map((v) => ({
    value: v,
    label: v,
  }))

export const ACCOUNT_OPTIONS = distinct("account")
export const CATEGORY_OPTIONS = distinct("category")
export const COST_CENTER_OPTIONS = distinct("costCenter")

export const DASHBOARD_TABS: { value: DashboardView; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "revenue", label: "Revenue" },
  { value: "expenses", label: "Expenses" },
]

const fmtCZK = (n: number) =>
  // Normalise cs-CZ narrow no-break thousands separators to plain spaces.
  `${Math.round(n)
    .toLocaleString("cs-CZ")
    .replace(/[\u00a0\u202f]/g, " ")} Kč`

const monthIndex = (iso: string) => Number(iso.slice(5, 7)) - 1

const bucketOf = (iso: string, g: Granularity): string => {
  const m = monthIndex(iso)
  return g === "quarter" ? `Q${Math.floor(m / 3) + 1}` : (MONTHS[m] ?? "—")
}

// Buckets are DERIVED from the full ledger (not hardcoded), so the axis stays
// correct + stable for any date span; a filter just zeroes the empty buckets.
const bucketsFor = (g: Granularity): string[] => {
  const present = new Set(TRANSACTIONS.map((t) => bucketOf(t.date, g)))
  const order = g === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MONTHS
  return order.filter((b) => present.has(b))
}

const deltaOf = (
  series: number[],
): { label: string; direction: "up" | "down" | "flat" } => {
  if (series.length < 2) return { label: "0%", direction: "flat" }
  const prev = series[series.length - 2]
  const last = series[series.length - 1]
  if (prev === undefined || last === undefined) {
    return { label: "0%", direction: "flat" }
  }
  // A zero previous bucket isn't "no data" — a jump from 0 is real growth.
  if (prev === 0) {
    return last > 0
      ? { label: "New", direction: "up" }
      : { label: "0%", direction: "flat" }
  }
  // Note: for sign-changing series (Result) the magnitude is indicative only.
  const pct = ((last - prev) / Math.abs(prev)) * 100
  return {
    label: `${Math.abs(pct).toFixed(1)}%`,
    direction: pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat",
  }
}

export interface DashboardChart extends Pick<
  DashboardChartCardProps,
  "title" | "data" | "chartConfig" | "xKey" | "chartType"
> {
  id: string
}

/**
 * The "Line"/table view of the same aggregation: a financial-statement matrix
 * with metrics as ROWS and time buckets as COLUMNS. Numeric rows render
 * right-aligned CZK; the count row renders plain integers. Rows are
 * hierarchical — Revenue/Expenses carry per-category `children` that expand in
 * the interactive matrix. Structurally matches the block's `DashboardMatrixData`.
 */
interface DashboardMatrixRow {
  label: string
  /** Pre-formatted cell per column (CZK or integer count). */
  cells: string[]
  /** Pre-formatted row total. */
  total: string
  /** Optional per-category breakdown rows (e.g. Revenue → Sales, Services). */
  children?: DashboardMatrixRow[]
}

export interface DashboardMatrix {
  columns: string[]
  rows: DashboardMatrixRow[]
}

/**
 * Aggregate a (filtered) ledger into KPI tiles + chart series, scoped by the
 * active view tab and bucketed by the granularity. This is the seam the toolbar
 * drives: change the filters/granularity → different `rows`/`g` → different
 * numbers everywhere.
 */
export function aggregate(
  rows: Transaction[],
  view: DashboardView,
  g: Granularity,
): {
  metrics: MetricTileProps[]
  charts: DashboardChart[]
  matrix: DashboardMatrix
} {
  const buckets = bucketsFor(g)
  const sumBy = (pred: (t: Transaction) => boolean) =>
    buckets.map((b) =>
      rows
        .filter((t) => pred(t) && bucketOf(t.date, g) === b)
        .reduce((s, t) => s + t.amount, 0),
    )

  const revenueSeries = sumBy((t) => t.type === "income")
  const expenseSeries = sumBy((t) => t.type === "expense")
  const resultSeries = buckets.map(
    (_, i) => (revenueSeries[i] ?? 0) - (expenseSeries[i] ?? 0),
  )
  const countSeries = buckets.map(
    (b) => rows.filter((t) => bucketOf(t.date, g) === b).length,
  )
  const cumResult = resultSeries.reduce<number[]>((acc, v) => {
    acc.push((acc[acc.length - 1] ?? 0) + v)
    return acc
  }, [])

  const sum = (s: number[]) => s.reduce((a, b) => a + b, 0)

  const revenueTile: MetricTileProps = {
    label: "Revenue",
    value: fmtCZK(sum(revenueSeries)),
    delta: deltaOf(revenueSeries),
    series: revenueSeries,
  }
  const expensesTile: MetricTileProps = {
    label: "Expenses",
    value: fmtCZK(sum(expenseSeries)),
    delta: deltaOf(expenseSeries),
    series: expenseSeries,
  }
  const resultTile: MetricTileProps = {
    label: "Result",
    value: fmtCZK(sum(resultSeries)),
    delta: deltaOf(resultSeries),
    series: resultSeries,
  }
  const countTile: MetricTileProps = {
    label: "Transactions",
    value: String(rows.length),
    delta: deltaOf(countSeries),
    series: countSeries,
  }

  const metrics =
    view === "revenue"
      ? [revenueTile, countTile]
      : view === "expenses"
        ? [expensesTile, countTile]
        : [revenueTile, expensesTile, resultTile, countTile]

  const byBucket = buckets.map((b, i) => ({
    bucket: b,
    revenue: revenueSeries[i] ?? 0,
    expenses: expenseSeries[i] ?? 0,
    result: cumResult[i] ?? 0,
  }))

  const REVENUE = { revenue: { label: "Revenue", color: "var(--chart-2)" } }
  const EXPENSES = { expenses: { label: "Expenses", color: "var(--chart-1)" } }

  // Charts are scoped to the active view so the header tabs change the body, not
  // just the tiles.
  const charts: DashboardChart[] =
    view === "revenue"
      ? [
          {
            id: "rev-trend",
            title: "Revenue trend",
            chartType: "line",
            xKey: "bucket",
            chartConfig: REVENUE,
            data: byBucket,
          },
          {
            id: "rev-bar",
            title: "Revenue by period",
            chartType: "bar",
            xKey: "bucket",
            chartConfig: REVENUE,
            data: byBucket,
          },
        ]
      : view === "expenses"
        ? [
            {
              id: "exp-trend",
              title: "Expenses trend",
              chartType: "line",
              xKey: "bucket",
              chartConfig: EXPENSES,
              data: byBucket,
            },
            {
              id: "exp-bar",
              title: "Expenses by period",
              chartType: "bar",
              xKey: "bucket",
              chartConfig: EXPENSES,
              data: byBucket,
            },
          ]
        : [
            {
              id: "rev-exp",
              title: "Revenue vs. expenses",
              chartType: "bar",
              xKey: "bucket",
              chartConfig: { ...REVENUE, ...EXPENSES },
              data: byBucket,
            },
            {
              id: "result",
              title: "Running result",
              chartType: "line",
              xKey: "bucket",
              chartConfig: {
                result: { label: "Result", color: "var(--chart-3)" },
              },
              data: byBucket,
            },
          ]

  // The matrix (Line view) mirrors the metric scope: same rows the tiles show,
  // but expanded per bucket. Numeric rows are CZK; the count row is integers.
  const numericRow = (
    label: string,
    series: number[],
    children?: DashboardMatrixRow[],
  ): DashboardMatrixRow => ({
    label,
    cells: buckets.map((_, i) => fmtCZK(series[i] ?? 0)),
    total: fmtCZK(sum(series)),
    ...(children && children.length > 0 ? { children } : {}),
  })
  const countRow = (label: string, series: number[]): DashboardMatrixRow => ({
    label,
    cells: buckets.map((_, i) => String(series[i] ?? 0)),
    total: String(rows.length),
  })

  // Per-category child rows for a transaction type. Categories present in the
  // (filtered) ledger become the breakdown; each child's cells sum to the
  // parent's — the aggregate is unchanged, just expandable.
  const categoryChildren = (type: Transaction["type"]): DashboardMatrixRow[] =>
    Array.from(
      new Set(rows.filter((t) => t.type === type).map((t) => t.category)),
    )
      .sort((a, b) => a.localeCompare(b))
      .map((category) =>
        numericRow(
          category,
          buckets.map((b) =>
            rows
              .filter(
                (t) =>
                  t.type === type &&
                  t.category === category &&
                  bucketOf(t.date, g) === b,
              )
              .reduce((s, t) => s + t.amount, 0),
          ),
        ),
      )

  const allRows = {
    revenue: numericRow("Revenue", revenueSeries, categoryChildren("income")),
    expenses: numericRow(
      "Expenses",
      expenseSeries,
      categoryChildren("expense"),
    ),
    result: numericRow("Result", resultSeries),
    transactions: countRow("Transactions", countSeries),
  }
  const matrixRows =
    view === "revenue"
      ? [allRows.revenue, allRows.transactions]
      : view === "expenses"
        ? [allRows.expenses, allRows.transactions]
        : [
            allRows.revenue,
            allRows.expenses,
            allRows.result,
            allRows.transactions,
          ]

  const matrix: DashboardMatrix = { columns: buckets, rows: matrixRows }

  return { metrics, charts, matrix }
}
