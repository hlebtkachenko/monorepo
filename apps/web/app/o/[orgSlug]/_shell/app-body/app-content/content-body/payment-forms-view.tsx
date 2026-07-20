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

import { orgHref } from "@/lib/org/href"

/**
 * PaymentFormsView — Finance → Číselníky → Formy úhrady.
 *
 * A READ-ONLY Table archetype over the shared `payment_form` register (the Czech
 * forma-úhrady list). No inline edit / create / destructive action (reference data):
 * search + column display + a per-row read-only Inspector, plus the design-system
 * selection footer. Rows + localized names/phrases are assembled server-side; this
 * view renders them. The three offer flags (invoice / cash desk / POS) drive where
 * a form is offered for selection.
 */
export function PaymentFormsView({
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
  const t = useTranslations("org.paymentForms")
  const [view, setView] = React.useState("all")
  const [search, setSearch] = React.useState("")

  const [openRowId] = React.useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("inspect") ??
        undefined),
  )

  const yesNo: TableColumnOption[] = React.useMemo(
    () => [
      { value: "yes", label: t("yes") },
      { value: "no", label: t("no") },
    ],
    [t],
  )

  const columns: TableColumnSpec[] = React.useMemo(
    () => [
      {
        id: "code",
        header: t("columns.code"),
        kind: "text",
        role: "id",
        width: 150,
      },
      { id: "name", header: t("columns.name"), kind: "text" },
      { id: "phrase", header: t("columns.phrase"), kind: "text" },
      {
        id: "invoice",
        header: t("columns.invoice"),
        kind: "badge",
        options: yesNo,
        width: 110,
      },
      {
        id: "cashDesk",
        header: t("columns.cashDesk"),
        kind: "badge",
        options: yesNo,
        width: 120,
      },
      {
        id: "pos",
        header: t("columns.pos"),
        kind: "badge",
        options: yesNo,
        width: 100,
      },
    ],
    [t, yesNo],
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
        exportFileName: "formy-uhrady",
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

  const yesNoValue = React.useCallback(
    (raw: unknown) => (String(raw ?? "") === "yes" ? t("yes") : t("no")),
    [t],
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
                  icon: "CreditCard",
                  readOnly: true,
                },
                {
                  label: t("columns.phrase"),
                  value: String(row.phrase ?? ""),
                  icon: "ReceiptEuro",
                  readOnly: true,
                },
                {
                  label: t("columns.invoice"),
                  value: yesNoValue(row.invoice),
                  icon: "FileText",
                  readOnly: true,
                },
                {
                  label: t("columns.cashDesk"),
                  value: yesNoValue(row.cashDesk),
                  icon: "Banknote",
                  readOnly: true,
                },
                {
                  label: t("columns.pos"),
                  value: yesNoValue(row.pos),
                  icon: "CreditCard",
                  readOnly: true,
                },
              ],
            }),
          ]}
        />
      ),
    }),
    [t, yesNoValue],
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
          anchor: "formy-uhrady",
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
