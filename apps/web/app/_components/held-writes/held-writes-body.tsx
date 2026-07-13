"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  type InspectorMode,
} from "@workspace/ui/blocks/app-content"
import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Badge } from "@workspace/ui/components/badge"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import {
  DataTableColumnManager,
  DataTableMultiSort,
  useDataTable,
} from "@workspace/ui/components/data-table"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { useIcons } from "@workspace/ui/icon-packs"
import { Search } from "@workspace/ui/lib/icons"

import { normalizeSearch } from "../_shared/accounting-format"
import { resolveHeldWrite } from "../../[orgSlug]/accounting/approvals/actions"
import {
  actorLabel,
  buildHeldWriteColumns,
  HeldWriteDetailBody,
  HeldWriteDetailFooter,
  toolLabel,
  type AccountOption,
  type HeldWriteListRow,
  type ResolveHeldWriteFn,
} from "./columns"
import { draftFromRow, type HeldWriteEditDraft } from "./edit-panel"

/** Free-text search across the visible held-write fields. */
function applySearch(
  rows: HeldWriteListRow[],
  query: string,
): HeldWriteListRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.summary,
      toolLabel(row.tool_name),
      actorLabel(row.actor_kind),
      row.idempotency_key,
      row.rationale ?? "",
      row.created_at,
    ].some((value) => normalizeSearch(value).includes(q)),
  )
}

/**
 * Held-writes review queue body — the Table archetype over `fetchHeldWrites`
 * rows. The inspector shows the full gated payload and resolves the write via
 * the `resolveHeldWrite` server action (approve replays the domain call,
 * reject just marks the row); the resolved row disappears on revalidate.
 */
export function HeldWritesBody({
  rows,
  orgSlug,
  accounts,
  resolveAction = resolveHeldWrite,
}: {
  rows: HeldWriteListRow[]
  orgSlug: string
  /** [M1.7] Chart-of-accounts options for the edit-before-approve account picker. */
  accounts: AccountOption[]
  /** Injectable resolve action — the dev preview passes an inert stub; production uses the real server action. */
  resolveAction?: ResolveHeldWriteFn
}) {
  const [search, setSearch] = React.useState("")
  const [inspected, setInspected] = React.useState<HeldWriteListRow | null>(
    null,
  )
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode] = React.useState<InspectorMode>("panel")

  // [M1.7] Edit state is LIFTED here so the inspector body (edit form) and the
  // pinned inspector footer (the "Upravit" toggle + approve/reject) share one
  // draft. Reset synchronously when a DIFFERENT write is inspected — the
  // "adjust state during render" pattern (React docs), replacing the old
  // key-remount reset now that body + footer are separate slots.
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<HeldWriteEditDraft | null>(null)
  const [draftForId, setDraftForId] = React.useState<string | null>(null)
  if (inspected && inspected.id !== draftForId) {
    setDraftForId(inspected.id)
    setDraft(draftFromRow(inspected))
    setEditing(false)
  }

  const openInspector = React.useCallback((row: HeldWriteListRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])

  const columns = React.useMemo(
    () => buildHeldWriteColumns({ onInspect: openInspector }),
    [openInspector],
  )

  const data = React.useMemo(() => applySearch(rows, search), [rows, search])

  // Sibling held writes for the inspected row's účetní případ (same
  // conversationId) — a write with no conversationId has no siblings.
  const caseWrites = React.useMemo(() => {
    if (!inspected?.conversation_id) return []
    return rows.filter(
      (r) =>
        r.id !== inspected.id &&
        r.conversation_id === inspected.conversation_id,
    )
  }, [rows, inspected])

  const { table } = useDataTable<HeldWriteListRow>({
    data,
    columns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 140, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
  const isFiltered = search.trim() !== ""
  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  const icons = useIcons()
  const CheckIcon = icons.Check
  const RejectIcon = icons.X

  // Bulk resolve the selected held writes straight from the ActionBar — no
  // Inspector needed. Each replays through the same `resolveHeldWrite` action
  // (approve books it, reject marks it); runs sequentially so one failure
  // doesn't abort the rest, then reports the tally and clears the selection.
  const [isBulkPending, startBulk] = React.useTransition()
  const bulkResolve = (action: "approve" | "reject") => {
    const ids = table
      .getFilteredSelectedRowModel()
      .rows.map((r) => r.original.id)
    if (ids.length === 0) return
    startBulk(async () => {
      let ok = 0
      let failed = 0
      for (const id of ids) {
        const result = await resolveAction({ orgSlug, id, action })
        if (result.ok) ok += 1
        else failed += 1
      }
      table.resetRowSelection()
      const verb = action === "approve" ? "schváleno" : "zamítnuto"
      if (failed === 0) toast.success(`${ok} ${verb}`)
      else toast.error(`${ok} ${verb}, ${failed} se nezdařilo`)
    })
  }

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={
        inspected && draft ? (
          <HeldWriteDetailBody
            row={inspected}
            caseWrites={caseWrites}
            accounts={accounts}
            editing={editing}
            draft={draft}
            onDraftChange={setDraft}
          />
        ) : null
      }
      inspectorFooter={
        inspected && draft ? (
          <HeldWriteDetailFooter
            row={inspected}
            orgSlug={orgSlug}
            editing={editing}
            onToggleEdit={() => setEditing((value) => !value)}
            draft={draft}
            onResolved={() => {
              setInspectorOpen(false)
              setInspected(null)
            }}
            resolveAction={resolveAction}
          />
        ) : null
      }
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) setInspectorOpen(false)
      }}
      inspectorTitle={inspected ? toolLabel(inspected.tool_name) : undefined}
      toolbar={
        <ContentToolbar
          left={
            <div className="relative flex h-7 w-72 items-center">
              <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
              <Input
                placeholder="Hledat v položkách ke schválení…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-7 w-full pl-8"
              />
            </div>
          }
          right={
            <>
              <DataTableColumnManager table={table} />
              <DataTableMultiSort table={table} />
            </>
          }
        />
      }
      statusBar={
        <ContentStatusBar
          left={
            <div className="flex items-center gap-3">
              <span>
                {visible.length} {visible.length === 1 ? "položka" : "položek"}{" "}
                ke schválení
              </span>
              {isFiltered ? (
                <Badge variant="secondary" className="h-5">
                  Filtered
                </Badge>
              ) : null}
            </div>
          }
          right={
            <span className="tabular-nums">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {Math.max(table.getPageCount(), 1)}
            </span>
          }
        />
      }
      actionBar={
        <ActionBar
          open={selectedCount > 0}
          onOpenChange={(open) => {
            if (!open) table.resetRowSelection()
          }}
          aria-label="Hromadné schválení"
          sideOffset="var(--app-statusbar-clearance, 16px)"
        >
          <ActionBarSelection>{selectedCount} vybráno</ActionBarSelection>
          <ActionBarSeparator />
          <ActionBarGroup>
            <ActionBarItem
              disabled={isBulkPending}
              onSelect={() => bulkResolve("approve")}
            >
              <CheckIcon />
              Schválit a zaúčtovat
            </ActionBarItem>
            <ActionBarItem
              disabled={isBulkPending}
              onSelect={() => bulkResolve("reject")}
            >
              <RejectIcon />
              Zamítnout
            </ActionBarItem>
          </ActionBarGroup>
        </ActionBar>
      }
    >
      <DataGridView table={table} className="min-h-0 flex-1" />
    </ContentPanel>
  )
}
