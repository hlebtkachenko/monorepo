import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
import {
  Calendar,
  CalendarRange,
  Hash,
  Sliders,
  Tag,
  Tags,
  Type,
} from "lucide-react"
import { createColumnConfigHelper, FilterBar, useFilterBar } from "./filter-bar"
import type { FiltersState } from "./filter-bar-types"

const JSDate = globalThis.Date
type JSDate = InstanceType<typeof globalThis.Date>

type Row = {
  id: string
  name: string
  amount: number
  score: number
  publishedAt: JSDate
  windowAt: JSDate
  status: "active" | "inactive" | "pending"
  tags: string[]
}

const SAMPLE: Row[] = [
  {
    id: "1",
    name: "Onboarding flow",
    amount: 1200,
    score: 42,
    publishedAt: new JSDate("2025-03-10"),
    windowAt: new JSDate("2025-03-12"),
    status: "active",
    tags: ["feature", "docs"],
  },
  {
    id: "2",
    name: "Billing migration",
    amount: 8500,
    score: 87,
    publishedAt: new JSDate("2025-04-02"),
    windowAt: new JSDate("2025-04-08"),
    status: "pending",
    tags: ["bug"],
  },
  {
    id: "3",
    name: "Search rewrite",
    amount: 4200,
    score: 64,
    publishedAt: new JSDate("2025-02-20"),
    windowAt: new JSDate("2025-02-25"),
    status: "inactive",
    tags: ["feature"],
  },
]

const dtf = createColumnConfigHelper<Row>()

const textColumn = dtf
  .text()
  .id("name")
  .accessor((r) => r.name)
  .displayName("Name")
  .icon(Type)
  .iconColor("var(--chart-1)")
  .build()

const numberColumn = dtf
  .number()
  .id("amount")
  .accessor((r) => r.amount)
  .displayName("Amount")
  .icon(Hash)
  .iconColor("var(--chart-2)")
  .min(0)
  .max(10000)
  .build()

const numberRangeColumn = dtf
  .number()
  .id("score")
  .accessor((r) => r.score)
  .displayName("Score")
  .icon(Sliders)
  .min(0)
  .max(100)
  .build()

const dateColumn = dtf
  .date()
  .id("publishedAt")
  .accessor((r) => r.publishedAt)
  .displayName("Published at")
  .icon(Calendar)
  .iconColor("var(--chart-3)")
  .build()

const dateRangeColumn = dtf
  .date()
  .id("windowAt")
  .accessor((r) => r.windowAt)
  .displayName("Window")
  .icon(CalendarRange)
  .build()

const optionColumn = dtf
  .option()
  .id("status")
  .accessor((r) => r.status)
  .displayName("Status")
  .icon(Tag)
  .iconColor("var(--chart-4)")
  .options([
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "pending", label: "Pending" },
  ])
  .build()

const multiOptionColumn = dtf
  .multiOption()
  .id("tags")
  .accessor((r) => r.tags)
  .displayName("Tags")
  .icon(Tags)
  .iconColor("var(--chart-5)")
  .options([
    { value: "feature", label: "Feature" },
    { value: "bug", label: "Bug" },
    { value: "docs", label: "Docs" },
  ])
  .build()

const ALL_COLUMNS = [
  textColumn,
  numberColumn,
  numberRangeColumn,
  dateColumn,
  dateRangeColumn,
  optionColumn,
  multiOptionColumn,
] as const

interface DemoProps {
  columnsConfig: ReadonlyArray<(typeof ALL_COLUMNS)[number]>
  defaultFilters?: FiltersState
}

function Demo({ columnsConfig, defaultFilters }: DemoProps) {
  const [filters, setFilters] = React.useState<FiltersState>(
    defaultFilters ?? [],
  )
  const { columns, actions, strategy } = useFilterBar({
    strategy: "client" as const,
    data: SAMPLE,
    columnsConfig,
    filters,
    onFiltersChange: setFilters,
  })
  return (
    <div className="w-[960px]">
      <FilterBar
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
      />
    </div>
  )
}

const meta: Meta<typeof FilterBar> = {
  title: "Components/FilterBar",
  component: FilterBar,
}
export default meta
type Story = StoryObj<typeof FilterBar>

export const Default: Story = {
  render: () => (
    <Demo
      columnsConfig={ALL_COLUMNS}
      defaultFilters={[
        {
          columnId: "name",
          type: "text",
          operator: "contains",
          values: ["onboarding"],
        },
        {
          columnId: "amount",
          type: "number",
          operator: "is",
          values: [1200],
        },
        {
          columnId: "score",
          type: "number",
          operator: "is between",
          values: [20, 80],
        },
        {
          columnId: "publishedAt",
          type: "date",
          operator: "is",
          values: [new JSDate("2025-03-10")],
        },
        {
          columnId: "windowAt",
          type: "date",
          operator: "is between",
          values: [new JSDate("2025-03-01"), new JSDate("2025-03-31")],
        },
        {
          columnId: "status",
          type: "option",
          operator: "is",
          values: ["active"],
        },
        {
          columnId: "tags",
          type: "multiOption",
          operator: "include any of",
          values: ["feature", "bug"],
        },
      ]}
    />
  ),
}

export const Text: Story = {
  render: () => (
    <Demo
      columnsConfig={[textColumn]}
      defaultFilters={[
        {
          columnId: "name",
          type: "text",
          operator: "contains",
          values: ["billing"],
        },
      ]}
    />
  ),
}

export const Number: Story = {
  render: () => (
    <Demo
      columnsConfig={[numberColumn]}
      defaultFilters={[
        {
          columnId: "amount",
          type: "number",
          operator: "is greater than",
          values: [2000],
        },
      ]}
    />
  ),
}

export const NumberRange: Story = {
  render: () => (
    <Demo
      columnsConfig={[numberRangeColumn]}
      defaultFilters={[
        {
          columnId: "score",
          type: "number",
          operator: "is between",
          values: [25, 75],
        },
      ]}
    />
  ),
}

export const Date: Story = {
  render: () => (
    <Demo
      columnsConfig={[dateColumn]}
      defaultFilters={[
        {
          columnId: "publishedAt",
          type: "date",
          operator: "is",
          values: [new JSDate("2025-03-10")],
        },
      ]}
    />
  ),
}

export const DateRange: Story = {
  render: () => (
    <Demo
      columnsConfig={[dateRangeColumn]}
      defaultFilters={[
        {
          columnId: "windowAt",
          type: "date",
          operator: "is between",
          values: [new JSDate("2025-03-01"), new JSDate("2025-03-31")],
        },
      ]}
    />
  ),
}

export const Option: Story = {
  render: () => (
    <Demo
      columnsConfig={[optionColumn]}
      defaultFilters={[
        {
          columnId: "status",
          type: "option",
          operator: "is",
          values: ["active"],
        },
      ]}
    />
  ),
}

export const MultiOption: Story = {
  render: () => (
    <Demo
      columnsConfig={[multiOptionColumn]}
      defaultFilters={[
        {
          columnId: "tags",
          type: "multiOption",
          operator: "include any of",
          values: ["feature", "bug", "docs"],
        },
      ]}
    />
  ),
}
