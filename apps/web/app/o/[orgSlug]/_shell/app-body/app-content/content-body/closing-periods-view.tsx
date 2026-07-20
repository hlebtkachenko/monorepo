"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { useTranslations } from "@workspace/i18n/client"
import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import type { ArchetypeTableSelectionHelpers } from "@workspace/ui/blocks/archetypes"
import {
  buildTableFooter,
  buildTableToolbar,
  SectionList,
  sectionInspectorKeyDetails,
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  TableColumnOption,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import { toast } from "@workspace/ui/components/sonner"

import { updatePeriodZkratka } from "@/lib/org/period-actions"

/**
 * ClosingPeriodsView — the Closing → Účetní období list.
 *
 * A Table archetype over the org's real `accounting_period` rows (projected
 * server-side by `listPeriods`). Columns: Zkratka (the period code — editable,
 * defaults to the derived fiscal year until overridden), Od / Do (bounds), Stav
 * (Aktivní / Otevřené / Uzavřené), Rok (fiscal year, derived, not editable).
 * Editing Zkratka — inline in the grid or in the row Inspector — updates
 * optimistically and persists through `updatePeriodZkratka`. No demo content —
 * every cell is real org data.
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
  const [, startTransition] = React.useTransition()

  // Optimistic Zkratka edits: `useOptimistic` shows the edited code immediately
  // during the transition, then settles on the server value when the action's
  // revalidation lands — the persisted value on success, the prior value on
  // failure (where the toast fires). No manual prop→state sync.
  const [rows, addOptimisticZkratka] = React.useOptimistic(
    serverRows,
    (
      current: readonly TableSectionRow[],
      edit: { rowId: string; zkratka: string },
    ) =>
      current.map((row) =>
        String(row.id) === edit.rowId ? { ...row, zkratka: edit.zkratka } : row,
      ),
  )

  const commitZkratka = React.useCallback(
    (rowId: string, value: string) => {
      const next = value.trim()
      if (!next) return
      startTransition(async () => {
        addOptimisticZkratka({ rowId, zkratka: next })
        const result = await updatePeriodZkratka({
          slug,
          periodId: rowId,
          zkratka: next,
        })
        if (!result.ok) toast.error(t("editZkratkaError"))
      })
    },
    [slug, addOptimisticZkratka, t],
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
      {
        id: "zkratka",
        header: t("columns.zkratka"),
        kind: "text",
        role: "id",
        width: 140,
      },
      { id: "od", header: t("columns.od"), kind: "text", width: 140 },
      { id: "do", header: t("columns.do"), kind: "text", width: 140 },
      {
        id: "stav",
        header: t("columns.stav"),
        kind: "badge",
        options: stavOptions,
        width: 150,
      },
      {
        id: "rok",
        header: t("columns.rok"),
        kind: "number",
        align: "end",
        width: 110,
      },
    ],
    [t, stavOptions],
  )

  const viewRows = React.useMemo(() => {
    if (activeTab === "open")
      return rows.filter((row) => String(row.stav) !== "closed")
    if (activeTab === "closed")
      return rows.filter((row) => String(row.stav) === "closed")
    return rows
  }, [rows, activeTab])

  const views: ViewTab[] = React.useMemo(
    () => [
      { value: "all", label: t("views.all"), count: rows.length },
      {
        value: "open",
        label: t("views.open"),
        count: rows.filter((row) => String(row.stav) !== "closed").length,
      },
      {
        value: "closed",
        label: t("views.closed"),
        count: rows.filter((row) => String(row.stav) === "closed").length,
      },
    ],
    [rows, t],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
      }),
    [search],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] => {
      const ids = (table?.getFilteredSelectedRowModel().rows ?? []).map((row) =>
        String(row.original.id),
      )
      return buildTableFooter(table, {
        exportFileName: t("exportFileName"),
        selectedIds: ids,
      })
    },
    [t],
  )

  const inspectorContent = React.useCallback(
    (row: TableSectionRow) => {
      const stav = String(row.stav ?? "")
      const stavText =
        stav === "active"
          ? t("stav.active")
          : stav === "closed"
            ? t("stav.closed")
            : t("stav.open")
      return {
        details: (
          <SectionList
            sections={[
              sectionInspectorKeyDetails({
                lines: [
                  {
                    label: t("columns.zkratka"),
                    value: String(row.zkratka ?? ""),
                    icon: "HashIcon",
                    onChange: (next) => commitZkratka(String(row.id), next),
                  },
                  {
                    label: t("columns.od"),
                    value: String(row.od ?? ""),
                    icon: "CalendarIcon",
                    readOnly: true,
                  },
                  {
                    label: t("columns.do"),
                    value: String(row.do ?? ""),
                    icon: "CalendarIcon",
                    readOnly: true,
                  },
                  {
                    label: t("columns.stav"),
                    value: stavText,
                    icon: "CheckCircle2",
                    readOnly: true,
                  },
                  {
                    label: t("columns.rok"),
                    value: String(row.rok ?? ""),
                    icon: "CalendarClock",
                    readOnly: true,
                  },
                ],
              }),
            ]}
          />
        ),
      } satisfies Partial<Record<InspectorTab, React.ReactNode>>
    },
    [t, commitZkratka],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      favorite={favorite}
      views={{ tabs: views, value: activeTab, onValueChange: setActiveTab }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      sections={[
        sectionTable({
          anchor: "periods",
          columns,
          rows: viewRows,
          rowIdKey: "id",
          features: { search: true, inspect: true },
          emptyText: t("empty"),
        }),
      ]}
      inspectorRowTitle={(row) => String(row.zkratka ?? "")}
      inspectorRowName={(row) =>
        `${String(row.od ?? "")} – ${String(row.do ?? "")}`
      }
      inspectorRowContent={inspectorContent}
    />
  )
}
