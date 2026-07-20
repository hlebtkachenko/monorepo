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
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"

/**
 * CurrenciesView — Finance → Číselníky → Měny.
 *
 * A Table archetype over the ISO 4217 currency catalog. Read-only display
 * (search + column filter + per-row Inspector) plus one write: enable / disable
 * a currency for the org, which persists an `org_currency` row through the
 * `onSetEnabled` server action and updates the row's status in place. The
 * functional (accounting) currency carries no toggle — it is always available
 * regardless of enablement. Rows + localized status labels are assembled here
 * from the server-projected `status` field.
 */
export function CurrenciesView({
  slug,
  title,
  rows: initialRows,
  favorite,
  onSetEnabled,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
  favorite: ContentHeaderFavoriteToggle
  /** Persist enablement; resolves to the currency's state after the write. */
  onSetEnabled: (code: string, enabled: boolean) => Promise<boolean>
}) {
  const t = useTranslations("org.currencies")
  const [rows, setRows] = React.useState<TableSectionRow[]>(() =>
    initialRows.map((row) => ({ ...row })),
  )
  const [view, setView] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  const [openRowId] = React.useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("inspect") ??
        undefined),
  )

  const statusOptions: TableColumnOption[] = React.useMemo(
    () => [
      { value: "functional", label: t("status.functional") },
      { value: "enabled", label: t("status.enabled") },
      { value: "disabled", label: t("status.disabled") },
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
        width: 100,
      },
      { id: "name", header: t("columns.name"), kind: "text" },
      {
        id: "status",
        header: t("columns.status"),
        kind: "badge",
        options: statusOptions,
        width: 160,
      },
    ],
    [t, statusOptions],
  )

  const views: ViewTab[] = React.useMemo(
    () => [{ value: "all", label: t("all"), count: rows.length }],
    [t, rows.length],
  )

  const setEnabled = React.useCallback(
    (code: string, next: boolean) => {
      startTransition(async () => {
        try {
          const enabled = await onSetEnabled(code, next)
          setRows((current) =>
            current.map((row) =>
              String(row.code) === code
                ? { ...row, status: enabled ? "enabled" : "disabled" }
                : row,
            ),
          )
          toast.success(next ? t("toast.enabled") : t("toast.disabled"))
        } catch {
          toast.error(t("toggleError"))
        }
      })
    },
    [onSetEnabled, t],
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
        exportFileName: "meny",
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
    (row: TableSectionRow): Partial<Record<InspectorTab, React.ReactNode>> => {
      const code = String(row.code ?? "")
      const status = String(row.status ?? "")
      return {
        details: (
          <div className="flex flex-col gap-4">
            <SectionList
              sections={[
                sectionInspectorKeyDetails({
                  lines: [
                    {
                      label: t("columns.code"),
                      value: code,
                      icon: "HashIcon",
                      readOnly: true,
                    },
                    {
                      label: t("columns.name"),
                      value: String(row.name ?? ""),
                      icon: "Banknote",
                      readOnly: true,
                    },
                    {
                      label: t("columns.status"),
                      value:
                        statusOptions.find((o) => o.value === status)?.label ??
                        status,
                      icon: "Circle",
                      readOnly: true,
                    },
                  ],
                }),
              ]}
            />
            {status === "functional" ? (
              <p className="text-sm text-muted-foreground">
                {t("functionalNote")}
              </p>
            ) : (
              <Button
                variant={status === "enabled" ? "outline" : "default"}
                className="justify-start"
                disabled={pending}
                onClick={() => setEnabled(code, status !== "enabled")}
              >
                {status === "enabled"
                  ? t("actions.disable")
                  : t("actions.enable")}
              </Button>
            )}
          </div>
        ),
      }
    },
    [t, statusOptions, pending, setEnabled],
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
          anchor: "meny",
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
