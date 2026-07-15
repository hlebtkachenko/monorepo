"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { formatMoney } from "@workspace/ui/lib/format-number"
import { cn } from "@workspace/ui/lib/utils"

import { useInspectorEditing } from "./inspector-edit-context"
import { InspectorSection } from "./inspector-section"

export interface InspectorLinkedRecord {
  id: string
  /** Relation kind shown as a badge (Záloha, Platba, Doklad, Odkaz, …). */
  relation: string
  relationVariant?: React.ComponentProps<typeof Badge>["variant"]
  /** Record label / number. */
  label: string
  /** Muted second line. */
  meta?: string
  /** MAJOR-unit amount shown right-aligned. */
  amount?: number
  currency?: string
  icon?: IconName
  /** Deep link to the related record. */
  href?: string
}

export interface InspectorLinkedRecordsProps {
  title?: string
  items: InspectorLinkedRecord[]
  /** Edit-mode add affordance. */
  addLabel?: string
  onAdd?: () => void
  /** Edit-mode per-row remove. */
  onRemove?: (id: string) => void
  emptyText?: string
  className?: string
}

function money(amount: number, currency = "CZK"): string {
  return formatMoney({ amount: BigInt(Math.round(amount * 100)), currency })
}

// One shared column template so every row's relation / label / amount / action
// line up on the same vertical tracks — a table, not free-floating cards.
const ROW =
  "col-span-full grid grid-cols-subgrid items-center gap-x-3 px-3 py-2"

function LinkedRow({
  record,
  editing,
  onRemove,
}: {
  record: InspectorLinkedRecord
  editing: boolean
  onRemove?: (id: string) => void
}) {
  const icons = useIcons()
  const Icon = record.icon ? icons[record.icon] : null
  const Arrow = icons.ArrowUpRight
  const Trash = icons.Trash2
  const interactive = record.href != null && !editing

  const cells = (
    <>
      <div className="flex items-center gap-2">
        <Badge variant={record.relationVariant ?? "secondary"}>
          {record.relation}
        </Badge>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {record.label}
          </span>
          {record.meta ? (
            <span className="block truncate text-xs text-muted-foreground">
              {record.meta}
            </span>
          ) : null}
        </div>
      </div>
      <span className="shrink-0 text-right text-sm tabular-nums">
        {record.amount != null ? money(record.amount, record.currency) : ""}
      </span>
      <span className="flex shrink-0 justify-end">
        {editing && onRemove ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${record.label}`}
            onClick={() => onRemove(record.id)}
          >
            <Trash aria-hidden />
          </Button>
        ) : interactive ? (
          <Arrow aria-hidden className="size-4 text-muted-foreground" />
        ) : null}
      </span>
    </>
  )

  const rowClass = cn(ROW, "border-b border-border-subtle last:border-b-0")
  if (interactive) {
    return (
      <a href={record.href} className={cn(rowClass, "hover:bg-grey-subtle/60")}>
        {cells}
      </a>
    )
  }
  return <div className={rowClass}>{cells}</div>
}

/**
 * InspectorLinkedRecords — the typed "Vazby" list for the Related tab. A
 * table-aligned grid (subgrid rows): every accounting link off a record
 * (advances, payments, linked documents, references) as a row whose relation
 * badge, label, amount and action sit on shared vertical tracks. In edit mode
 * rows gain a remove button and an Add affordance. Data-in via `items`.
 */
export function InspectorLinkedRecords({
  title,
  items,
  addLabel,
  onAdd,
  onRemove,
  emptyText = "No linked records.",
  className,
}: InspectorLinkedRecordsProps) {
  const editing = useInspectorEditing()
  const icons = useIcons()
  const Plus = icons.Plus

  return (
    <InspectorSection
      title={title}
      className={className}
      contentClassName="flex flex-col gap-2"
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-[auto_1fr_auto_auto] overflow-hidden rounded-md border border-border-subtle">
          {items.map((record) => (
            <LinkedRow
              key={record.id}
              record={record}
              editing={editing}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      {editing && onAdd ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={onAdd}
        >
          <Plus aria-hidden />
          {addLabel ?? "Link a record"}
        </Button>
      ) : null}
    </InspectorSection>
  )
}
