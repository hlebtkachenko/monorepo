"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import { type InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import {
  SectionList,
  sectionInspectorKeyDetails,
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentToolbarProps,
  SectionDescriptor,
  TableColumnSpec,
  TableSectionRow,
} from "@workspace/ui/blocks/content-panel"
import {
  createColumnConfigHelper,
  dateFilterFn,
  numberFilterFn,
  optionFilterFn,
  textFilterFn,
  useFilterBar,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { formatDecimal } from "@workspace/ui/lib/format-number"
import {
  BaselineIcon,
  Calculator,
  CalendarIcon,
  ListIcon,
} from "@workspace/ui/lib/icons"

/**
 * A cash-journal (peněžní deník) line as flat scalar data, mapped from the domain
 * `MonetaryJournalRow` by the server page. Money fields stay decimal STRINGS
 * (never a JS number). `direction` / `location` carry the raw enum so the client
 * can classify without re-formatting. This is the FIRST real-data consumer of the
 * ArchetypeTable; the running `balance` is derived on top (see `withRunningBalance`).
 */
export type CashJournalTableRow = {
  /** posting_monetary_line.id — the stable per-line id (rowIdKey). */
  id: string
  /** ISO posting date ("2026-06-01"), rendered by the `date` cell kind. */
  date: string
  /** Doklad Označení. */
  document: string
  /** Resolved kategorie name (may be empty for a generated / clearing line). */
  category: string
  /** CASH | BANK. */
  location: string
  /** INFLOW | OUTFLOW. */
  direction: string
  /** "yes" | "no" — tax-relevant flag as an option value. */
  taxRelevant: string
  /** Základ daně as a decimal string, or "" when null. */
  taxBase: string
  /** Částka as a decimal string. */
  amount: string
}

const DIRECTION_OPTIONS = [
  { value: "INFLOW", label: "Příjem" },
  { value: "OUTFLOW", label: "Výdej" },
]

const LOCATION_OPTIONS = [
  { value: "CASH", label: "Pokladna" },
  { value: "BANK", label: "Banka" },
]

const TAX_OPTIONS = [
  { value: "yes", label: "Ano" },
  { value: "no", label: "Ne" },
]

const labelFor = (
  options: { value: string; label: string }[],
  value: string,
): string => options.find((o) => o.value === value)?.label ?? value

// ── Precision-safe running balance ─────────────────────────────────────────
// Money is numeric(19,4). Parse each decimal string to INTEGER scaled units
// (×10^4) as a bigint, accumulate with bigint arithmetic (INFLOW adds, OUTFLOW
// subtracts), and format back to a 4-decimal string. `Number()` never touches a
// money value — the whole point of transporting money as a string.

const SCALE = 10000n

/** "1234.5" / "1234.5000" / "-12.34" → integer units ×10^4 as bigint. */
function toScaledUnits(value: string): bigint {
  const trimmed = value.trim()
  if (trimmed === "") return 0n
  const negative = trimmed.startsWith("-")
  const abs = negative ? trimmed.slice(1) : trimmed
  const [intPart = "0", fracRaw = ""] = abs.split(".")
  const frac = (fracRaw + "0000").slice(0, 4) // pad / truncate to 4 dp
  const units = BigInt(intPart || "0") * SCALE + BigInt(frac || "0")
  return negative ? -units : units
}

/** Integer units ×10^4 → a 4-decimal string ("12345000" → "1234.5000"). */
function fromScaledUnits(units: bigint): string {
  const negative = units < 0n
  const abs = negative ? -units : units
  const whole = abs / SCALE
  const frac = (abs % SCALE).toString().padStart(4, "0")
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`
}

/**
 * Add the running Zůstatek (balance) to each row, in chronological book order —
 * the rows arrive already ordered by posting date from the server read. The
 * balance is a per-row cumulative decimal string; filtering / re-sorting in the
 * grid never recomputes it, so each visible row keeps its true chronological
 * balance (standard ledger semantics).
 */
function withRunningBalance(rows: CashJournalTableRow[]): TableSectionRow[] {
  let running = 0n
  return rows.map((row) => {
    const delta = toScaledUnits(row.amount)
    running += row.direction === "INFLOW" ? delta : -delta
    return { ...row, balance: fromScaledUnits(running) }
  })
}

// ── Columns (peněžní deník standard, all backed by real domain data) ────────
const COLUMNS: TableColumnSpec[] = [
  {
    id: "document",
    header: "Doklad",
    kind: "text",
    role: "id",
    pin: "left",
    width: 150,
  },
  { id: "date", header: "Datum", kind: "date", width: 120 },
  { id: "category", header: "Kategorie", kind: "text", width: 220 },
  {
    id: "location",
    header: "Místo",
    kind: "select",
    options: LOCATION_OPTIONS,
    width: 120,
  },
  {
    id: "direction",
    header: "Druh",
    kind: "badge",
    options: DIRECTION_OPTIONS,
    // Delegated to the faceted Status filter — excluded from the multi-filter.
    enableFilter: true,
    width: 110,
  },
  {
    id: "taxRelevant",
    header: "Daňový",
    kind: "select",
    options: TAX_OPTIONS,
    width: 110,
  },
  {
    id: "taxBase",
    header: "Základ daně (Kč)",
    kind: "currency",
    align: "end",
    width: 150,
  },
  {
    id: "amount",
    header: "Částka (Kč)",
    kind: "currency",
    align: "end",
    width: 150,
  },
  {
    id: "balance",
    header: "Zůstatek (Kč)",
    kind: "currency",
    align: "end",
    width: 160,
  },
]

// Multi-filter columns for the toolbar `filter` slot — every table column EXCEPT
// `direction` (delegated to the faceted Status filter). `client` strategy: the
// resulting FiltersState is applied to the rows here (external pre-filter).
const filterHelper = createColumnConfigHelper<TableSectionRow>()
const FILTER_COLUMNS = [
  filterHelper
    .text()
    .id("document")
    .accessor((row) => String(row.document ?? ""))
    .displayName("Doklad")
    .icon(BaselineIcon)
    .build(),
  filterHelper
    .date()
    .id("date")
    .accessor((row) => new Date(String(row.date ?? "")))
    .displayName("Datum")
    .icon(CalendarIcon)
    .build(),
  filterHelper
    .text()
    .id("category")
    .accessor((row) => String(row.category ?? ""))
    .displayName("Kategorie")
    .icon(BaselineIcon)
    .build(),
  filterHelper
    .option()
    .id("location")
    .accessor((row) => String(row.location ?? ""))
    .displayName("Místo")
    .icon(ListIcon)
    .options(LOCATION_OPTIONS)
    .build(),
  filterHelper
    .option()
    .id("taxRelevant")
    .accessor((row) => String(row.taxRelevant ?? ""))
    .displayName("Daňový")
    .icon(ListIcon)
    .options(TAX_OPTIONS)
    .build(),
  filterHelper
    .number()
    .id("taxBase")
    .accessor((row) => Number(row.taxBase ?? 0))
    .displayName("Základ daně")
    .icon(Calculator)
    .build(),
  filterHelper
    .number()
    .id("amount")
    .accessor((row) => Number(row.amount ?? 0))
    .displayName("Částka")
    .icon(Calculator)
    .build(),
  filterHelper
    .number()
    .id("balance")
    .accessor((row) => Number(row.balance ?? 0))
    .displayName("Zůstatek")
    .icon(Calculator)
    .build(),
] as const

/** Apply the active multi-filter chips to a row (client strategy). */
function matchesFilters(row: TableSectionRow, filters: FiltersState): boolean {
  return filters.every((filter) => {
    const raw = row[filter.columnId]
    switch (filter.type) {
      case "text":
        return textFilterFn(String(raw ?? ""), filter as FilterModel<"text">)
      case "number":
        return numberFilterFn(Number(raw ?? 0), filter as FilterModel<"number">)
      case "date":
        return dateFilterFn(
          new Date(String(raw ?? "")),
          filter as FilterModel<"date">,
        )
      case "option":
        return optionFilterFn(
          String(raw ?? ""),
          filter as FilterModel<"option">,
        )
      default:
        return true
    }
  })
}

/** Read-only Inspector for a cash-journal line — one Details tab of static key
 *  lines. Money lines are pre-formatted decimal strings (precision-safe, never a
 *  JS number); dates go through the key-line `date` kind. */
function buildInspectorTabs(
  row: TableSectionRow,
): Partial<Record<InspectorTab, React.ReactNode>> {
  const taxBase = String(row.taxBase ?? "")
  const money = (value: string): string =>
    value === "" ? "" : `${formatDecimal(value)} Kč`
  const sections: SectionDescriptor[] = [
    sectionInspectorKeyDetails({
      lines: [
        {
          label: "Doklad",
          value: String(row.document ?? ""),
          icon: "HashIcon",
          readOnly: true,
        },
        {
          label: "Datum",
          value: String(row.date ?? ""),
          type: "date",
          icon: "CalendarIcon",
          readOnly: true,
        },
        {
          label: "Kategorie",
          value: String(row.category ?? ""),
          icon: "Box",
          readOnly: true,
        },
        {
          label: "Místo",
          value: labelFor(LOCATION_OPTIONS, String(row.location ?? "")),
          icon: "Banknote",
          readOnly: true,
        },
        {
          label: "Druh",
          value: labelFor(DIRECTION_OPTIONS, String(row.direction ?? "")),
          icon: "ArrowUpDown",
          readOnly: true,
        },
        {
          label: "Daňový",
          value: labelFor(TAX_OPTIONS, String(row.taxRelevant ?? "")),
          icon: "CheckCircle2",
          readOnly: true,
        },
        ...(taxBase !== ""
          ? [
              {
                label: "Základ daně",
                value: money(taxBase),
                icon: "Calculator" as const,
                readOnly: true,
              },
            ]
          : []),
        {
          label: "Částka",
          value: money(String(row.amount ?? "")),
          icon: "Banknote",
          readOnly: true,
        },
        {
          label: "Zůstatek",
          value: money(String(row.balance ?? "")),
          icon: "BarChart3",
          readOnly: true,
        },
      ],
    }),
  ]
  return {
    details: (
      <div className="flex flex-col gap-6">
        <SectionList sections={sections} />
      </div>
    ),
  }
}

/**
 * Cash journal (peněžní deník) — the Table archetype over the period's classified
 * monetary lines. The FIRST real-data consumer of the ArchetypeTable: server-read
 * rows carry money as decimal strings and this view derives the running balance,
 * mints the branded `sectionTable` (currency / date cell kinds), and drives the
 * faceted Druh (Příjem / Výdej) filter + multi-filter + universal search + a
 * read-only row Inspector. Branded section descriptors are minted here, inside the
 * client boundary (RSC rule).
 */
export function CashJournalView({ rows }: { rows: CashJournalTableRow[] }) {
  const [search, setSearch] = React.useState("")
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<FiltersState>([])

  const balancedRows = React.useMemo(() => withRunningBalance(rows), [rows])

  const {
    columns: filterColumns,
    actions: filterActions,
    strategy: filterStrategy,
  } = useFilterBar({
    strategy: "client" as const,
    data: balancedRows,
    columnsConfig: FILTER_COLUMNS,
    filters,
    onFiltersChange: setFilters,
  })

  const visibleRows = React.useMemo(
    () =>
      filters.length
        ? balancedRows.filter((row) => matchesFilters(row, filters))
        : balancedRows,
    [balancedRows, filters],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> => {
      const directionColumn = table?.getColumn("direction")
      const directionValue =
        (directionColumn?.getFilterValue() as string[]) ?? []
      return {
        statusFilter: {
          title: "Druh",
          columnId: "direction",
          options: DIRECTION_OPTIONS,
          value: directionValue,
          onChange: (value) =>
            directionColumn?.setFilterValue(value.length ? value : undefined),
          multiple: true,
          open: statusOpen,
          onOpenChange: setStatusOpen,
        },
        search: {
          value: search,
          onChange: (value) => {
            setSearch(value)
            table?.setGlobalFilter(value)
          },
        },
        filter: {
          columns: filterColumns,
          filters,
          actions: filterActions,
          strategy: filterStrategy,
        },
        viewTools: table ? { table } : undefined,
      }
    },
    [search, statusOpen, filters, filterColumns, filterActions, filterStrategy],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title="Cash journal"
      titleIcon="Banknote"
      toolbar={buildToolbar}
      inspectorRowTitle={(row) => String(row.document ?? "")}
      inspectorRowName={(row) => String(row.category ?? "")}
      inspectorRowBadge={(row) => ({
        label: labelFor(DIRECTION_OPTIONS, String(row.direction ?? "")),
        variant: row.direction === "OUTFLOW" ? "destructive" : "secondary",
      })}
      inspectorRowContent={buildInspectorTabs}
      sections={[
        sectionTable({
          anchor: "cash-journal",
          rowIdKey: "id",
          columns: COLUMNS,
          rows: visibleRows,
          features: { search: true, inspect: true },
          emptyText: "No cash-journal lines in this period.",
        }),
      ]}
    />
  )
}
