import type { Meta, StoryObj } from "@storybook/react"
import {
  Chart,
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "./chart"

const meta: Meta<typeof Chart> = {
  title: "Components/Chart",
  component: Chart,
}
export default meta
type Story = StoryObj<typeof Chart>

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
  <div className="h-64 w-full max-w-2xl">{children}</div>
)

// ===== Area =====

export const AreaGradient: Story = {
  render: () => (
    <Box>
      <Chart
        type="area"
        data={seriesData}
        chartConfig={gradientConfig}
        xDataKey="month"
        areaVariant="gradient"
      />
    </Box>
  ),
}

export const AreaSolid: Story = {
  render: () => (
    <Box>
      <Chart
        type="area"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        areaVariant="solid"
      />
    </Box>
  ),
}

export const AreaStacked: Story = {
  render: () => (
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
  ),
}

export const AreaDashed: Story = {
  render: () => (
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
  ),
}

// ===== Bar (Column = vertical bar) =====

export const ColumnChart: Story = {
  render: () => (
    <Box>
      <Chart
        type="bar"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
      />
    </Box>
  ),
}

export const BarHorizontal: Story = {
  render: () => (
    <Box>
      <Chart
        type="bar"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        orientation="horizontal"
      />
    </Box>
  ),
}

export const BarStacked: Story = {
  render: () => (
    <Box>
      <Chart
        type="bar"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        stackType="stacked"
      />
    </Box>
  ),
}

export const BarGradient: Story = {
  render: () => (
    <Box>
      <Chart
        type="bar"
        data={seriesData}
        chartConfig={gradientConfig}
        xDataKey="month"
        barVariant="gradient"
      />
    </Box>
  ),
}

// ===== Line =====

export const LineDefault: Story = {
  render: () => (
    <Box>
      <Chart
        type="line"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
      />
    </Box>
  ),
}

export const LineWithDots: Story = {
  render: () => (
    <Box>
      <Chart
        type="line"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        showDots
      />
    </Box>
  ),
}

export const LineDashed: Story = {
  render: () => (
    <Box>
      <Chart
        type="line"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        strokeVariant="dashed"
      />
    </Box>
  ),
}

// ===== Composed =====

export const ComposedBarAndLine: Story = {
  render: () => (
    <Box>
      <Chart
        type="composed"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        seriesTypes={{ revenue: "bar", expenses: "line" }}
      />
    </Box>
  ),
}

export const ComposedAreaAndBar: Story = {
  render: () => (
    <Box>
      <Chart
        type="composed"
        data={seriesData}
        chartConfig={seriesConfig}
        xDataKey="month"
        seriesTypes={{ revenue: "area", expenses: "bar" }}
      />
    </Box>
  ),
}

// ===== Pie =====

export const PieDefault: Story = {
  render: () => (
    <Box>
      <Chart
        type="pie"
        data={pieData}
        chartConfig={pieConfig}
        nameKey="browser"
        dataKey="visitors"
      />
    </Box>
  ),
}

export const PieDonut: Story = {
  render: () => (
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
  ),
}

// ===== Radar =====

export const RadarFilled: Story = {
  render: () => (
    <Box>
      <Chart
        type="radar"
        data={radarData}
        chartConfig={radarConfig}
        nameKey="category"
      />
    </Box>
  ),
}

export const RadarLines: Story = {
  render: () => (
    <Box>
      <Chart
        type="radar"
        data={radarData}
        chartConfig={radarConfig}
        nameKey="category"
        radarVariant="lines"
      />
    </Box>
  ),
}

// ===== Category bar =====

export const CategoryBarChart: Story = {
  render: () => (
    <div className="w-80">
      <Chart
        type="category-bar"
        values={[40, 25, 20, 15]}
        marker={{ value: 62, tooltip: "Current: 62" }}
      />
    </div>
  ),
}

// ===== Spark (axis-less mini charts) =====

export const SparkArea: Story = {
  render: () => (
    <Chart
      type="spark-area"
      data={seriesData}
      index="month"
      categories={["revenue"]}
    />
  ),
}

export const SparkLine: Story = {
  render: () => (
    <Chart
      type="spark-line"
      data={seriesData}
      index="month"
      categories={["revenue"]}
    />
  ),
}

export const SparkBar: Story = {
  render: () => (
    <Chart
      type="spark-bar"
      data={seriesData}
      index="month"
      categories={["revenue"]}
    />
  ),
}

// ===== Tooltip locale =====

const tooltipPayload = [
  {
    name: "revenue",
    dataKey: "revenue",
    graphicalItemId: "revenue",
    value: 1234567.89,
    color: "var(--chart-1)",
    payload: { month: "Jan", revenue: 1234567.89 },
  },
]

export const TooltipLocaleCzech: Story = {
  render: () => (
    <div className="flex items-start gap-8">
      <ChartContainer config={seriesConfig} className="aspect-auto h-40">
        <ChartTooltipContent active payload={tooltipPayload} />
      </ChartContainer>
      <ChartContainer config={seriesConfig} className="aspect-auto h-40">
        <ChartTooltipContent active payload={tooltipPayload} locale="cs-CZ" />
      </ChartContainer>
    </div>
  ),
}
