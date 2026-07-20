"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { useTranslations } from "@workspace/i18n/client"
import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import type { ArchetypeTableSelectionHelpers } from "@workspace/ui/blocks/archetypes"
import {
  buildTableFooter,
  buildTableToolbar,
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"

import { orgHref } from "@/lib/org/href"

/**
 * ChartFrameworkView — the Účetní osnova (statutory year framework) reference page.
 *
 * A READ-ONLY flat table of the směrná osnova for the active period's year
 * (synthetic-only, so no hierarchy — a flat `sectionTable`, not the tree). Every
 * column is display-only; classification + boolean columns render as PLAIN TEXT
 * (a read-only `select` cell). Rows arrive as raw codes + already-localized names
 * (osnovaNames) from the server and are localized here through column `options`;
 * the archetype auto-derives the per-column facet filter from the flat section.
 */

const STATEMENT_CLASSES = [
  "BALANCE_SHEET",
  "INCOME_STATEMENT",
  "CLOSING",
  "OFF_BALANCE",
] as const
const ACCOUNT_TYPES = ["ACTIVE", "PASSIVE", "EXPENSE", "REVENUE"] as const
const NORMAL_BALANCES = ["DEBIT", "CREDIT"] as const
const BOOLEANS = ["yes", "no"] as const

export function ChartFrameworkView({
  slug,
  title,
  favorite,
  rows,
  emptyText,
}: {
  slug: string
  title: string
  favorite: ContentHeaderFavoriteToggle
  rows: readonly TableSectionRow[]
  emptyText: string
}) {
  const tn = useTranslations("org.nav")
  const tc = useTranslations("accounting.chartOfAccounts.columns")
  const tsc = useTranslations("accounting.chartOfAccounts.statementClass")
  const tat = useTranslations("accounting.chartOfAccounts.accountType")
  const tnb = useTranslations("accounting.chartOfAccounts.normalBalance")
  const tb = useTranslations("accounting.chartOfAccounts.boolean")
  const tp = useTranslations("accounting.chartOfAccounts.framework")

  const columns = React.useMemo<TableColumnSpec[]>(
    () => [
      { id: "code", header: tc("code"), kind: "text", role: "id", width: 120 },
      { id: "name", header: tc("name"), kind: "text", width: 360 },
      {
        id: "statementClass",
        header: tc("statementClass"),
        kind: "select",
        options: STATEMENT_CLASSES.map((v) => ({ value: v, label: tsc(v) })),
        width: 150,
      },
      {
        id: "accountType",
        header: tc("accountType"),
        kind: "select",
        options: ACCOUNT_TYPES.map((v) => ({ value: v, label: tat(v) })),
        width: 120,
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
        width: 110,
      },
      {
        id: "balanceSheetLine",
        header: tc("balanceSheetLine"),
        kind: "text",
        width: 140,
      },
      {
        id: "incomeStatementLine",
        header: tc("incomeStatementLine"),
        kind: "text",
        width: 150,
      },
    ],
    [tc, tsc, tat, tnb, tb],
  )

  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")

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
      }),
    [search, tp],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] =>
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
        sectionTable({
          anchor: "framework",
          columns,
          rows,
          rowIdKey: "code",
          features: { search: true },
          emptyText,
        }),
      ]}
    />
  )
}
