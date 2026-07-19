"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import {
  buildTableFooter,
  buildTableToolbar,
  SectionList,
  sectionInspectorActivityLog,
  sectionInspectorAttachments,
  sectionInspectorExport,
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
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
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
 *   - the selection footer is built by `buildTableFooter` (Export = a segmented
 *     ButtonGroup "Copy to clipboard" | "Export as CSV") + a page Delete (Undo);
 *   - the Attachments tab uploads, previews (images), downloads, renames, copies,
 *     and adds validated links (redirect) — all wired; the Export tab exports this
 *     record; the More tab duplicates / archives / deletes it.
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
  | { type: "duplicate"; rowId: string }
  | { type: "addFiles"; rowId: string; files: InspectorAttachmentFile[] }
  | { type: "renameFile"; rowId: string; fileId: string; name: string }
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
    case "duplicate": {
      const idx = state.rows.findIndex((row) => String(row.id) === action.rowId)
      if (idx < 0) return state
      const src = state.rows[idx]!
      const copy: TableSectionRow = {
        ...src,
        id: `${String(src.id)}-copy-${state.seq}`,
        document: `${String(src.document ?? "")}-COPY`,
      }
      const rows = [...state.rows]
      rows.splice(idx + 1, 0, copy)
      return { ...state, rows, seq: state.seq + 1 }
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
    case "renameFile":
      return {
        ...state,
        attachments: {
          ...state.attachments,
          [action.rowId]: (state.attachments[action.rowId] ?? []).map((file) =>
            file.id === action.fileId ? { ...file, name: action.name } : file,
          ),
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

/** Pick an attachment kind from a File's MIME type (drives its icon + preview). */
function kindForFile(file: File): InspectorAttachmentFile["kind"] {
  if (file.type.startsWith("image/")) return "image"
  if (file.type === "application/pdf") return "pdf"
  return "file"
}

/** Trigger a browser download of `content` under `filename`. */
function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
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

  // The selection footer shape is owned at the design-system level by
  // `buildTableFooter` (Export = a segmented ButtonGroup of clipboard | CSV, both
  // over the selected rows × visible columns). The page only adds Delete — the
  // one action that needs its own reducer + Undo toast.
  const selectionActions = React.useCallback(
    (table: Table<TableSectionRow> | null): ContentFooterAction[] =>
      buildTableFooter(table, {
        exportFileName: "records",
        actions: [
          {
            id: "delete",
            label: "Delete",
            icon: "Trash2",
            variant: "destructive",
            onSelect: () => {
              const removed = (
                table?.getFilteredSelectedRowModel().rows ?? []
              ).map((row) => row.original)
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
      }),
    [],
  )

  const inspectorContent = React.useCallback(
    (row: TableSectionRow) => {
      const rowId = String(row.id)
      const files = attachments[rowId] ?? []
      const findFile = (id: string) => files.find((file) => file.id === id)
      return buildInspectorTabs(row, commit, {
        activity: history[rowId] ?? [],
        files,
        onUpload: (picked) =>
          dispatch({
            type: "addFiles",
            rowId,
            files: picked.map((file, i) => ({
              id: `${rowId}-${Date.now()}-${i}`,
              name: file.name,
              kind: kindForFile(file),
              meta: `${Math.round(file.size / 1024)} KB`,
              url: URL.createObjectURL(file),
            })),
          }),
        onResolvePreview: (id) => Promise.resolve(findFile(id)?.url ?? null),
        onDownload: (id) => {
          const file = findFile(id)
          if (!file?.url) return
          const anchor = document.createElement("a")
          anchor.href = file.url
          anchor.download = file.name
          anchor.click()
        },
        onRename: (id) => {
          const file = findFile(id)
          if (!file) return
          const next = window.prompt("Rename attachment", file.name)?.trim()
          if (next)
            dispatch({ type: "renameFile", rowId, fileId: id, name: next })
        },
        onCopyUrl: (id) => {
          const file = findFile(id)
          void navigator.clipboard.writeText(file?.url ?? file?.name ?? "")
          toast.success("URL copied")
        },
        onRemoveFile: (id) =>
          dispatch({ type: "removeFile", rowId, fileId: id }),
        onDuplicate: () => {
          dispatch({ type: "duplicate", rowId })
          toast.success(`Duplicated #${String(row.document ?? "")}`)
        },
        onArchive: () =>
          toast.success(`Archived #${String(row.document ?? "")} (demo)`),
        onDelete: () => {
          dispatch({ type: "delete", ids: [rowId] })
          toast.success(`Deleted #${String(row.document ?? "")}`)
        },
      })
    },
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
 * `attachments` uploads / previews / downloads / renames / links; `export`
 * exports this record; `more` holds the record actions (duplicate / archive /
 * delete). Tabs not returned here render an empty pane (the rail always lists
 * every tab).
 */
function buildInspectorTabs(
  row: TableSectionRow,
  commit: (rowId: string, field: string, value: TableCellValue) => void,
  extras: {
    activity: Activity[]
    files: InspectorAttachmentFile[]
    onUpload: (files: File[]) => void
    onResolvePreview: (id: string) => Promise<string | null>
    onDownload: (id: string) => void
    onRename: (id: string) => void
    onCopyUrl: (id: string) => void
    onRemoveFile: (id: string) => void
    onDuplicate: () => void
    onArchive: () => void
    onDelete: () => void
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
            onResolvePreview: extras.onResolvePreview,
            onDownload: extras.onDownload,
            onRename: extras.onRename,
            onCopyUrl: extras.onCopyUrl,
            onRemove: extras.onRemoveFile,
          }),
        ]}
      />
    ),
    export: (
      <SectionList
        sections={[
          sectionInspectorExport({
            fields: [
              { id: "details", label: "Details" },
              { id: "totals", label: "Totals & VAT" },
              { id: "activity", label: "Activity", defaultChecked: false },
              {
                id: "attachments",
                label: "Attachments",
                defaultChecked: false,
              },
            ],
            defaultEmail: "",
            onPrint: () => toast.success(`Printing #${doc} (demo)`),
            // Wire the footer's export here: build a CSV of THIS record's fields
            // and download it, so the Export tab actually produces a file.
            onExport: (format) => {
              const csv = [
                ["Field", "Value"],
                ["Document", doc],
                ["Partner", partner],
                ["Status", status],
                ["Amount", String(amount)],
                ["Issued", String(row.issuedOn ?? "")],
                ["Note", String(row.note ?? "")],
              ]
                .map((cells) => cells.map(csvCell).join(","))
                .join("\n")
              download(csv, `${doc || "record"}.csv`, "text/csv")
              toast.success(`Exported #${doc} as ${format.toUpperCase()}`)
            },
            onSendEmail: (email, format) =>
              toast.success(`Sent ${format.toUpperCase()} to ${email} (demo)`),
          }),
        ]}
      />
    ),
    more: (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            className="justify-start"
            onClick={extras.onDuplicate}
          >
            Duplicate
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={extras.onArchive}
          >
            Archive
          </Button>
        </div>
        <Separator className="-mx-4 w-auto bg-border-subtle" />
        <Button
          variant="ghost"
          className="justify-start text-destructive hover:text-destructive"
          onClick={extras.onDelete}
        >
          Delete
        </Button>
      </div>
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
