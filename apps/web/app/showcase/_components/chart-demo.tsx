"use client"

import { Chart, type ChartConfig } from "@workspace/ui/components/chart"

const seriesConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-2)" },
}

const gradientConfig: ChartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
    gradient: {
      light: ["var(--chart-1)", "var(--chart-2)"],
      dark: ["var(--chart-1)", "var(--chart-2)"],
    },
  },
  expenses: {
    label: "Expenses",
    color: "var(--chart-3)",
    gradient: {
      light: ["var(--chart-3)", "var(--chart-4)"],
      dark: ["var(--chart-3)", "var(--chart-4)"],
    },
  },
}

const seriesData = [
  { month: "Jan", revenue: 4000, expenses: 2400 },
  { month: "Feb", revenue: 3000, expenses: 1398 },
  { month: "Mar", revenue: 6000, expenses: 3200 },
  { month: "Apr", revenue: 5000, expenses: 2800 },
  { month: "May", revenue: 5800, expenses: 3100 },
  { month: "Jun", revenue: 6500, expenses: 3500 },
]

const pieData = [
  { browser: "chrome", visitors: 275 },
  { browser: "safari", visitors: 200 },
  { browser: "firefox", visitors: 187 },
  { browser: "edge", visitors: 173 },
  { browser: "other", visitors: 90 },
]

const pieConfig: ChartConfig = {
  visitors: { label: "Visitors" },
  chrome: { label: "Chrome", color: "var(--chart-1)" },
  safari: { label: "Safari", color: "var(--chart-2)" },
  firefox: { label: "Firefox", color: "var(--chart-3)" },
  edge: { label: "Edge", color: "var(--chart-4)" },
  other: { label: "Other", color: "var(--chart-5)" },
}

const radarData = [
  { category: "Speed", productA: 80, productB: 65 },
  { category: "Quality", productA: 92, productB: 78 },
  { category: "Price", productA: 70, productB: 85 },
  { category: "Support", productA: 88, productB: 72 },
  { category: "Design", productA: 95, productB: 80 },
]

const radarConfig: ChartConfig = {
  productA: { label: "Product A", color: "var(--chart-1)" },
  productB: { label: "Product B", color: "var(--chart-2)" },
}

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="h-64 w-full">{children}</div>
)

// Area variants
export const ChartAreaGradient = () => (
  <Box>
    <Chart
      type="area"
      data={seriesData}
      chartConfig={gradientConfig}
      xDataKey="month"
      areaVariant="gradient"
    />
  </Box>
)
export const ChartAreaSolid = () => (
  <Box>
    <Chart
      type="area"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      areaVariant="solid"
    />
  </Box>
)
export const ChartAreaStacked = () => (
  <Box>
    <Chart
      type="area"
      data={seriesData}
      chartConfig={gradientConfig}
      xDataKey="month"
      areaVariant="gradient"
      stackType="stacked"
    />
  </Box>
)
export const ChartAreaDashed = () => (
  <Box>
    <Chart
      type="area"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      areaVariant="solid"
      strokeVariant="dashed"
    />
  </Box>
)

// Bar / Column variants
export const ChartColumn = () => (
  <Box>
    <Chart
      type="bar"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
    />
  </Box>
)
export const ChartColumnStacked = () => (
  <Box>
    <Chart
      type="bar"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      stackType="stacked"
    />
  </Box>
)
export const ChartColumnGradient = () => (
  <Box>
    <Chart
      type="bar"
      data={seriesData}
      chartConfig={gradientConfig}
      xDataKey="month"
      barVariant="gradient"
    />
  </Box>
)
export const ChartBarHorizontal = () => (
  <Box>
    <Chart
      type="bar"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      orientation="horizontal"
    />
  </Box>
)

// Line variants
export const ChartLineDefault = () => (
  <Box>
    <Chart
      type="line"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
    />
  </Box>
)
export const ChartLineWithDots = () => (
  <Box>
    <Chart
      type="line"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      showDots
    />
  </Box>
)
export const ChartLineDashed = () => (
  <Box>
    <Chart
      type="line"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      strokeVariant="dashed"
    />
  </Box>
)
export const ChartLineStepped = () => (
  <Box>
    <Chart
      type="line"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      curveType="step"
    />
  </Box>
)

// Composed variants
export const ChartComposedBarLine = () => (
  <Box>
    <Chart
      type="composed"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      seriesTypes={{ revenue: "bar", expenses: "line" }}
    />
  </Box>
)
export const ChartComposedAreaBar = () => (
  <Box>
    <Chart
      type="composed"
      data={seriesData}
      chartConfig={seriesConfig}
      xDataKey="month"
      seriesTypes={{ revenue: "area", expenses: "bar" }}
    />
  </Box>
)

// Pie / Donut variants
export const ChartPie = () => (
  <Box>
    <Chart
      type="pie"
      data={pieData}
      chartConfig={pieConfig}
      nameKey="browser"
      dataKey="visitors"
    />
  </Box>
)
export const ChartDonut = () => (
  <Box>
    <Chart
      type="pie"
      data={pieData}
      chartConfig={pieConfig}
      nameKey="browser"
      dataKey="visitors"
      innerRadius={60}
    />
  </Box>
)

// Radar variants
export const ChartRadarFilled = () => (
  <Box>
    <Chart
      type="radar"
      data={radarData}
      chartConfig={radarConfig}
      nameKey="category"
    />
  </Box>
)
export const ChartRadarLines = () => (
  <Box>
    <Chart
      type="radar"
      data={radarData}
      chartConfig={radarConfig}
      nameKey="category"
      radarVariant="lines"
    />
  </Box>
)
