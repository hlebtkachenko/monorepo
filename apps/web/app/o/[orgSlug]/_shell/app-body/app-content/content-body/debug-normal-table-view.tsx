"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import {
  buildTableToolbar,
  SectionList,
  sectionInspectorActivityLog,
  sectionInspectorAttachments,
  sectionInspectorKeyDetails,
  sectionInspectorMoneyTotals,
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  SectionCellCommit,
  TableCellValue,
  TableColumnOption,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type {
  InspectorAttachmentFile,
  InspectorTab,
} from "@workspace/ui/blocks/inspector-sheet"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"

/**
 * DebugNormalTableView — the Debug → Archetype Table (Normal Table) reference
 * page: a FULLY FUNCTIONING Table archetype. It owns the rows, a per-row edit
 * history, and per-row attachments in a reducer, so every affordance actually
 * works and mutates the table data:
 *   - inline cell edit (Partner, Amount) + inspector fields (Partner, Status,
 *     Issued, Note) save through one commit and are reflected in the grid;
 *   - each save appends a REAL entry to the Activity tab, with a working Undo;
 *   - Approve / Reject set the row's status;
 *   - the selection footer Delete removes rows (with an Undo to restore) and the
 *     Export dropdown copies or downloads the selected rows × visible columns;
 *   - the Attachments tab accepts uploads on any row; Settings is always present.
 * State is session-scoped (resets on reload / org switch) — never a write to the
 * seeded demo table — so the reference stays a clean, re-seedable template.
 */

const STATUS_OPTIONS: TableColumnOption[] = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "rejected", label: "Rejected" },
]

const COLUMNS: TableColumnSpec[] = [
  { id: "document", header: "Document", kind: "text", role: "id", width: 160 },
  {
    id: "partner",
    header: "Partner",
    kind: "text",
    edit: "inline",
    width: 180,
  },
  {
    id: "status",
    header: "Status",
    kind: "badge",
    options: STATUS_OPTIONS,
    width: 130,
  },
  {
    id: "amount",
    header: "Amount",
    kind: "number",
    edit: "inline",
    align: "end",
    width: 140,
  },
  {
    id: "issuedOn",
    header: "Issued",
    kind: "text",
    filter: { variant: "date" },
    width: 140,
  },
]

interface Activity {
  id: string
  field: string
  before: string
  after: string
  when: string
}

interface State {
  rows: TableSectionRow[]
  history: Record<string, Activity[]>
  attachments: Record<string, InspectorAttachmentFile[]>
  seq: number
}

type Action =
  | {
      type: "edit"
      rowId: string
      field: string
      value: TableCellValue
      when: string
    }
  | { type: "delete"; ids: string[] }
  | { type: "restoreDeleted"; rows: TableSectionRow[] }
  | { type: "addFiles"; rowId: string; files: InspectorAttachmentFile[] }
  | { type: "removeFile"; rowId: string; fileId: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "edit": {
      const idx = state.rows.findIndex((row) => String(row.id) === action.rowId)
      if (idx < 0) return state
      const before = String(state.rows[idx]![action.field] ?? "")
      const after = String(action.value ?? "")
      if (before === after) return state
      const rows = [...state.rows]
      rows[idx] = { ...rows[idx]!, [action.field]: action.value }
      const entry: Activity = {
        id: `${action.rowId}-${action.field}-${state.seq}`,
        field: action.field,
        before,
        after,
        when: action.when,
      }
      return {
        ...state,
        rows,
        seq: state.seq + 1,
        history: {
          ...state.history,
          [action.rowId]: [entry, ...(state.history[action.rowId] ?? [])],
        },
      }
    }
    case "delete": {
      const ids = new Set(action.ids)
      return {
        ...state,
        rows: state.rows.filter((row) => !ids.has(String(row.id))),
      }
    }
    case "restoreDeleted": {
      // The batch to restore is carried by the action (from the toast that
      // deleted it), so each toast's Undo restores its OWN rows even after
      // several sequential deletes. Skip any that already came back.
      const present = new Set(state.rows.map((row) => String(row.id)))
      const missing = action.rows.filter((row) => !present.has(String(row.id)))
      if (missing.length === 0) return state
      return { ...state, rows: [...missing, ...state.rows] }
    }
    case "addFiles":
      return {
        ...state,
        attachments: {
          ...state.attachments,
          [action.rowId]: [
            ...(state.attachments[action.rowId] ?? []),
            ...action.files,
          ],
        },
      }
    case "removeFile":
      return {
        ...state,
        attachments: {
          ...state.attachments,
          [action.rowId]: (state.attachments[action.rowId] ?? []).filter(
            (file) => file.id !== action.fileId,
          ),
        },
      }
  }
}

/** Short clock label for an activity entry, e.g. "15:42". */
function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** CSV-escape one cell (quote when it contains a comma, quote, or newline). */
function csvCell(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Build a CSV of the SELECTED rows × the VISIBLE data columns, both in their
 * current on-screen order — the whole selected range, exactly as placed.
 */
function selectionCsv(table: Table<TableSectionRow> | null): string {
  const columns = (table?.getVisibleLeafColumns() ?? []).filter(
    (column) => column.id !== "select" && column.id !== "actions",
  )
  const rows = table?.getFilteredSelectedRowModel().rows ?? []
  const header = columns.map((column) =>
    csvCell(column.columnDef.meta?.label ?? column.id),
  )
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row.original[column.id])),
  )
  return [header, ...body].map((cells) => cells.join(",")).join("\n")
}

export function DebugNormalTableView({
  slug,
  title,
  rows: initialRows,
  favorite,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
  favorite: ContentHeaderFavoriteToggle
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [state, dispatch] = React.useReducer(
    reducer,
    initialRows,
    (rows): State => ({
      rows: rows.map((row) => ({ ...row })),
      history: {},
      attachments: {},
      seq: 0,
    }),
  )
  const { rows, history, attachments } = state

  // Deep link: `…?inspect=<row id>` opens that row's Inspector on load — the
  // target the header "Copy link" action writes.
  const [openRowId] = React.useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("inspect") ??
        undefined),
  )

  const commit = React.useCallback(
    (rowId: string, field: string, value: TableCellValue) => {
      dispatch({ type: "edit", rowId, field, value, when: nowLabel() })
    },
    [],
  )

  const onCellEdit: SectionCellCommit = React.useCallback(
    ({ rowId, columnId, value }) => commit(rowId, columnId, value),
    [commit],
  )

  const viewRows = React.useMemo(
    () =>
      activeTab === "all"
        ? rows
        : rows.filter((row) => String(row.status ?? "") === activeTab),
    [rows, activeTab],
  )

  const views: ViewTab[] = React.useMemo(
    () => [
      { value: "all", label: "All", count: rows.length },
      ...STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count: rows.filter((row) => String(row.status ?? "") === option.value)
          .length,
      })),
    ],
    [rows],
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
    (table: Table<TableSectionRow> | null): ContentFooterAction[] => [
      {
        id: "export",
        label: "Export",
        icon: "FileDown",
        // Dropdown: pick the format; both export the selected rows × visible
        // columns in on-screen order.
        options: [
          {
            id: "clipboard",
            label: "Copy to clipboard",
            icon: "Copy",
            onSelect: () => {
              const csv = selectionCsv(table)
              void navigator.clipboard.writeText(csv)
              toast.success(
                `Copied ${table?.getFilteredSelectedRowModel().rows.length ?? 0} row(s)`,
              )
            },
          },
          {
            id: "csv",
            label: "Export CSV",
            icon: "FileDown",
            onSelect: () => {
              const csv = selectionCsv(table)
              const url = URL.createObjectURL(
                new Blob([csv], { type: "text/csv" }),
              )
              const anchor = document.createElement("a")
              anchor.href = url
              anchor.download = "records.csv"
              anchor.click()
              URL.revokeObjectURL(url)
              toast.success("Exported CSV")
            },
          },
        ],
      },
      {
        id: "delete",
        label: "Delete",
        icon: "Trash2",
        variant: "destructive",
        onSelect: () => {
          const removed = (table?.getFilteredSelectedRowModel().rows ?? []).map(
            (row) => row.original,
          )
          if (removed.length === 0) return
          dispatch({
            type: "delete",
            ids: removed.map((row) => String(row.id)),
          })
          table?.resetRowSelection()
          // The toast carries its OWN deleted batch, so Undo restores exactly
          // these rows even after further deletes.
          toast.success(`Deleted ${removed.length} row(s)`, {
            action: {
              label: "Undo",
              onClick: () =>
                dispatch({ type: "restoreDeleted", rows: removed }),
            },
          })
        },
      },
    ],
    [],
  )

  const inspectorContent = React.useCallback(
    (row: TableSectionRow) =>
      buildInspectorTabs(row, commit, {
        activity: history[String(row.id)] ?? [],
        files: attachments[String(row.id)] ?? [],
        onUpload: (files) =>
          dispatch({
            type: "addFiles",
            rowId: String(row.id),
            files: files.map((file, i) => ({
              id: `${String(row.id)}-${Date.now()}-${i}`,
              name: file.name,
              kind: "file",
              meta: `${Math.round(file.size / 1024)} KB`,
            })),
          }),
        onRemoveFile: (fileId) =>
          dispatch({ type: "removeFile", rowId: String(row.id), fileId }),
      }),
    [commit, history, attachments],
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
        onAddView: () => toast.success("Add view — coming soon"),
      }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      onCellEdit={onCellEdit}
      openRowId={openRowId}
      sections={[
        sectionTable({
          anchor: "records",
          columns: COLUMNS,
          rows: viewRows,
          rowIdKey: "id",
          features: { search: true, inspect: true },
          emptyText: "No demo records — seed the dev org first.",
        }),
      ]}
      inspectorRowTitle={(row) => `#${String(row.document ?? "")}`}
      inspectorRowName={(row) => String(row.partner ?? "")}
      inspectorRowContent={inspectorContent}
      inspectorDeclineLabel="Reject"
      inspectorApproveLabel="Approve"
      onInspectorDecline={(row) => {
        commit(String(row.id), "status", "rejected")
        toast.success(`Rejected #${String(row.document ?? "")}`)
      }}
      onInspectorApprove={(row) => {
        commit(String(row.id), "status", "posted")
        toast.success(`Approved #${String(row.document ?? "")}`)
      }}
      onInspectorCopy={(row, what) => {
        const value =
          what === "link"
            ? `${window.location.origin}${window.location.pathname}?inspect=${String(row.id ?? "")}`
            : what === "id"
              ? String(row.id ?? "")
              : `#${String(row.document ?? "")}`
        void navigator.clipboard.writeText(value)
        toast.success(
          what === "link"
            ? "Link copied"
            : what === "id"
              ? "ID copied"
              : "Number copied",
        )
      }}
      onInspectorSwitchLayout={() => toast.success("Switch layout (demo)")}
    />
  )
}

/**
 * The row Inspector. `details` fields commit back into the row; `activity` shows
 * the REAL edit history for this row (each entry's Undo reverts the change);
 * `attachments` accepts uploads on any row; `settings` is a cross-cutting tab
 * present on every record. Tabs not returned here render an empty pane (the rail
 * always lists every tab).
 */
function buildInspectorTabs(
  row: TableSectionRow,
  commit: (rowId: string, field: string, value: TableCellValue) => void,
  extras: {
    activity: Activity[]
    files: InspectorAttachmentFile[]
    onUpload: (files: File[]) => void
    onRemoveFile: (fileId: string) => void
  },
): Partial<Record<InspectorTab, React.ReactNode>> {
  const id = String(row.id)
  const doc = String(row.document ?? "")
  const partner = String(row.partner ?? "")
  const status = String(row.status ?? "")
  const amount = Number(row.amount ?? 0)
  const net = Math.round(amount * 0.8 * 100) / 100
  const vat = Math.round((amount - net) * 100) / 100

  return {
    details: (
      <SectionList
        sections={[
          sectionInspectorKeyDetails({
            lines: [
              {
                label: "Document",
                value: doc,
                icon: "HashIcon",
                readOnly: true,
              },
              {
                label: "Partner",
                value: partner,
                icon: "Building2",
                onChange: (next) => commit(id, "partner", next),
              },
              {
                label: "Status",
                value: status,
                type: "select",
                options: STATUS_OPTIONS,
                icon: "CheckCircle2",
                onChange: (next) => commit(id, "status", next),
              },
              {
                label: "Amount",
                value: amount,
                type: "money",
                currency: "CZK",
                readOnly: true,
              },
              {
                label: "Issued",
                value: String(row.issuedOn ?? ""),
                type: "date",
                icon: "CalendarIcon",
                onChange: (next) => commit(id, "issuedOn", next),
              },
              {
                label: "Note",
                value: String(row.note ?? ""),
                icon: "TextInitialIcon",
                onChange: (next) => commit(id, "note", next),
              },
            ],
          }),
          sectionInspectorMoneyTotals({
            title: "Totals",
            rows: [
              { label: "Net", amount: net },
              { label: "VAT 21%", amount: vat },
              { label: "Total", amount, emphasis: true },
            ],
          }),
        ]}
      />
    ),
    activity: (
      <SectionList
        sections={[
          sectionInspectorActivityLog({
            title: "Activity",
            entries:
              extras.activity.length > 0
                ? extras.activity.map((entry) => ({
                    id: entry.id,
                    field: labelForField(entry.field),
                    before: entry.before || "—",
                    after: entry.after || "—",
                    when: entry.when,
                    by: "You",
                    onUndo: () => commit(id, entry.field, entry.before),
                  }))
                : [
                    {
                      id: "empty",
                      field: "No changes yet",
                      before: "—",
                      after: "—",
                      when: "",
                      by: "",
                    },
                  ],
          }),
        ]}
      />
    ),
    attachments: (
      <SectionList
        sections={[
          sectionInspectorAttachments({
            files: extras.files,
            onUpload: extras.onUpload,
            onRemove: extras.onRemoveFile,
          }),
        ]}
      />
    ),
    settings: (
      <SectionList
        sections={[
          sectionInspectorKeyDetails({
            title: "Record settings",
            lines: [
              { label: "Record ID", value: id, icon: "IdCard", readOnly: true },
              {
                label: "Note",
                value: String(row.note ?? ""),
                icon: "TextInitialIcon",
                onChange: (next) => commit(id, "note", next),
              },
            ],
          }),
        ]}
      />
    ),
  }
}

const FIELD_LABELS: Record<string, string> = {
  partner: "Partner",
  status: "Status",
  amount: "Amount",
  issuedOn: "Issued",
  note: "Note",
}
function labelForField(field: string): string {
  return FIELD_LABELS[field] ?? field
}
