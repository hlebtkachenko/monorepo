"use client"

import type { ComponentType } from "react"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Plus, Trash2, Upload } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { SectionTwoCol } from "./section-details-parts"
import type {
  DetailsTableAction,
  DetailsTableActionIcon,
  DetailsTableBadgeTone,
  DetailsTableCellDisplay,
  DetailsTableCellValue,
  DetailsTableColumn,
  SectionDetailsTablePayload,
} from "./section-details-table"

const ACTION_ICON: Record<DetailsTableActionIcon, ComponentType> = {
  add: Plus,
  import: Upload,
}

/** Normalises a cell value (string | {value,tone}) to its display text. */
function cellText(value: DetailsTableCellValue | undefined): string {
  if (value == null) return ""
  return typeof value === "string" ? value : value.value
}

/** Per-row tone override, falling back to the column's tone, then neutral. */
function cellTone(
  value: DetailsTableCellValue | undefined,
  fallback: DetailsTableBadgeTone | undefined,
): DetailsTableBadgeTone {
  const rowTone =
    typeof value === "object" && value != null ? value.tone : undefined
  return rowTone ?? fallback ?? "neutral"
}

/** A tokenised badge — `success` uses the `--success` token, never a raw green. */
function DisplayBadge({
  value,
  tone,
}: {
  value: string
  tone: DetailsTableBadgeTone
}) {
  if (tone === "success") {
    return (
      <Badge
        variant="secondary"
        className="border-transparent bg-success/10 text-success"
      >
        {value}
      </Badge>
    )
  }
  const variant =
    tone === "primary"
      ? "default"
      : tone === "outline"
        ? "outline"
        : "secondary"
  return <Badge variant={variant}>{value}</Badge>
}

const Dash = () => <span className="text-muted-foreground">—</span>

/** One readonly display cell, dispatched on the column's display kind. */
function DisplayCell({
  display,
  value,
}: {
  display: DetailsTableCellDisplay | undefined
  value: DetailsTableCellValue | undefined
}) {
  const text = cellText(value)
  const d = display ?? { kind: "text" as const }
  switch (d.kind) {
    case "mono":
      return text.trim() === "" ? (
        <Dash />
      ) : (
        <span className="font-mono text-[0.8125rem] tabular-nums">{text}</span>
      )
    case "badge":
      return text.trim() === "" ? (
        <Dash />
      ) : (
        <DisplayBadge value={text} tone={cellTone(value, d.tone)} />
      )
    case "badge-or-dash":
      return text.trim() === "" ? (
        <Dash />
      ) : (
        <DisplayBadge value={text} tone={cellTone(value, d.tone)} />
      )
    case "text":
      return text.trim() === "" ? <Dash /> : <span>{text}</span>
    default:
      return d satisfies never
  }
}

/** One editable cell — a text input or our Select, seeded from the cell value. */
function EditCell({
  column,
  value,
  name,
}: {
  column: DetailsTableColumn
  value?: DetailsTableCellValue
  name?: string
}) {
  const edit = column.edit ?? { kind: "text" as const }
  const defaultValue = cellText(value)
  if (edit.kind === "select") {
    return (
      <Select name={name} defaultValue={defaultValue || undefined}>
        <SelectTrigger aria-label={column.header} className="h-8 w-full">
          <SelectValue placeholder={edit.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(edit.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      name={name}
      aria-label={column.header}
      defaultValue={defaultValue}
      placeholder={edit.placeholder}
      inputMode={edit.inputMode}
      className="h-8"
    />
  )
}

function RemoveButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground"
    >
      <Trash2 />
    </Button>
  )
}

function TableActionButton({
  action,
  onAddRow,
}: {
  action: DetailsTableAction
  onAddRow: () => void
}) {
  const Icon = action.icon ? ACTION_ICON[action.icon] : undefined
  const content = (
    <>
      {Icon != null ? <Icon aria-hidden /> : null}
      {action.label}
    </>
  )
  const className = "text-muted-foreground hover:text-foreground"
  // A `link` action navigates for real; every other action appends a row.
  if (action.behavior === "link") {
    return (
      <Button asChild variant="ghost" size="sm" className={className}>
        <a href={action.href}>{content}</a>
      </Button>
    )
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onAddRow}
      className={className}
    >
      {content}
    </Button>
  )
}

/**
 * SectionDetailsTable — the Details Form section with its right column swapped
 * for a data-driven table plus action buttons below. Two modes:
 *   - `readonly`: existing rows render as display cells; "+ New" appends editable
 *     rows (show-info-and-add).
 *   - `editable`: existing rows render as inputs, editable in place.
 * Appended rows are held in local renderer state (never a callback through the
 * descriptor), stay editable, and are removable — so typed values survive until
 * reload / Discard. The left title/description block is the shared `SectionTwoCol`.
 */
export function SectionDetailsTableRenderer({
  props,
}: {
  props: SectionDetailsTablePayload
}) {
  const { title, description, mode, columns, rows, actions, emptyText, name } =
    props

  // Appended rows are always blank + editable. A monotonic ref counter gives
  // stable, collision-free ids across add/remove (no Math.random / Date.now).
  const [appended, setAppended] = React.useState<readonly string[]>([])
  const nextId = React.useRef(0)
  const addRow = React.useCallback(() => {
    setAppended((prev) => [...prev, `new-${nextId.current++}`])
  }, [])
  const removeRow = React.useCallback((id: string) => {
    setAppended((prev) => prev.filter((rowId) => rowId !== id))
  }, [])

  // A trailing action column exists only when rows can be appended (appended
  // rows carry the remove control; existing rows get an empty trailing cell).
  const canAppend = actions.some((action) => action.behavior !== "link")
  const showActionCol = canAppend
  const colCount = columns.length + (showActionCol ? 1 : 0)
  const isEmpty = rows.length === 0 && appended.length === 0

  const inputName = (rowId: string, colId: string) =>
    name != null ? `${name}[${rowId}][${colId}]` : undefined

  const alignEnd = (align: DetailsTableColumn["align"]) => align === "end"

  return (
    <SectionTwoCol title={title} description={description}>
      <div className="min-w-0">
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.id}
                    className={cn(
                      "text-muted-foreground",
                      alignEnd(col.align) && "text-right",
                    )}
                  >
                    {col.header}
                  </TableHead>
                ))}
                {showActionCol ? (
                  <TableHead className="w-10">
                    <span className="sr-only">Row actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmpty ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={colCount}
                    className="py-6 text-center text-muted-foreground"
                  >
                    {emptyText ?? "Nothing here yet."}
                  </TableCell>
                </TableRow>
              ) : null}

              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(alignEnd(col.align) && "text-right")}
                    >
                      {mode === "editable" ? (
                        <EditCell
                          column={col}
                          value={row.cells[col.id]}
                          name={inputName(row.id, col.id)}
                        />
                      ) : (
                        <DisplayCell
                          display={col.display}
                          value={row.cells[col.id]}
                        />
                      )}
                    </TableCell>
                  ))}
                  {showActionCol ? <TableCell className="w-10" /> : null}
                </TableRow>
              ))}

              {appended.map((rowId) => (
                <TableRow key={rowId} className="bg-muted/30">
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(alignEnd(col.align) && "text-right")}
                    >
                      <EditCell column={col} name={inputName(rowId, col.id)} />
                    </TableCell>
                  ))}
                  <TableCell className="w-10 text-right">
                    <RemoveButton
                      onClick={() => removeRow(rowId)}
                      label="Remove new row"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {actions.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {actions.map((action) => (
              <TableActionButton
                key={action.id}
                action={action}
                onAddRow={addRow}
              />
            ))}
          </div>
        ) : null}
      </div>
    </SectionTwoCol>
  )
}
