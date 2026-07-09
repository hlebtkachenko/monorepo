"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DetailField } from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { useIcons } from "@workspace/ui/icon-packs"

import {
  decimalToNumber,
  formatDate,
  formatDecimal,
} from "../_shared/accounting-format"
import { resolveHeldWrite } from "../../[orgSlug]/accounting/approvals/actions"
import type { HeldWriteHeader, HeldWriteVatSummaryRow } from "./view-model"

/**
 * Held gated write as prepared by the approvals page from `fetchHeldWrites`
 * rows (shaped through `buildHeldWriteViewModel`). Declared locally so these
 * client components never import the `server-only` data module. Everything is
 * a plain serializable value — `confidence` stays the decimal string
 * ("0.6300"), amounts inside `header`/`vat_summary` stay decimal strings (the
 * domain money transport — see `_shared/accounting-format.ts`), NEVER a raw
 * JSON payload dump.
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
  /** Audit correlation id — held writes for the same účetní případ share one. */
  conversation_id: string | null
  /** Document header (counterparty, date, total, currency) — shaped server-side. */
  header: HeldWriteHeader
  /** Per-VAT-rate base/VAT rollup — empty when the tool has no VAT lines (events, postings). */
  vat_summary: HeldWriteVatSummaryRow[]
  /** Human-readable reasons the gate HELD this write. */
  hold_reasons: string[]
  /**
   * [WS-2] OCR extraction template this write was derived from (audit
   * `serverGate.templateId`), or null for structured-export writes.
   */
  template_id: string | null
  /** Whether that template has been human-confirmed (only meaningful when `template_id` is set). */
  template_confirmed: boolean
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

/**
 * [WS-2] OCR-template provenance for a held write: which learned template the
 * booking was derived from, and whether a human has confirmed it. Rendered only
 * when the write carries a template (structured-export writes have none). The id
 * is shortened to its first segment — enough for a reviewer to recognise it — and
 * the confirmation state is what a reviewer weighs before approving.
 */
function OcrTemplateBadge({
  templateId,
  confirmed,
}: {
  templateId: string
  confirmed: boolean
}) {
  const short = templateId.split("-")[0] ?? templateId
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-xs">{short}</span>
      <Badge
        variant="secondary"
        className={
          confirmed
            ? undefined
            : "bg-destructive/10 text-destructive dark:bg-destructive/20"
        }
      >
        {confirmed ? "potvrzeno" : "nepotvrzeno"}
      </Badge>
    </span>
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

/** cs-CZ, 2dp, no currency suffix — for a NON-CZK amount, where `formatDecimal`'s hardcoded " Kč" would mislabel it. */
const PLAIN_NUMBER = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a document-currency decimal amount for display. Documents/postings
 * default to CZK (the accounting currency) — `formatDecimal` is the existing,
 * shared formatter for that case. A foreign-currency line (pre-FX-conversion,
 * `currencyCode` on the payload) shows its OWN code instead of a fabricated
 * " Kč" suffix.
 */
function formatCaseAmount(amount: string, currency: string | null): string {
  if (currency && currency !== "CZK") {
    return `${PLAIN_NUMBER.format(decimalToNumber(amount))} ${currency}`
  }
  return formatDecimal(amount)
}

/** The document header — protistrana, date, total — replacing the raw JSON dump. */
function HeldWriteHeaderCard({ header }: { header: HeldWriteHeader }) {
  return (
    <dl className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <DetailField label="Protistrana" value={header.counterpartyName ?? "—"} />
      <DetailField
        label="Datum"
        value={header.date ? formatDate(header.date) : "—"}
      />
      <DetailField
        label="Číslo dokladu"
        value={header.documentNumber ?? "— (přiděleno až po schválení)"}
      />
      <DetailField
        label="Celkem"
        value={
          <span className="tabular-nums">
            {header.totalAmount
              ? formatCaseAmount(header.totalAmount, header.currency)
              : "—"}
          </span>
        }
      />
    </dl>
  )
}

/** Per-VAT-rate base/VAT rollup — empty for tools with no VAT lines (events, postings). */
function VatSummaryTable({
  rows,
  currency,
}: {
  rows: HeldWriteVatSummaryRow[]
  currency: string | null
}) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Rozpis DPH podle sazby
      </span>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground">Sazba</TableHead>
            <TableHead className="text-right text-muted-foreground">
              Základ
            </TableHead>
            <TableHead className="text-right text-muted-foreground">
              DPH
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.rateLabel} className="hover:bg-transparent">
              <TableCell>{r.rateLabel}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCaseAmount(r.base, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCaseAmount(r.vat, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Human-readable reasons the gate HELD this write — from `output_json.serverGate`. */
function HoldReasonsList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Důvod zadržení
      </span>
      <ul className="flex flex-col gap-1 text-sm">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span className="text-destructive" aria-hidden="true">
              •
            </span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Sibling held writes sharing this write's účetní případ (conversationId) — grouped for review. */
function CaseSiblingsList({ writes }: { writes: HeldWriteListRow[] }) {
  if (writes.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Další položky tohoto případu
      </span>
      <ul className="flex flex-col gap-1.5">
        {writes.map((w) => (
          <li key={w.id} className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">{toolLabel(w.tool_name)}</Badge>
            <span className="truncate">{w.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Inspector detail for a single held write, with approve/reject resolution.
 * Renders the document header, per-rate VAT summary, why-held reasons, and
 * the rationale — no raw JSON. `caseWrites` are sibling held writes sharing
 * this write's `conversationId` (the účetní případ), rendered together so a
 * reviewer sees the whole case, not just one isolated write.
 */
export function HeldWriteDetail({
  row,
  caseWrites,
  orgSlug,
  onResolved,
}: {
  row: HeldWriteListRow
  caseWrites: HeldWriteListRow[]
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
        {row.template_id ? (
          <DetailField
            label="OCR šablona"
            value={
              <OcrTemplateBadge
                templateId={row.template_id}
                confirmed={row.template_confirmed}
              />
            }
          />
        ) : null}
      </dl>
      <HeldWriteHeaderCard header={row.header} />
      <VatSummaryTable rows={row.vat_summary} currency={row.header.currency} />
      <HoldReasonsList reasons={row.hold_reasons} />
      <CaseSiblingsList writes={caseWrites} />
      <HeldWriteResolveActions
        orgSlug={orgSlug}
        id={row.id}
        onResolved={onResolved}
      />
    </div>
  )
}
