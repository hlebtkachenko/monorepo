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
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"

/**
 * FxRatesView — Finance → Číselníky → Kurzy.
 *
 * A READ-ONLY Table archetype over the shared `fx_rate` store. No inline edit, no
 * create, no destructive selection action (rates are ingested / overridden, not
 * hand-edited here): search + column display + a per-row read-only Inspector,
 * plus the design-system selection footer. `rate` + `unit` are shown verbatim
 * (raw ČNB kurz + množství). Rows are assembled server-side; this view renders.
 */
export function FxRatesView({
  slug,
  title,
  rows,
  favorite,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
  favorite: ContentHeaderFavoriteToggle
}) {
  const t = useTranslations("org.fxRates")
  const [view, setView] = React.useState("all")
  const [search, setSearch] = React.useState("")

  const [openRowId] = React.useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("inspect") ??
        undefined),
  )

  const columns: TableColumnSpec[] = React.useMemo(
    () => [
      {
        id: "pair",
        header: t("columns.pair"),
        kind: "text",
        role: "id",
        width: 110,
      },
      { id: "date", header: t("columns.date"), kind: "text", width: 130 },
      { id: "kind", header: t("columns.kind"), kind: "text", width: 110 },
      {
        id: "unit",
        header: t("columns.unit"),
        kind: "number",
        align: "end",
        width: 110,
      },
      {
        id: "rate",
        header: t("columns.rate"),
        kind: "text",
        align: "end",
        width: 140,
      },
      { id: "source", header: t("columns.source"), kind: "text", width: 110 },
    ],
    [t],
  )

  const views: ViewTab[] = React.useMemo(
    () => [{ value: "all", label: t("all"), count: rows.length }],
    [t, rows.length],
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
      helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] => {
      const ids = (table?.getFilteredSelectedRowModel().rows ?? []).map((row) =>
        String(row.original.id),
      )
      return buildTableFooter(table, {
        exportFileName: "kurzy",
        selectedIds: ids,
        onCopyLink: (linkIds) => {
          const origin = window.location.origin + window.location.pathname
          void navigator.clipboard.writeText(
            linkIds
              .map((id) => `${origin}?inspect=${encodeURIComponent(id)}`)
              .join("\n"),
          )
          toast.success(`Copied ${linkIds.length} link(s)`)
        },
        onCopyId: (copyIds) => {
          void navigator.clipboard.writeText(copyIds.join("\n"))
          toast.success(`Copied ${copyIds.length} ID(s)`)
        },
        onOpenInspector: (id) => helpers.openInspectorTab(id, "details"),
        actions: [],
      })
    },
    [],
  )

  const inspectorContent = React.useCallback(
    (row: TableSectionRow): Partial<Record<InspectorTab, React.ReactNode>> => ({
      details: (
        <SectionList
          sections={[
            sectionInspectorKeyDetails({
              lines: [
                {
                  label: t("columns.pair"),
                  value: String(row.pair ?? ""),
                  icon: "ArrowUpDown",
                  readOnly: true,
                },
                {
                  label: t("columns.date"),
                  value: String(row.date ?? ""),
                  icon: "CalendarIcon",
                  readOnly: true,
                },
                {
                  label: t("columns.kind"),
                  value: String(row.kind ?? ""),
                  icon: "Circle",
                  readOnly: true,
                },
                {
                  label: t("columns.unit"),
                  value: String(row.unit ?? ""),
                  icon: "HashIcon",
                  readOnly: true,
                },
                {
                  label: t("columns.rate"),
                  value: String(row.rate ?? ""),
                  icon: "Banknote",
                  readOnly: true,
                },
                {
                  label: t("columns.source"),
                  value: String(row.source ?? ""),
                  icon: "ReceiptEuro",
                  readOnly: true,
                },
              ],
            }),
          ]}
        />
      ),
    }),
    [t],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      breadcrumb={[
        {
          label: t("breadcrumb.finance"),
          href: orgHref(slug, "finance"),
          icon: "PiggyBank",
        },
        { label: t("breadcrumb.references"), icon: "BookOpenText" },
      ]}
      favorite={favorite}
      views={{ tabs: views, value: view, onValueChange: setView }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      sections={[
        sectionTable({
          anchor: "kurzy",
          columns,
          rows,
          rowIdKey: "id",
          features: { search: true, inspect: true },
          emptyText: t("empty"),
        }),
      ]}
      openRowId={openRowId}
      inspectorRowTitle={(row) => String(row.pair ?? "")}
      inspectorRowName={(row) => String(row.date ?? "")}
      inspectorRowContent={inspectorContent}
    />
  )
}
