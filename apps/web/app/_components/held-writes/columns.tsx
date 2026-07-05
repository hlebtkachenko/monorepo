"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DetailField } from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { useIcons } from "@workspace/ui/icon-packs"

import { resolveHeldWrite } from "../../[orgSlug]/accounting/approvals/actions"

/**
 * Held gated write as prepared by the approvals page from `fetchHeldWrites`
 * rows. Declared locally so these client components never import the
 * `server-only` data module. Everything is a plain serializable string —
 * `confidence` stays the decimal string ("0.6300"), `payload_json` is the
 * original request payload pre-printed as JSON on the server.
 */
export interface HeldWriteListRow {
  id: string
  tool_name: string
  idempotency_key: string
  actor_kind: string
  confidence: string
  rationale: string | null
  /** Trimmed to "YYYY-MM-DD HH:MM" on the server. */
  created_at: string
  /** Human summary derived from the payload on the server. */
  summary: string
  /** Pretty-printed JSON of the original gated payload. */
  payload_json: string
}

const TOOL_LABELS: Record<string, string> = {
  createAccountingEvent: "Účetní případ",
  captureAccountingDocument: "Doklad",
  createAccountingPosting: "Zápis",
}

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool
}

export const TOOL_OPTIONS = Object.entries(TOOL_LABELS).map(
  ([value, label]) => ({ label, value }),
)

const ACTOR_LABELS: Record<string, string> = {
  agent: "Agent",
  user: "Uživatel",
  api_key: "API klíč",
}

export function actorLabel(actor: string): string {
  return ACTOR_LABELS[actor] ?? actor
}

/** "YYYY-MM-DD HH:MM" → "D. M. YYYY HH:MM" (display only, no Date parsing). */
export function formatCreatedAt(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(value)
  if (!match) return value
  const [, year, month, day, time] = match
  return `${Number(day)}. ${Number(month)}. ${year} ${time}`
}

/** Confidence decimal string ("0.6300") → integer percent (display only). */
function confidencePercent(confidence: string): number {
  const n = Number(confidence)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Badge tinted by the gate outcome band: below 70 % reads as risky. */
export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const percent = confidencePercent(confidence)
  return (
    <Badge
      variant="secondary"
      className={
        percent < 70
          ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
          : undefined
      }
    >
      {percent} %
    </Badge>
  )
}

/** Row affordance opening the Inspector for this held write. */
function InspectCell({
  row,
  onInspect,
}: {
  row: HeldWriteListRow
  onInspect: (row: HeldWriteListRow) => void
}) {
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Detail for ${row.idempotency_key}`}
      onClick={() => onInspect(row)}
    >
      <Icon />
    </Button>
  )
}

/** TanStack column defs for the held-writes review queue. */
export function buildHeldWriteColumns({
  onInspect,
}: {
  onInspect: (row: HeldWriteListRow) => void
}): ColumnDef<HeldWriteListRow>[] {
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
      cell: ({ row }) => (
        <ConfidenceBadge confidence={row.original.confidence} />
      ),
      meta: { label: "Jistota" },
      enableSorting: true,
      sortingFn: (a, b) =>
        Number(a.original.confidence) - Number(b.original.confidence),
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
      accessorKey: "idempotency_key",
      header: "Klíč",
      size: 160,
      cell: ({ row }) => (
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {row.original.idempotency_key}
        </span>
      ),
      meta: { label: "Klíč" },
      enableSorting: false,
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

/** Approve / reject controls — call the `resolveHeldWrite` server action. */
function HeldWriteResolveActions({
  orgSlug,
  id,
  onResolved,
}: {
  orgSlug: string
  id: string
  onResolved: () => void
}) {
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()

  const resolve = (action: "approve" | "reject") => {
    setError(null)
    startTransition(async () => {
      const result = await resolveHeldWrite({
        orgSlug,
        id,
        action,
        note: note.trim() || undefined,
      })
      if (result.ok) {
        onResolved()
      } else {
        setError(result.error ?? "Operace se nezdařila.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Textarea
        placeholder="Poznámka (nepovinná)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        className="min-h-0 text-xs"
        disabled={isPending}
        aria-label="Poznámka"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => resolve("approve")}
        >
          {isPending ? "Zpracovává se…" : "Schválit a zaúčtovat"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => resolve("reject")}
        >
          Zamítnout
        </Button>
      </div>
    </div>
  )
}

/** Inspector detail for a single held write, with approve/reject resolution. */
export function HeldWriteDetail({
  row,
  orgSlug,
  onResolved,
}: {
  row: HeldWriteListRow
  orgSlug: string
  onResolved: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <DetailField
          label="Operace"
          value={<Badge variant="secondary">{toolLabel(row.tool_name)}</Badge>}
        />
        <DetailField label="Popis" value={row.summary} />
        <DetailField
          label="Jistota"
          value={<ConfidenceBadge confidence={row.confidence} />}
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
        <DetailField
          label="Klíč"
          value={
            <span className="font-mono text-xs break-all">
              {row.idempotency_key}
            </span>
          }
        />
        <DetailField label="Zdůvodnění" value={row.rationale ?? "—"} />
      </dl>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Původní požadavek
        </span>
        <pre className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
          {row.payload_json}
        </pre>
      </div>
      <HeldWriteResolveActions
        orgSlug={orgSlug}
        id={row.id}
        onResolved={onResolved}
      />
    </div>
  )
}
