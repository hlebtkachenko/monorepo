"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { useTranslations } from "@workspace/i18n/client"
import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import type { ArchetypeTableSelectionHelpers } from "@workspace/ui/blocks/archetypes"
import {
  buildTableFooter,
  buildTableToolbar,
  sectionTreeTable,
  useTreeTableFilters,
} from "@workspace/ui/blocks/content-panel"
import type { FiltersState } from "@workspace/ui/components/filter-bar"
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  TableColumnSpec,
  TableSectionRow,
  TreeTableRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"

import { orgHref } from "@/lib/org/href"

/**
 * ChartOfAccountsView — the Účtový rozvrh (chart of accounts) page body.
 *
 * A READ-ONLY Tree-table archetype over the period's real chart: Class → Group →
 * Synthetic → Analytical. Structural Class/Group tiers are label-only; every real
 * synthetic + analytical account is a fully-wired row (select, sort, per-column
 * filter, CSV export). Classification + boolean columns render as PLAIN TEXT (a
 * read-only `select` cell, not a chip). The tree is projected server-side
 * (`buildChartTree`) and passed in; enum/boolean cells arrive as RAW codes and are
 * localized here through each column's `options`, so faceting stays keyed on stable
 * values. Add/edit accounts + seeding are the human-gated write batch — not here.
 */

/** Enum value sets → localized `select` options (value = stable code, label = i18n). */
const STATEMENT_CLASSES = [
  "BALANCE_SHEET",
  "INCOME_STATEMENT",
  "CLOSING",
  "OFF_BALANCE",
] as const
const ACCOUNT_TYPES = ["ACTIVE", "PASSIVE", "EXPENSE", "REVENUE"] as const
const NORMAL_BALANCES = ["DEBIT", "CREDIT"] as const
const BOOLEANS = ["yes", "no"] as const

export function ChartOfAccountsView({
  slug,
  title,
  favorite,
  tree,
  emptyText,
}: {
  slug: string
  title: string
  favorite: ContentHeaderFavoriteToggle
  tree: readonly TreeTableRow[]
  emptyText: string
}) {
  const tn = useTranslations("org.nav")
  const tc = useTranslations("accounting.chartOfAccounts.columns")
  const tsc = useTranslations("accounting.chartOfAccounts.statementClass")
  const tat = useTranslations("accounting.chartOfAccounts.accountType")
  const tnb = useTranslations("accounting.chartOfAccounts.normalBalance")
  const tb = useTranslations("accounting.chartOfAccounts.boolean")
  const tp = useTranslations("accounting.chartOfAccounts.page")

  const columns = React.useMemo<TableColumnSpec[]>(
    () => [
      {
        id: "number",
        header: tc("number"),
        kind: "text",
        role: "id",
        width: 280,
      },
      { id: "name", header: tc("name"), kind: "text", width: 320 },
      {
        id: "statementClass",
        header: tc("statementClass"),
        kind: "select",
        options: STATEMENT_CLASSES.map((v) => ({ value: v, label: tsc(v) })),
        width: 160,
      },
      {
        id: "accountType",
        header: tc("accountType"),
        kind: "select",
        options: ACCOUNT_TYPES.map((v) => ({ value: v, label: tat(v) })),
        width: 130,
      },
      {
        id: "normalBalance",
        header: tc("normalBalance"),
        kind: "select",
        options: NORMAL_BALANCES.map((v) => ({ value: v, label: tnb(v) })),
        width: 130,
      },
      {
        id: "tracksOpenItems",
        header: tc("tracksOpenItems"),
        kind: "select",
        options: BOOLEANS.map((v) => ({ value: v, label: tb(v) })),
        align: "end",
        width: 130,
      },
      {
        id: "taxRelevant",
        header: tc("taxRelevant"),
        kind: "select",
        options: BOOLEANS.map((v) => ({ value: v, label: tb(v) })),
        align: "end",
        width: 120,
      },
    ],
    [tc, tsc, tat, tnb, tb],
  )

  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<FiltersState>([])

  // Column-driven toolbar filter + the recursively-narrowed tree it produces
  // (keeps ancestor tiers of a matching account).
  const { filter, rows: filteredTree } = useTreeTableFilters({
    columns,
    rows: tree,
    filters,
    onFiltersChange: setFilters,
  })

  const views: ViewTab[] = [{ value: "all", label: tp("view") }]

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: {
          value: search,
          onChange: setSearch,
          placeholder: tp("searchPlaceholder"),
        },
        expandAll: {
          groupLabel: tp("collapseAll"),
          ungroupLabel: tp("expandAll"),
        },
        filter,
      }),
    [search, filter, tp],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] =>
      // Read-only: the only selection action is CSV export of the selected
      // accounts (tiers are not selectable, so a selection is always accounts).
      buildTableFooter(table, { exportFileName: tp("exportFileName") }),
    [tp],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      breadcrumb={[
        {
          label: tn("accounting"),
          href: orgHref(slug, "accounting"),
          icon: "BookOpen",
        },
      ]}
      favorite={favorite}
      views={{ tabs: views, value: activeTab, onValueChange: setActiveTab }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      sections={[
        sectionTreeTable({
          anchor: "chart",
          columns,
          rows: filteredTree,
          defaultExpanded: 2,
          features: { search: true },
          emptyText,
        }),
      ]}
    />
  )
}
