"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsList,
} from "@workspace/ui/components/input-tags"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  ArrowUpRight,
  Check,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { SectionTwoCol } from "./section-details-parts"
import { useSectionAction } from "./section-action-context"
import type {
  DetailsTableColumn,
  DetailsTableColumnSpan,
  DetailsTableControl,
  DetailsTableCellValue,
  SectionDetailsTablePayload,
} from "./section-details-table"

/** Fixed 6-track column spans — enumerated so Tailwind keeps the literals. */
const COL_SPAN: Record<DetailsTableColumnSpan, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
}

const asText = (value: DetailsTableCellValue | undefined): string =>
  typeof value === "string" ? value : ""
const asTags = (value: DetailsTableCellValue | undefined): readonly string[] =>
  Array.isArray(value) ? value : []

/** A column's empty value: a tags column starts as an empty list, others as "". */
function blankValue(control: DetailsTableControl): DetailsTableCellValue {
  return control.kind === "tags" ? [] : ""
}

/** Full value record for a row, defaulting any column the row omits. */
function seedValues(
  columns: readonly DetailsTableColumn[],
  cells?: Readonly<Record<string, DetailsTableCellValue>>,
): Record<string, DetailsTableCellValue> {
  return Object.fromEntries(
    columns.map((col) => [col.id, cells?.[col.id] ?? blankValue(col.control)]),
  )
}

/** The value a display cell reads back — the selected option's label, joined tags, or text. */
function displayText(
  column: DetailsTableColumn,
  value: DetailsTableCellValue | undefined,
): string {
  if (column.control.kind === "tags") return asTags(value).join(", ")
  if (column.control.kind === "select") {
    const match = column.control.options.find((o) => o.value === asText(value))
    return match?.label ?? asText(value)
  }
  return asText(value)
}

/** A read-only cell — same font/size/colour as an input's text (item 4). */
function CellDisplay({
  column,
  value,
}: {
  column: DetailsTableColumn
  value: DetailsTableCellValue | undefined
}) {
  const text = displayText(column, value)
  return (
    <span
      className={cn(
        // Match the input control's text exactly (item 4): same size ramp,
        // font, and foreground colour.
        "truncate text-base text-foreground md:text-sm",
        text.trim() === "" && "text-muted-foreground",
        column.align === "end" && "text-right",
      )}
    >
      {text.trim() === "" ? "—" : text}
    </span>
  )
}

/**
 * An editable cell — the column's real control, seeded from and writing back to
 * the working value. `bg-background` keeps the field white against the grey
 * editing row (item 12). Dispatched on the closed control union.
 */
function CellControl({
  column,
  value,
  name,
  onChange,
}: {
  column: DetailsTableColumn
  value: DetailsTableCellValue | undefined
  name?: string
  onChange: (next: DetailsTableCellValue) => void
}) {
  const control = column.control
  switch (control.kind) {
    case "text":
      return (
        <Input
          name={name}
          aria-label={column.header}
          value={asText(value)}
          placeholder={control.placeholder}
          inputMode={control.inputMode}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 bg-background dark:bg-background"
        />
      )
    case "select":
      return (
        <Select name={name} value={asText(value)} onValueChange={onChange}>
          <SelectTrigger
            aria-label={column.header}
            className="h-8 w-full bg-background dark:bg-background"
          >
            <SelectValue placeholder={control.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {control.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "tags":
      return (
        <InputTags
          value={[...asTags(value)]}
          onValueChange={onChange}
          aria-label={column.header}
        >
          <InputTagsList className="min-h-8 bg-background py-1">
            {asTags(value).map((tag, index) => (
              <InputTagsItem key={`${tag}-${index}`} value={tag}>
                {tag}
              </InputTagsItem>
            ))}
            <InputTagsInput placeholder={control.placeholder} />
          </InputTagsList>
        </InputTags>
      )
    default:
      return control satisfies never
  }
}

/**
 * The trailing action cell — two icon buttons. The first toggles the row's edit
 * state: Pencil (start editing) in display mode, a Check ("apply changes, back to
 * read mode") while editing. The second removes the row: a plain X for an unsaved
 * new row (instant), a Trash2 for an existing row (opens a destructive confirm).
 */
function RowActions({
  isEditing,
  isNew,
  onToggle,
  onRemove,
}: {
  isEditing: boolean
  isNew: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <div
      role="cell"
      className="col-start-6 flex items-center justify-end gap-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={isEditing ? "Apply row changes" : "Edit row"}
        onClick={onToggle}
        className={cn(
          "text-muted-foreground",
          isEditing ? "hover:text-success" : "hover:text-foreground",
        )}
      >
        {isEditing ? <Check /> : <Pencil />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={isNew ? "Remove new row" : "Delete row"}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
      >
        {isNew ? <X /> : <Trash2 />}
      </Button>
    </div>
  )
}

const ROW_GRID = "grid grid-cols-6 items-center gap-x-6 px-3 py-2"

/**
 * One row of the editable list: a stable id, provenance flags (appended this
 * session / currently showing inputs / tombstoned for delete), and its working
 * cell values. This is the single piece of state the renderer reads and writes —
 * display and input both read `cells`, so there is no seed/overlay asymmetry.
 */
type DraftRow = {
  id: string
  isNew: boolean
  editing: boolean
  deleted: boolean
  actionDisabled?: boolean
  actionBusy?: boolean
  cells: Record<string, DetailsTableCellValue>
}

/**
 * SectionDetailsTable — the Details Form section with its right column swapped
 * for a grid-based table that aligns to the same fixed 6-track grid as the form
 * fields (item 2). Two modes:
 *   - `editable`: rows read-only until their Edit icon flips that row to inputs
 *     (a new row starts editable); Add appends, Delete confirms.
 *   - `readonly`: display-only cells, optionally with a configured row command.
 * All edit state (which rows are editing, appended rows, deleted rows, working
 * values) lives in this closed renderer — no callback crosses the descriptor.
 * Edits persist across re-render until reload (item 6); wiring real Save/Discard
 * (harvest + reset) is the footer's job and is not connected yet.
 */
export function SectionDetailsTableRenderer({
  props,
}: {
  props: SectionDetailsTablePayload
}) {
  const {
    title,
    description,
    mode,
    columns,
    rows,
    rowAction,
    addLabel,
    actions,
    actionsHeader,
    editHint,
    emptyText,
    name,
  } = props

  const editable = mode === "editable"
  const dispatch = useSectionAction()

  // The whole editable list as one working snapshot, seeded once from props.rows.
  // Each row owns its working cells plus its edit/new/deleted provenance — the
  // single source both the display cell and the input read from. Edits persist
  // across re-render until reload (item 6); wiring real Save/Discard (harvest
  // appended→INSERT, deleted→DELETE, edited→UPDATE) is the footer's job and not
  // connected yet.
  const [draft, setDraft] = React.useState<readonly DraftRow[]>(() =>
    rows.map((row) => ({
      id: row.id,
      isNew: false,
      editing: false,
      deleted: false,
      actionDisabled: row.actionDisabled,
      actionBusy: row.actionBusy,
      cells: seedValues(columns, row.cells),
    })),
  )
  // Existing row awaiting delete confirmation — a transient dialog id. A new row
  // drops instantly; an existing row is tombstoned so Save can emit its DELETE.
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null)
  const [pendingRowAction, setPendingRowAction] = React.useState<string | null>(
    null,
  )
  // Monotonic id source for appended rows — stable + collision-free, no randomness.
  const nextId = React.useRef(0)

  const patchRow = React.useCallback(
    (id: string, patch: (row: DraftRow) => DraftRow) => {
      setDraft((prev) => prev.map((row) => (row.id === id ? patch(row) : row)))
    },
    [],
  )

  const setCell = React.useCallback(
    (rowId: string, colId: string, next: DetailsTableCellValue) => {
      patchRow(rowId, (row) => ({
        ...row,
        cells: { ...row.cells, [colId]: next },
      }))
    },
    [patchRow],
  )

  const beginEdit = React.useCallback(
    (id: string) => patchRow(id, (row) => ({ ...row, editing: true })),
    [patchRow],
  )

  // Leave edit mode (the check / "apply" icon). Working cells are kept, so the
  // row's display now reflects the edit until reload / Discard.
  const applyEdit = React.useCallback(
    (id: string) => patchRow(id, (row) => ({ ...row, editing: false })),
    [patchRow],
  )

  const addRow = React.useCallback(() => {
    const id = `new-${nextId.current++}`
    setDraft((prev) => [
      ...prev,
      {
        id,
        isNew: true,
        editing: true,
        deleted: false,
        cells: seedValues(columns),
      },
    ])
  }, [columns])

  // Drop an appended row outright — it has no server row, so it needs no tombstone.
  const removeNew = React.useCallback(
    (id: string) => setDraft((prev) => prev.filter((row) => row.id !== id)),
    [],
  )

  // Tombstone an existing row for deletion — it leaves the rendered list at once
  // but stays in the draft so Save can emit the DELETE.
  const confirmDelete = React.useCallback(() => {
    if (pendingDelete == null) return
    patchRow(pendingDelete, (row) => ({
      ...row,
      deleted: true,
      editing: false,
    }))
    setPendingDelete(null)
  }, [pendingDelete, patchRow])

  const visible = editable
    ? draft.filter((row) => !row.deleted)
    : rows.map((row) => ({
        id: row.id,
        isNew: false,
        editing: false,
        deleted: false,
        actionDisabled: row.actionDisabled,
        actionBusy: row.actionBusy,
        cells: seedValues(columns, row.cells),
      }))
  const isEmpty = visible.length === 0
  const showActionsCol = editable || rowAction != null
  const inputName = (rowId: string, colId: string) =>
    name != null ? `${name}[${rowId}][${colId}]` : undefined

  // True when a row's working cells are all empty (blank text / empty tags).
  const isRowBlank = (cells: Record<string, DetailsTableCellValue>) =>
    columns.every((col) => {
      const value = cells[col.id]
      return Array.isArray(value)
        ? value.length === 0
        : String(value ?? "").trim() === ""
    })

  // The check ("apply") button. Applying a NEW row that is still empty is a
  // discard — don't leave a blank "—" row behind; drop it like the X button.
  const onApply = (row: DraftRow) => {
    if (row.isNew && isRowBlank(row.cells)) removeNew(row.id)
    else applyEdit(row.id)
  }

  const headerAlign = (col: DetailsTableColumn) =>
    col.align === "end" ? "justify-self-end text-right" : undefined

  return (
    <SectionTwoCol title={title} description={description}>
      <div className="min-w-0">
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <div className="overflow-x-auto">
            <div role="table" className="min-w-[34rem]">
              <div
                role="row"
                className={cn(ROW_GRID, "border-b border-border-subtle")}
              >
                {columns.map((col) => (
                  <div
                    role="columnheader"
                    key={col.id}
                    className={cn(
                      "text-sm leading-none font-medium text-foreground",
                      COL_SPAN[col.span ?? 1],
                      headerAlign(col),
                    )}
                  >
                    {col.header}
                  </div>
                ))}
                {showActionsCol ? (
                  <div
                    role="columnheader"
                    className="col-start-6 text-right text-sm leading-none font-medium text-foreground"
                  >
                    {rowAction?.header ?? actionsHeader}
                  </div>
                ) : null}
              </div>

              {isEmpty ? (
                <div role="row">
                  <div
                    role="cell"
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    {emptyText ?? "Nothing here yet."}
                  </div>
                </div>
              ) : null}

              {visible.map((row) => (
                <div
                  role="row"
                  key={row.id}
                  className={cn(
                    ROW_GRID,
                    "border-b border-border-subtle last:border-b-0",
                    row.editing ? "bg-muted/40" : "hover:bg-muted/20",
                  )}
                >
                  {columns.map((col) => {
                    const value = row.cells[col.id]
                    return (
                      <div
                        role="cell"
                        key={col.id}
                        className={cn(
                          "flex min-w-0 flex-col",
                          COL_SPAN[col.span ?? 1],
                        )}
                      >
                        {row.editing ? (
                          <CellControl
                            column={col}
                            value={value}
                            name={inputName(row.id, col.id)}
                            onChange={(next) => setCell(row.id, col.id, next)}
                          />
                        ) : (
                          <CellDisplay column={col} value={value} />
                        )}
                      </div>
                    )
                  })}
                  {editable ? (
                    <RowActions
                      isEditing={row.editing}
                      isNew={row.isNew}
                      onToggle={() =>
                        row.editing ? onApply(row) : beginEdit(row.id)
                      }
                      onRemove={() =>
                        row.isNew ? removeNew(row.id) : setPendingDelete(row.id)
                      }
                    />
                  ) : rowAction != null ? (
                    <div
                      role="cell"
                      className="col-start-6 flex items-center justify-end"
                    >
                      <Button
                        type="button"
                        variant={rowAction.variant ?? "outline"}
                        disabled={row.actionDisabled || row.actionBusy}
                        onClick={() => {
                          if (rowAction.confirmTitle != null) {
                            setPendingRowAction(row.id)
                          } else {
                            dispatch({
                              id: rowAction.actionId,
                              payload: { rowId: row.id },
                            })
                          }
                        }}
                      >
                        {row.actionBusy
                          ? (rowAction.busyLabel ?? "Working…")
                          : rowAction.label}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {editable && (addLabel != null || actions.length > 0) ? (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {addLabel != null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="text-muted-foreground hover:text-foreground"
              >
                <Plus aria-hidden />
                {addLabel}
              </Button>
            ) : null}
            {actions.map((action) => (
              <Button
                key={action.id}
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <a href={action.href}>
                  {action.icon === "import" ? <Upload aria-hidden /> : null}
                  {action.label}
                </a>
              </Button>
            ))}
          </div>
        ) : null}

        {editHint != null && !editable ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {editHint.text ?? "To edit this data, go to"}{" "}
            <a
              href={editHint.href}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-4"
            >
              {editHint.linkLabel}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this row?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the row from the table. It takes effect when you save
              the page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {rowAction != null ? (
        <AlertDialog
          open={pendingRowAction != null}
          onOpenChange={(open) => {
            if (!open) setPendingRowAction(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{rowAction.confirmTitle}</AlertDialogTitle>
              {rowAction.confirmDescription != null ? (
                <AlertDialogDescription>
                  {rowAction.confirmDescription}
                </AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={rowAction.variant ?? "default"}
                onClick={() => {
                  if (pendingRowAction != null) {
                    dispatch({
                      id: rowAction.actionId,
                      payload: { rowId: pendingRowAction },
                    })
                  }
                  setPendingRowAction(null)
                }}
              >
                {rowAction.confirmLabel ?? rowAction.label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </SectionTwoCol>
  )
}
