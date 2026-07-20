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
 * FinancialInstitutionsView — Finance → Číselníky → Peněžní ústavy.
 *
 * A READ-ONLY Table archetype over the shared `financial_institution` register
 * (ČNB bank codes). No inline edit / create / destructive action (reference data):
 * search + column display + a per-row read-only Inspector, plus the design-system
 * selection footer. Rows + localized names are assembled server-side; this view
 * renders them.
 */
export function FinancialInstitutionsView({
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
  const t = useTranslations("org.financialInstitutions")
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
        id: "code",
        header: t("columns.code"),
        kind: "text",
        role: "id",
        width: 130,
      },
      { id: "name", header: t("columns.name"), kind: "text" },
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
        exportFileName: "penezni-ustavy",
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
                  label: t("columns.code"),
                  value: String(row.code ?? ""),
                  icon: "HashIcon",
                  readOnly: true,
                },
                {
                  label: t("columns.name"),
                  value: String(row.name ?? ""),
                  icon: "Building2",
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
          anchor: "penezni-ustavy",
          columns,
          rows,
          rowIdKey: "id",
          features: { search: true, inspect: true },
          emptyText: t("empty"),
        }),
      ]}
      openRowId={openRowId}
      inspectorRowTitle={(row) => String(row.name ?? "")}
      inspectorRowName={(row) => String(row.code ?? "")}
      inspectorRowContent={inspectorContent}
    />
  )
}
