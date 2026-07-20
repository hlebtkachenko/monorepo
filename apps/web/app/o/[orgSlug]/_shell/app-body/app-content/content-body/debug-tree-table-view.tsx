"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

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
  SectionCellCommit,
  TableColumnSpec,
  TableSectionRow,
  TreeTableRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"

/**
 * DebugTreeTableView — the Debug → Archetype Table (Tree Table) reference page: a
 * FULLY FUNCTIONING Tree-table archetype section. It shows the flat Table's
 * editable grid PLUS a Class → Group → Synthetic → Analytical hierarchy that
 * expands/collapses. Every real account row (synthetic + analytical) is fully
 * wired — inline-edit name / saldo / tax, select, sort, per-column filter, CSV
 * export; the structural Class/Group tier nodes are label-only (not selectable,
 * not editable). The demo tree is a static in-code sample (this is a dev-only,
 * allowlist-gated reference — no seeded table), so edits live in the section's
 * own optimistic state and reset on reload.
 */

const CATEGORY = [
  { value: "Rozvahové", label: "Rozvahové" },
  { value: "Výsledkové", label: "Výsledkové" },
]
const TYPE = [
  { value: "Aktiva", label: "Aktiva" },
  { value: "Pasiva", label: "Pasiva" },
]
const YES_NO = [
  { value: "Ano", label: "Ano" },
  { value: "Ne", label: "Ne" },
]

const COLUMNS: TableColumnSpec[] = [
  { id: "number", header: "Číslo účtu", kind: "text", role: "id", width: 280 },
  { id: "name", header: "Název", kind: "text", edit: "inline", width: 260 },
  {
    id: "category",
    header: "Kategorie",
    // A read-only classification — plain TEXT, not a status chip — but still
    // offered as a faceted (option) filter in the toolbar.
    kind: "text",
    filter: { variant: "option", options: CATEGORY },
    width: 140,
  },
  {
    id: "type",
    header: "Typ účtu",
    kind: "text",
    filter: { variant: "option", options: TYPE },
    width: 120,
  },
  {
    id: "saldo",
    header: "Saldokonto",
    kind: "select",
    edit: "inline",
    options: YES_NO,
    align: "end",
    width: 130,
  },
  {
    id: "tax",
    header: "Daňový",
    kind: "select",
    edit: "inline",
    options: YES_NO,
    align: "end",
    width: 110,
  },
]

/** A real account leaf (editable + selectable). */
function account(
  number: string,
  name: string,
  saldo: string,
  tax: string,
  subRows?: TreeTableRow[],
): TreeTableRow {
  return {
    id: number,
    values: { number, name, category: "Rozvahové", type: "Aktiva", saldo, tax },
    subRows,
  }
}

/** A structural tier node (Class / Group) — label-only, never selectable/editable. */
function tier(
  number: string,
  name: string,
  subRows: TreeTableRow[],
): TreeTableRow {
  return {
    id: `tier:${number}`,
    values: { number, name },
    subRows,
    selectable: false,
    editable: false,
  }
}

const TREE: TreeTableRow[] = [
  tier("0", "Dlouhodobý majetek", [
    tier("01", "Dlouhodobý nehmotný majetek", [
      account("012", "Nehmotné výsledky vývoje", "Ne", "Ne", [
        account("012.001", "Software vlastní", "Ne", "Ne"),
        account("012.002", "Licence", "Ne", "Ano"),
      ]),
      account("013", "Software", "Ne", "Ne"),
    ]),
    tier("02", "Dlouhodobý hmotný majetek odpisovaný", [
      account("021", "Stavby", "Ne", "Ne", [
        account("021.001", "Administrativní budova", "Ne", "Ne"),
      ]),
      account("022", "Hmotné movité věci", "Ne", "Ne", [
        account("022.001", "Stroje a zařízení", "Ne", "Ne"),
        account("022.002", "Dopravní prostředky", "Ne", "Ano"),
      ]),
    ]),
  ]),
  tier("3", "Zúčtovací vztahy", [
    tier("31", "Pohledávky", [
      account("311", "Odběratelé", "Ano", "Ne", [
        account("311.001", "Odběratelé tuzemsko", "Ano", "Ne"),
        account("311.002", "Odběratelé EU", "Ano", "Ne"),
      ]),
    ]),
    tier("32", "Závazky (krátkodobé)", [
      account("321", "Dodavatelé", "Ano", "Ne", [
        account("321.001", "Dodavatelé tuzemsko", "Ano", "Ne"),
      ]),
    ]),
  ]),
]

/** Remove the nodes whose id is selected (and, with them, their whole subtree) —
 *  recursively, returning a new tree. Used by the demo's footer Delete. */
function removeIds(
  rows: readonly TreeTableRow[],
  ids: ReadonlySet<string>,
): TreeTableRow[] {
  const out: TreeTableRow[] = []
  for (const node of rows) {
    if (ids.has(node.id)) continue
    const subRows = node.subRows ? removeIds(node.subRows, ids) : undefined
    out.push(subRows ? { ...node, subRows } : node)
  }
  return out
}

export function DebugTreeTableView({
  slug,
  title,
  favorite,
}: {
  slug: string
  title: string
  favorite: ContentHeaderFavoriteToggle
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<FiltersState>([])
  // The demo owns the tree so the footer Delete actually removes rows.
  const [treeRows, setTreeRows] = React.useState<TreeTableRow[]>(() => TREE)

  // Column-driven toolbar filter + the recursively-narrowed tree it produces.
  const { filter, rows: filteredTree } = useTreeTableFilters({
    columns: COLUMNS,
    rows: treeRows,
    filters,
    onFiltersChange: setFilters,
  })

  const views: ViewTab[] = [{ value: "all", label: "Vše" }]

  const onCellEdit: SectionCellCommit = React.useCallback(({ columnId }) => {
    // Demo: the section applies the edit optimistically; here we only acknowledge.
    toast.success(`Saved ${columnId} (demo)`)
  }, [])

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
        expandAll: { groupLabel: "Sbalit vše", ungroupLabel: "Rozbalit vše" },
        filter,
      }),
    [search, filter],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] => {
      // `flatRows` so a nested account selection is included (the tiers are not
      // selectable, so selections are always nested).
      const ids = (table?.getFilteredSelectedRowModel().flatRows ?? []).map(
        (row) => String(row.original.id),
      )
      return buildTableFooter(table, {
        exportFileName: "uctovy-rozvrh",
        selectedIds: ids,
        onCopyId: (copyIds) => {
          void navigator.clipboard.writeText(copyIds.join("\n"))
          toast.success(`Zkopírováno ${copyIds.length} ID`)
        },
        actions: [
          {
            id: "delete",
            label: "Smazat",
            icon: "Trash2",
            variant: "destructive",
            onSelect: () => {
              if (ids.length === 0) return
              const previous = treeRows
              setTreeRows(removeIds(treeRows, new Set(ids)))
              table?.resetRowSelection()
              toast.success(`Smazáno ${ids.length} účtů`, {
                action: { label: "Zpět", onClick: () => setTreeRows(previous) },
              })
            },
          },
        ],
      })
    },
    [treeRows],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      breadcrumb={[
        { label: "Debug", href: orgHref(slug, "debug"), icon: "Bug" },
      ]}
      favorite={favorite}
      views={{
        tabs: views,
        value: activeTab,
        onValueChange: setActiveTab,
      }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      onCellEdit={onCellEdit}
      sections={[
        sectionTreeTable({
          anchor: "chart",
          columns: COLUMNS,
          rows: filteredTree,
          defaultExpanded: 2,
          features: { search: true },
          emptyText: "No accounts.",
        }),
      ]}
    />
  )
}
