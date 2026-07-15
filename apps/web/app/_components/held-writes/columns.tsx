"use client"

import * as React from "react"
import type { ColumnDef, Row } from "@tanstack/react-table"

import { DetailField } from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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

/** The `resolveHeldWrite` server-action signature — injectable for previews/tests. */
export type ResolveHeldWriteFn = typeof resolveHeldWrite
import type { HeldWriteEdit } from "./edit-model"
import {
  draftFromRow,
  draftToEdit,
  HeldWriteEditFields,
  type AccountOption,
  type HeldWriteEditDraft,
} from "./edit-panel"
import type {
  HeldWriteHeader,
  HeldWritePostingLineRow,
  HeldWriteVatSummaryRow,
  MddPreview,
} from "./view-model"

export type { AccountOption } from "./edit-panel"

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
  /** [M1.3] MD/D posting preview — null when this tool/kind has none (events, monetary postings, unclassifiable captures). */
  mdd_preview: MddPreview | null
  /** Human-readable reasons the gate HELD this write. */
  hold_reasons: string[]
  /** [M1.7] Double-entry posting lines (accountId/side/amount) — empty unless kind "double". */
  posting_lines: HeldWritePostingLineRow[]
  /** [M1.7] "double" / "monetary" for a posting, else null. */
  posting_kind: "double" | "monetary" | null
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

/** Per-row select checkbox — drives the bulk-approve ActionBar. */
function SelectCell({ row }: { row: Row<HeldWriteListRow> }) {
  return (
    <Checkbox
      aria-label={`Vybrat ${row.original.header.documentNumber ?? row.original.header.counterpartyName ?? row.original.id}`}
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
    />
  )
}

/** Review status of a queued write — every row here is held awaiting approval. */
function StatusBadge({ row }: { row: HeldWriteListRow }) {
  return (
    <Badge variant="secondary" className="gap-1">
      {row.hold_reasons.length > 0
        ? `Zadrženo (${row.hold_reasons.length})`
        : "Zadrženo"}
    </Badge>
  )
}

/** The counterparty (protistrana), falling back to the účetní-případ description. */
function counterpartyText(header: HeldWriteHeader): string {
  return header.counterpartyName ?? header.caseDescription ?? "—"
}

/**
 * TanStack column defs for the held-writes review queue — business-facing:
 * a select box (feeding the bulk-approve ActionBar), the counterparty, amount,
 * confidence, doklad number, event date, when it was added, and its status.
 * The internal Operace / Popis / Aktér / Klíč columns were dropped; the full
 * detail (MD/D, VAT, rationale, key) lives in the Inspector.
 */
export function buildHeldWriteColumns({
  onInspect,
}: {
  onInspect: (row: HeldWriteListRow) => void
}): ColumnDef<HeldWriteListRow>[] {
  return [
    {
      id: "select",
      size: 36,
      minSize: 36,
      maxSize: 36,
      meta: { align: "center" },
      header: ({ table }) => (
        <Checkbox
          aria-label="Vybrat vše"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => <SelectCell row={row} />,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
    {
      id: "counterparty",
      header: "Protistrana",
      size: 240,
      accessorFn: (row) => counterpartyText(row.header),
      cell: ({ row }) => (
        <span
          className="block truncate font-medium"
          title={counterpartyText(row.original.header)}
        >
          {counterpartyText(row.original.header)}
        </span>
      ),
      meta: { label: "Protistrana" },
      enableSorting: true,
    },
    {
      id: "amount",
      header: "Částka",
      size: 130,
      meta: { label: "Částka", align: "end" },
      accessorFn: (row) =>
        row.header.totalAmount ? Number(row.header.totalAmount) : 0,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">
          {row.original.header.totalAmount
            ? formatCaseAmount(
                row.original.header.totalAmount,
                row.original.header.currency,
              )
            : "—"}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "confidence",
      header: "Jistota",
      size: 96,
      cell: ({ row }) => (
        <ConfidenceBadge confidence={row.original.confidence} />
      ),
      meta: { label: "Jistota" },
      enableSorting: true,
      sortingFn: (a, b) =>
        Number(a.original.confidence) - Number(b.original.confidence),
    },
    {
      id: "document_number",
      header: "Číslo dokladu",
      size: 130,
      accessorFn: (row) => row.header.documentNumber ?? "",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.header.documentNumber ?? "—"}
        </span>
      ),
      meta: { label: "Číslo dokladu" },
      enableSorting: true,
    },
    {
      id: "event_date",
      header: "Datum",
      size: 120,
      accessorFn: (row) => row.header.date ?? "",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.header.date
            ? formatDate(row.original.header.date)
            : "—"}
        </span>
      ),
      meta: { label: "Datum" },
      enableSorting: true,
    },
    {
      accessorKey: "created_at",
      header: "Přidáno",
      size: 150,
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">
          {formatCreatedAt(row.original.created_at)}
        </span>
      ),
      meta: { label: "Přidáno" },
      enableSorting: true,
    },
    {
      id: "status",
      header: "Stav",
      size: 130,
      cell: ({ row }) => <StatusBadge row={row.original} />,
      meta: { label: "Stav" },
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

/**
 * Approve / reject controls — call the `resolveHeldWrite` server action.
 * [M1.7] `edit` (present only while the reviewer has the edit form open) is
 * sent ONLY on approve — a reject never carries an edit, there is nothing to
 * apply.
 */
function HeldWriteResolveActions({
  orgSlug,
  id,
  edit,
  onResolved,
  resolveAction = resolveHeldWrite,
}: {
  orgSlug: string
  id: string
  edit?: HeldWriteEdit
  onResolved: () => void
  /** Injectable for previews/tests; defaults to the real server action. */
  resolveAction?: ResolveHeldWriteFn
}) {
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()

  const resolve = (action: "approve" | "reject") => {
    setError(null)
    startTransition(async () => {
      const result = await resolveAction({
        orgSlug,
        id,
        action,
        note: note.trim() || undefined,
        edit: action === "approve" ? edit : undefined,
      })
      if (result.ok) {
        onResolved()
      } else {
        setError(result.error ?? "Operace se nezdařila.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
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
          {isPending
            ? "Zpracovává se…"
            : edit
              ? "Schválit upravenou verzi"
              : "Schválit a zaúčtovat"}
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
      <DetailField
        label="Protistrana"
        value={header.counterpartyName ?? header.caseDescription ?? "—"}
      />
      {(header.counterpartyIco || header.counterpartyDic) && (
        <DetailField
          label="IČO / DIČ"
          value={
            <span className="tabular-nums">
              {[header.counterpartyIco, header.counterpartyDic]
                .filter(Boolean)
                .join(" / ")}
            </span>
          }
        />
      )}
      <DetailField
        label="Číslo dokladu"
        value={
          header.documentNumber ? (
            <span className="font-medium tabular-nums">
              {header.documentNumber}
            </span>
          ) : (
            "— (přiděleno až po schválení)"
          )
        }
      />
      <DetailField
        label="Účetní případ"
        value={
          header.caseDesignation ? (
            <span className="tabular-nums">{header.caseDesignation}</span>
          ) : (
            "—"
          )
        }
      />
      <DetailField
        label="Datum"
        value={header.date ? formatDate(header.date) : "—"}
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

/**
 * [M1.3] MD/D posting preview — "see how it booked MD/D" before approving.
 * Renders the předkontace scenario label (when re-derived from a raw
 * capture), the account/side/amount/label lines, the Σ(MD)=Σ(Dal) balance
 * check, and any non-blocking caveats about what the preview does NOT model
 * (see `buildMddPreview` in `view-model.ts`). Null `mddPreview` renders
 * nothing — an event, a monetary/cash posting, and an unclassifiable capture
 * have no MD/D to preview.
 */
function MddPreviewPanel({
  preview,
  currency,
}: {
  preview: MddPreview | null
  currency: string | null
}) {
  if (!preview || preview.lines.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Náhled MD/D
        {preview.scenarioLabel ? ` — ${preview.scenarioLabel}` : null}
      </span>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground">Účet</TableHead>
            <TableHead className="text-muted-foreground">MD/D</TableHead>
            <TableHead className="text-right text-muted-foreground">
              Částka
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.lines.map((line, i) => (
            <TableRow
              key={`${line.account}-${i}`}
              className="hover:bg-transparent"
            >
              <TableCell>
                {line.account}
                {line.label ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {line.label}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{line.side === "DEBIT" ? "MD" : "Dal"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCaseAmount(line.amount, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between text-xs">
        <span
          className={
            preview.balanced ? "text-muted-foreground" : "text-destructive"
          }
        >
          {preview.balanced
            ? "Vyrovnáno (Σ MD = Σ Dal)"
            : "Nevyrovnáno — zkontrolujte prosím"}
        </span>
        <span className="text-muted-foreground tabular-nums">
          MD {formatCaseAmount(preview.totalDebit, currency)} / Dal{" "}
          {formatCaseAmount(preview.totalCredit, currency)}
        </span>
      </div>
      {preview.caveats.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {preview.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      ) : null}
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
 * Renders the document header, per-rate VAT summary, an MD/D posting preview,
 * why-held reasons, and the rationale — no raw JSON. `caseWrites` are sibling
 * held writes sharing this write's `conversationId` (the účetní případ),
 * rendered together so a reviewer sees the whole case, not just one isolated
 * write.
 *
 * [M1.7] "Upravit" toggles an edit form over the header/VAT/MD-D display
 * (`edit-panel.tsx`); approving while it's open sends the edited payload
 * through the SAME `resolveHeldWrite` approve path (see
 * `HeldWriteResolveActions`). `accounts` feeds the posting-line account
 * picker (a `createAccountingPosting`'s `accountId` is a raw uuid).
 *
 * `HeldWritesBody` renders this with `key={row.id}` so the draft/editing
 * state below is freshly initialized whenever a DIFFERENT write is
 * inspected — no reset effect needed.
 */
/**
 * Inspector BODY for a single held write — the scrolling detail (identity,
 * header, VAT, MD/D preview, hold reasons, case siblings), OR the edit form
 * when the reviewer opened it. The resolve controls + the "Upravit" toggle live
 * in {@link HeldWriteDetailFooter}, pinned below this scroll region via the
 * `ContentPanel` `inspectorFooter` slot. `editing` / `draft` are lifted to
 * `HeldWritesBody` so both this body and the footer share one edit state.
 */
export function HeldWriteDetailBody({
  row,
  caseWrites,
  accounts,
  editing,
  draft,
  onDraftChange,
}: {
  row: HeldWriteListRow
  caseWrites: HeldWriteListRow[]
  accounts: AccountOption[]
  editing: boolean
  draft: HeldWriteEditDraft
  onDraftChange: (draft: HeldWriteEditDraft) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <HeldWriteEditFields
          toolName={row.tool_name}
          draft={draft}
          onDraftChange={onDraftChange}
          accounts={accounts}
        />
      ) : (
        <>
          <HeldWriteHeaderCard header={row.header} />
          <VatSummaryTable
            rows={row.vat_summary}
            currency={row.header.currency}
          />
          <MddPreviewPanel
            preview={row.mdd_preview}
            currency={row.header.currency}
          />
          <dl className="flex flex-col gap-3">
            <DetailField
              label="Operace"
              value={
                <Badge variant="secondary">{toolLabel(row.tool_name)}</Badge>
              }
            />
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
            <DetailField label="Zdůvodnění" value={row.rationale ?? "—"} />
            <DetailField
              label="Klíč"
              value={
                <span className="font-mono text-xs break-all">
                  {row.idempotency_key}
                </span>
              }
            />
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
        </>
      )}
      <HoldReasonsList reasons={row.hold_reasons} />
      <CaseSiblingsList writes={caseWrites} />
    </div>
  )
}

/**
 * Inspector FOOTER — the pinned action strip: the "Upravit" edit toggle plus
 * the approve/reject controls (with the optional note). Rendered via the
 * `ContentPanel` `inspectorFooter` slot so it stays put while
 * {@link HeldWriteDetailBody} scrolls. `editing` / `draft` come from the shared
 * state in `HeldWritesBody`; approving while `editing` sends the edited payload.
 */
export function HeldWriteDetailFooter({
  row,
  orgSlug,
  editing,
  onToggleEdit,
  draft,
  onResolved,
  resolveAction,
}: {
  row: HeldWriteListRow
  orgSlug: string
  editing: boolean
  onToggleEdit: () => void
  draft: HeldWriteEditDraft
  onResolved: () => void
  /** Injectable for previews/tests; defaults to the real server action. */
  resolveAction?: ResolveHeldWriteFn
}) {
  const icons = useIcons()
  const EditIcon = icons.Pencil
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onToggleEdit}
      >
        <EditIcon />
        {editing ? "Zrušit úpravu" : "Upravit"}
      </Button>
      <HeldWriteResolveActions
        orgSlug={orgSlug}
        id={row.id}
        edit={editing ? draftToEdit(draft, row.tool_name) : undefined}
        onResolved={onResolved}
        resolveAction={resolveAction}
      />
    </div>
  )
}
