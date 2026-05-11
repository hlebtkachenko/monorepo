"use client"

import * as React from "react"
import {
  CalendarIcon,
  CircleDotIcon,
  HashIcon,
  TagIcon,
  TypeIcon,
} from "lucide-react"

import {
  createColumnConfigHelper,
  DataTableFilter,
  useDataTableFilters,
} from "@workspace/ui/components/data-table-filter"

interface Row {
  id: string
  name: string
  status: "todo" | "in-progress" | "done"
  amount: number
  createdAt: Date
  tags: string[]
}

const SAMPLE: Row[] = [
  {
    id: "1",
    name: "Onboarding flow",
    status: "in-progress",
    amount: 1200,
    createdAt: new Date("2025-03-10"),
    tags: ["product", "ux"],
  },
  {
    id: "2",
    name: "Billing migration",
    status: "todo",
    amount: 8500,
    createdAt: new Date("2025-04-02"),
    tags: ["billing", "infra"],
  },
  {
    id: "3",
    name: "Search rewrite",
    status: "done",
    amount: 4200,
    createdAt: new Date("2025-02-20"),
    tags: ["search"],
  },
  {
    id: "4",
    name: "Invoice export",
    status: "todo",
    amount: 1900,
    createdAt: new Date("2025-04-12"),
    tags: ["billing"],
  },
  {
    id: "5",
    name: "Settings refresh",
    status: "in-progress",
    amount: 3100,
    createdAt: new Date("2025-03-28"),
    tags: ["ux"],
  },
]

const dtf = createColumnConfigHelper<Row>()

const COLUMNS_CONFIG = [
  dtf
    .text()
    .id("name")
    .accessor((r) => r.name)
    .displayName("Name")
    .icon(TypeIcon)
    .build(),
  dtf
    .option()
    .id("status")
    .accessor((r) => r.status)
    .displayName("Status")
    .icon(CircleDotIcon)
    .options([
      { value: "todo", label: "Todo" },
      { value: "in-progress", label: "In progress" },
      { value: "done", label: "Done" },
    ])
    .build(),
  dtf
    .number()
    .id("amount")
    .accessor((r) => r.amount)
    .displayName("Amount")
    .icon(HashIcon)
    .min(0)
    .max(10000)
    .build(),
  dtf
    .date()
    .id("createdAt")
    .accessor((r) => r.createdAt)
    .displayName("Created at")
    .icon(CalendarIcon)
    .build(),
  dtf
    .multiOption()
    .id("tags")
    .accessor((r) => r.tags)
    .displayName("Tags")
    .icon(TagIcon)
    .options([
      { value: "product", label: "Product" },
      { value: "ux", label: "UX" },
      { value: "billing", label: "Billing" },
      { value: "infra", label: "Infra" },
      { value: "search", label: "Search" },
    ])
    .build(),
] as const

export function DataTableFilterDemo() {
  const { columns, filters, actions, strategy } = useDataTableFilters({
    strategy: "client" as const,
    data: SAMPLE,
    columnsConfig: COLUMNS_CONFIG,
  })

  return (
    <DataTableFilter
      columns={columns}
      filters={filters}
      actions={actions}
      strategy={strategy}
    />
  )
}
