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
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  SectionCellCommit,
  TableColumnOption,
  TableColumnSpec,
  TableSectionRow,
  TreeTableRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { FiltersState } from "@workspace/ui/components/filter-bar"
import { toast } from "@workspace/ui/components/sonner"

import { updatePeriodZkratka } from "@/lib/org/period-actions"

/**
 * ClosingPeriodsView — the Closing → Účetní období list.
 *
 * A **Tree-table** archetype section (the #892 variant) over the org's real
 * `accounting_period` rows (projected server-side by `listPeriods`). The fiscal
 * years are the top-level rows; the monthly sub-periods join later as `subRows`,
 * so the year → month hierarchy is built on the tree renderer from the start.
 *
 * Columns: Rok (the fiscal year — the row's STABLE identity, so it hosts the
 * tree anchor and is never editable), Zkratka (the period code — inline-editable,
 * defaults to the derived fiscal year until overridden), Od / Do (bounds), Stav
 * (Aktivní / Otevřené / Uzavřené). Editing Zkratka commits through the tree
 * renderer's own optimistic cell state: it shows the edit immediately and reverts
 * if `updatePeriodZkratka` rejects (this handler throws on `!ok`). No demo
 * content — every cell is real org data.
 *
 * The row Inspector is deliberately absent: `ArchetypeTable`'s Inspector resolves
 * its row from the flat `sectionTable` payload only, so it auto-closes on a tree
 * section. The per-period detail / Uzávěrka Inspector arrives with a
 * tree-compatible opener in a later slice.
 */
export function ClosingPeriodsView({
  slug,
  title,
  rows: serverRows,
  favorite,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
  favorite: ContentHeaderFavoriteToggle
}) {
  const t = useTranslations("org.periods")
  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<FiltersState>([])

  // Wrap the flat period rows as a Tree-table forest: top-level = fiscal years,
  // each period's cells under `values` keyed by column id (month sub-rows join as
  // `subRows` in a later slice). The renderer holds its own draft, so inline
  // edits stick and revert without a page-level optimistic store.
  const treeRows = React.useMemo<readonly TreeTableRow[]>(
    () =>
      serverRows.map((row) => ({
        id: String(row.id ?? ""),
        values: {
          rok: row.rok ?? null,
          zkratka: row.zkratka ?? null,
          od: row.od ?? null,
          do: row.do ?? null,
          stav: row.stav ?? null,
        },
      })),
    [serverRows],
  )

  const stavOptions: TableColumnOption[] = React.useMemo(
    () => [
      { value: "active", label: t("stav.active") },
      { value: "open", label: t("stav.open") },
      { value: "closed", label: t("stav.closed") },
    ],
    [t],
  )

  const columns: TableColumnSpec[] = React.useMemo(
    () => [
      // Rok is the stable identity → the tree anchor (chevron + expand), never
      // inline-editable. A user-editable Zkratka cannot serve as the anchor.
      {
        id: "rok",
        header: t("columns.rok"),
        kind: "text",
        role: "id",
        width: 160,
      },
      {
        id: "zkratka",
        header: t("columns.zkratka"),
        kind: "text",
        edit: "inline",
        width: 160,
      },
      { id: "od", header: t("columns.od"), kind: "text", width: 150 },
      { id: "do", header: t("columns.do"), kind: "text", width: 150 },
      {
        id: "stav",
        header: t("columns.stav"),
        kind: "badge",
        options: stavOptions,
        width: 150,
      },
    ],
    [t, stavOptions],
  )

  // View tabs filter the top-level (year) rows by lifecycle state.
  const tabRows = React.useMemo(() => {
    if (activeTab === "open")
      return treeRows.filter((row) => String(row.values.stav) !== "closed")
    if (activeTab === "closed")
      return treeRows.filter((row) => String(row.values.stav) === "closed")
    return treeRows
  }, [treeRows, activeTab])

  // Column-driven toolbar filter + the recursively-narrowed tree it produces.
  const { filter, rows: filteredTree } = useTreeTableFilters({
    columns,
    rows: tabRows,
    filters,
    onFiltersChange: setFilters,
  })

  const views: ViewTab[] = React.useMemo(
    () => [
      { value: "all", label: t("views.all"), count: treeRows.length },
      {
        value: "open",
        label: t("views.open"),
        count: treeRows.filter((row) => String(row.values.stav) !== "closed")
          .length,
      },
      {
        value: "closed",
        label: t("views.closed"),
        count: treeRows.filter((row) => String(row.values.stav) === "closed")
          .length,
      },
    ],
    [treeRows, t],
  )

  // Persist an inline Zkratka edit. Only Zkratka is editable; other columns are
  // read-only. Throwing on failure makes the tree renderer revert the cell.
  const onCellEdit: SectionCellCommit = React.useCallback(
    async ({ rowId, columnId, value }) => {
      if (columnId !== "zkratka") return
      const next = String(value ?? "").trim()
      if (!next) throw new Error("empty zkratka") // revert, no toast
      const result = await updatePeriodZkratka({
        slug,
        periodId: rowId,
        zkratka: next,
      })
      if (!result.ok) {
        toast.error(t("editZkratkaError"))
        throw new Error("zkratka update rejected") // revert the optimistic cell
      }
    },
    [slug, t],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
        filter,
      }),
    [search, filter],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] => {
      // `flatRows` so a nested (month) selection is included alongside years.
      const ids = (table?.getFilteredSelectedRowModel().flatRows ?? []).map(
        (row) => String(row.original.id),
      )
      return buildTableFooter(table, {
        exportFileName: t("exportFileName"),
        selectedIds: ids,
      })
    },
    [t],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      favorite={favorite}
      views={{ tabs: views, value: activeTab, onValueChange: setActiveTab }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      onCellEdit={onCellEdit}
      sections={[
        sectionTreeTable({
          anchor: "periods",
          columns,
          rows: filteredTree,
          features: { search: true },
          emptyText: t("empty"),
        }),
      ]}
    />
  )
}
