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
 * StatyRegisterView — Adresář → Veřejné číselníky → Státy.
 *
 * A READ-ONLY Table archetype over the ISO 3166-1 country reference register. No
 * inline edit, no create, no destructive selection action (reference data users
 * do not mutate): search + column display + a per-row read-only Inspector, plus
 * the design-system selection footer (Export / Copy). Rows + localized names are
 * assembled server-side by the page; this view only renders them.
 */
export function StatyRegisterView({
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
  const t = useTranslations("org.directory")
  const [view, setView] = React.useState("all")
  const [search, setSearch] = React.useState("")

  // Deep link: `…?inspect=<iso2>` opens that row's Inspector on load — the target
  // the footer "Copy link" action writes.
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
        width: 100,
      },
      { id: "name", header: t("columns.name"), kind: "text" },
      {
        id: "currency",
        header: t("columns.currency"),
        kind: "text",
        width: 120,
      },
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
        exportFileName: "staty",
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
                  icon: "Globe",
                  readOnly: true,
                },
                {
                  label: t("columns.currency"),
                  value: String(row.currency ?? ""),
                  icon: "Banknote",
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
          label: t("breadcrumb.directory"),
          href: orgHref(slug, "adresar"),
          icon: "BookUser",
        },
        { label: t("breadcrumb.publicRegisters"), icon: "Globe" },
      ]}
      favorite={favorite}
      views={{ tabs: views, value: view, onValueChange: setView }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      sections={[
        sectionTable({
          anchor: "staty",
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
