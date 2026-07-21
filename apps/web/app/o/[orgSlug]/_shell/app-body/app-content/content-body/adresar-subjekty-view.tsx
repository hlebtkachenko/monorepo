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
 * SubjektyView — Adresář → Subjekty (Všechny subjekty).
 *
 * The party register: every counterparty the workspace shares, with this org's
 * relationship overlay and the derived supplier/customer role. READ-ONLY Table
 * archetype for now (create/edit is a later milestone) — search + column display
 * + a per-row read-only Inspector + the design-system selection footer. Rows are
 * assembled server-side by the page (party_kind + role already localized there);
 * this view only renders them.
 */
export function SubjektyView({
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

  // Deep link: `…?inspect=<partyId>` opens that row's Inspector on load.
  const [openRowId] = React.useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("inspect") ??
        undefined),
  )

  const columns: TableColumnSpec[] = React.useMemo(
    () => [
      { id: "name", header: t("subjects.columns.name"), kind: "text" },
      {
        id: "kind",
        header: t("subjects.columns.kind"),
        kind: "text",
        width: 160,
      },
      {
        id: "ico",
        header: t("subjects.columns.ico"),
        kind: "text",
        width: 120,
      },
      {
        id: "dic",
        header: t("subjects.columns.dic"),
        kind: "text",
        width: 140,
      },
      {
        id: "country",
        header: t("subjects.columns.country"),
        kind: "text",
        width: 90,
      },
      {
        id: "role",
        header: t("subjects.columns.role"),
        kind: "text",
        width: 180,
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
        exportFileName: "subjekty",
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
                  label: t("subjects.columns.name"),
                  value: String(row.name ?? ""),
                  icon: "BookUser",
                  readOnly: true,
                },
                {
                  label: t("subjects.columns.kind"),
                  value: String(row.kind ?? ""),
                  icon: "Building2",
                  readOnly: true,
                },
                {
                  label: t("subjects.columns.ico"),
                  value: String(row.ico ?? ""),
                  icon: "HashIcon",
                  readOnly: true,
                },
                {
                  label: t("subjects.columns.dic"),
                  value: String(row.dic ?? ""),
                  icon: "HashIcon",
                  readOnly: true,
                },
                {
                  label: t("subjects.columns.country"),
                  value: String(row.country ?? ""),
                  icon: "Globe",
                  readOnly: true,
                },
                {
                  label: t("subjects.columns.role"),
                  value: String(row.role ?? ""),
                  icon: "Briefcase",
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
        { label: title, icon: "BookUser" },
      ]}
      favorite={favorite}
      views={{ tabs: views, value: view, onValueChange: setView }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      sections={[
        sectionTable({
          anchor: "subjekty",
          columns,
          rows,
          rowIdKey: "id",
          features: { search: true, inspect: true },
          emptyText: t("subjects.empty"),
        }),
      ]}
      openRowId={openRowId}
      inspectorRowTitle={(row) => String(row.name ?? "")}
      inspectorRowName={(row) => String(row.ico ?? "")}
      inspectorRowContent={inspectorContent}
    />
  )
}
