import type { Meta, StoryObj } from "@storybook/react"
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
} from "./data-table-filter"

type Row = {
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
]

const dtf = createColumnConfigHelper<Row>()

const columnsConfig = [
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

function Demo({
  ids = ["name", "status", "createdAt"],
}: {
  ids?: ReadonlyArray<string>
}) {
  const subset = React.useMemo(
    () => columnsConfig.filter((c) => ids.includes(c.id)),
    [ids],
  )
  const { columns, filters, actions, strategy } = useDataTableFilters({
    strategy: "client" as const,
    data: SAMPLE,
    columnsConfig: subset,
  })
  return (
    <div className="w-[720px]">
      <DataTableFilter
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
      />
    </div>
  )
}

const meta: Meta<typeof DataTableFilter> = {
  title: "Components/DataTableFilter",
  component: DataTableFilter,
}
export default meta
type Story = StoryObj<typeof DataTableFilter>

export const Default: Story = {
  render: () => <Demo />,
}

export const WithOperators: Story = {
  render: () => <Demo ids={["name", "amount", "status"]} />,
}

export const WithDateRange: Story = {
  render: () => <Demo ids={["createdAt"]} />,
}

export const WithMultiSelect: Story = {
  render: () => <Demo ids={["tags", "status"]} />,
}
