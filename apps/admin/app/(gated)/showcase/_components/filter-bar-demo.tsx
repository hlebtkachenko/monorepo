"use client"

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

import {
  createColumnConfigHelper,
  FilterBar,
  useFilterBar,
} from "@workspace/ui/components/filter-bar"
import type { FiltersState } from "@workspace/ui/components/filter-bar"

interface Row {
  id: string
  name: string
  amount: number
  score: number
  publishedAt: Date
  windowAt: Date
  status: "active" | "inactive" | "pending"
  tags: string[]
}

const SAMPLE: Row[] = [
  {
    id: "1",
    name: "Onboarding flow",
    amount: 1200,
    score: 42,
    publishedAt: new Date("2025-03-10"),
    windowAt: new Date("2025-03-12"),
    status: "active",
    tags: ["feature", "docs"],
  },
  {
    id: "2",
    name: "Billing migration",
    amount: 8500,
    score: 87,
    publishedAt: new Date("2025-04-02"),
    windowAt: new Date("2025-04-08"),
    status: "pending",
    tags: ["bug"],
  },
  {
    id: "3",
    name: "Search rewrite",
    amount: 4200,
    score: 64,
    publishedAt: new Date("2025-02-20"),
    windowAt: new Date("2025-02-25"),
    status: "inactive",
    tags: ["feature"],
  },
  {
    id: "4",
    name: "Invoice export",
    amount: 1900,
    score: 30,
    publishedAt: new Date("2025-04-12"),
    windowAt: new Date("2025-04-15"),
    status: "pending",
    tags: ["bug", "docs"],
  },
  {
    id: "5",
    name: "Settings refresh",
    amount: 3100,
    score: 71,
    publishedAt: new Date("2025-03-28"),
    windowAt: new Date("2025-04-02"),
    status: "active",
    tags: ["feature"],
  },
]

const dtf = createColumnConfigHelper<Row>()

const COLUMNS_CONFIG = [
  dtf
    .text()
    .id("name")
    .accessor((r) => r.name)
    .displayName("Name")
    .icon(Type)
    .iconColor("var(--chart-1)")
    .build(),
  dtf
    .number()
    .id("amount")
    .accessor((r) => r.amount)
    .displayName("Amount")
    .icon(Hash)
    .iconColor("var(--chart-2)")
    .min(0)
    .max(10000)
    .build(),
  dtf
    .number()
    .id("score")
    .accessor((r) => r.score)
    .displayName("Score")
    .icon(Sliders)
    .min(0)
    .max(100)
    .build(),
  dtf
    .date()
    .id("publishedAt")
    .accessor((r) => r.publishedAt)
    .displayName("Published at")
    .icon(Calendar)
    .iconColor("var(--chart-3)")
    .build(),
  dtf
    .date()
    .id("windowAt")
    .accessor((r) => r.windowAt)
    .displayName("Window")
    .icon(CalendarRange)
    .build(),
  dtf
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
    .build(),
  dtf
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
    .build(),
] as const

const DEFAULT_FILTERS: FiltersState = [
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
    values: [new Date("2025-03-10")],
  },
  {
    columnId: "windowAt",
    type: "date",
    operator: "is between",
    values: [new Date("2025-03-01"), new Date("2025-03-31")],
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
]

export function FilterBarDemo() {
  const [filters, setFilters] = React.useState<FiltersState>(DEFAULT_FILTERS)
  const { columns, actions, strategy } = useFilterBar({
    strategy: "client" as const,
    data: SAMPLE,
    columnsConfig: COLUMNS_CONFIG,
    filters,
    onFiltersChange: setFilters,
  })

  return (
    <FilterBar
      columns={columns}
      filters={filters}
      actions={actions}
      strategy={strategy}
    />
  )
}
