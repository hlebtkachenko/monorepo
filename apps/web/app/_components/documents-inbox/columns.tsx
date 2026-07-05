"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { DetailField } from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { useIcons } from "@workspace/ui/icon-packs"

import {
  actorLabel,
  ConfidenceBadge,
  formatCreatedAt,
  TOOL_OPTIONS,
  toolLabel,
} from "../held-writes/columns"

/**
 * One gated write from `fetchIngestionInbox`, prepared by the inbox page for a
 * READ-ONLY overview. Every field is a plain serializable string derived on the
 * server; `status` is the ingestion outcome, `confidence` may be null for rows
 * the gate never scored. Nothing here resolves a write — the approvals page
 * owns approve/reject.
 */
export interface InboxListRow {
  id: string
  tool_name: string
  actor_kind: string
  /** Decimal string ("0.6300") or null when the row was never scored. */
  confidence: string | null
  rationale: string | null
  /** Trimmed to "YYYY-MM-DD HH:MM" on the server. */
  created_at: string
  /** Human summary derived from the payload on the server. */
  summary: string
  status: InboxStatus
}

export type InboxStatus = "applied" | "held" | "approved" | "rejected"

const STATUS_LABELS: Record<InboxStatus, string> = {
  applied: "Zaúčtováno",
  held: "Ke schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as InboxStatus] ?? status
}

export const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as InboxStatus[]).map(
  (value) => ({ label: STATUS_LABELS[value], value }),
)

/** Badge tinted by ingestion outcome: held reads as pending, rejected as risky. */
function StatusBadge({ status }: { status: InboxStatus }) {
  const tone =
    status === "rejected"
      ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
      : status === "held"
        ? "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
        : undefined
  return (
    <Badge variant="secondary" className={tone}>
      {statusLabel(status)}
    </Badge>
  )
}

/** Row affordance opening the read-only Inspector for this row. */
function InspectCell({
  row,
  onInspect,
}: {
  row: InboxListRow
  onInspect: (row: InboxListRow) => void
}) {
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Detail for ${row.id}`}
      onClick={() => onInspect(row)}
    >
      <Icon />
    </Button>
  )
}

/** TanStack column defs for the read-only ingestion inbox. */
export function buildInboxColumns({
  onInspect,
}: {
  onInspect: (row: InboxListRow) => void
}): ColumnDef<InboxListRow>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Vytvořeno",
      size: 150,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatCreatedAt(row.original.created_at)}
        </span>
      ),
      meta: { label: "Vytvořeno" },
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: "Stav",
      size: 130,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      meta: {
        label: "Stav",
        variant: "multiSelect",
        options: STATUS_OPTIONS,
      },
      enableColumnFilter: true,
      filterFn: (row, columnId, value) => {
        if (!Array.isArray(value) || value.length === 0) return true
        return value.includes(row.getValue(columnId))
      },
      enableSorting: true,
    },
    {
      accessorKey: "tool_name",
      header: "Operace",
      size: 140,
      cell: ({ row }) => (
        <Badge variant="secondary">{toolLabel(row.original.tool_name)}</Badge>
      ),
      meta: {
        label: "Operace",
        variant: "multiSelect",
        options: TOOL_OPTIONS,
      },
      enableColumnFilter: true,
      filterFn: (row, columnId, value) => {
        if (!Array.isArray(value) || value.length === 0) return true
        return value.includes(row.getValue(columnId))
      },
      enableSorting: true,
    },
    {
      accessorKey: "summary",
      header: "Popis",
      size: 260,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.summary}</span>
      ),
      meta: { label: "Popis" },
      enableSorting: true,
    },
    {
      accessorKey: "confidence",
      header: "Jistota",
      size: 100,
      cell: ({ row }) =>
        row.original.confidence !== null ? (
          <ConfidenceBadge confidence={row.original.confidence} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      meta: { label: "Jistota" },
      enableSorting: true,
      sortingFn: (a, b) =>
        Number(a.original.confidence ?? 0) - Number(b.original.confidence ?? 0),
    },
    {
      accessorKey: "actor_kind",
      header: "Aktér",
      size: 110,
      cell: ({ row }) => actorLabel(row.original.actor_kind),
      meta: { label: "Aktér" },
      enableSorting: true,
    },
    {
      id: "inspect",
      size: 44,
      minSize: 44,
      maxSize: 44,
      meta: { align: "center" },
      cell: ({ row }) => (
        <InspectCell row={row.original} onInspect={onInspect} />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
  ]
}

/** Read-only inspector detail for a single ingested row (no resolution). */
export function InboxDetail({ row }: { row: InboxListRow }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <DetailField label="Stav" value={<StatusBadge status={row.status} />} />
        <DetailField
          label="Operace"
          value={<Badge variant="secondary">{toolLabel(row.tool_name)}</Badge>}
        />
        <DetailField label="Popis" value={row.summary} />
        <DetailField
          label="Jistota"
          value={
            row.confidence !== null ? (
              <ConfidenceBadge confidence={row.confidence} />
            ) : (
              "—"
            )
          }
        />
        <DetailField label="Aktér" value={actorLabel(row.actor_kind)} />
        <DetailField
          label="Vytvořeno"
          value={
            <span className="tabular-nums">
              {formatCreatedAt(row.created_at)}
            </span>
          }
        />
        <DetailField label="Zdůvodnění" value={row.rationale ?? "—"} />
      </dl>
    </div>
  )
}
