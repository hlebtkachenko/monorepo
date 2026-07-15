"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { DetailField } from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import {
  decimalToNumber,
  formatAmount,
  formatDate,
  formatDecimal,
} from "../_shared/accounting-format"
import { buildSourceColumn } from "../_shared/source-column"

/**
 * Captured-document row as served by `fetchDocuments` in
 * `[orgSlug]/_lib/accounting-data.ts` (summary_record + per-document totals).
 * Declared locally so these client components never import the `server-only`
 * data module; money is a decimal STRING.
 */
export interface DocumentRow {
  id: string
  designation: string
  type: string
  issued_at: string
  base_total: string
  vat_total: string
  counterparty_name: string | null
  /**
   * [Tier 4] The inbox_item this document landed from. Non-null ⇒ the Afframe
   * Brain proposed it (a human approved) — drives the "Created by Agent" filter.
   * Null ⇒ entered by a human.
   */
  inbox_id?: string | null
}

/** Provenance bucket for the "Zdroj" (source) filter. */
function documentSource(row: DocumentRow): "agent" | "human" {
  return row.inbox_id ? "agent" : "human"
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  RECEIVED_INVOICE: "Faktura přijatá",
  ISSUED_INVOICE: "Faktura vydaná",
  BANK_STATEMENT: "Bankovní výpis",
  CASH_DOCUMENT: "Pokladní doklad",
  INTERNAL: "Interní doklad",
  BATCH: "Dávka",
}

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type
}

export const DOCUMENT_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(
  ([value, label]) => ({ label, value }),
)

/** Display-only total (Základ + DPH) — never round-trips into a posting. */
export function documentTotal(row: DocumentRow): number {
  return decimalToNumber(row.base_total) + decimalToNumber(row.vat_total)
}

/** Row affordance opening the Inspector for this document. */
function InspectCell({
  row,
  onInspect,
}: {
  row: DocumentRow
  onInspect: (row: DocumentRow) => void
}) {
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Detail for ${row.designation}`}
      onClick={() => onInspect(row)}
    >
      <Icon />
    </Button>
  )
}

/**
 * TanStack column defs for a captured-documents table. Shared by the Records
 * overview (`withType`) and the per-family pages (received invoices, …) —
 * only the counterparty header and the Typ column differ.
 */
export function buildDocumentColumns({
  counterpartyHeader,
  withType = false,
  onInspect,
}: {
  counterpartyHeader: string
  withType?: boolean
  onInspect: (row: DocumentRow) => void
}): ColumnDef<DocumentRow>[] {
  return [
    {
      id: "select",
      size: 32,
      minSize: 32,
      maxSize: 32,
      meta: { align: "center" },
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          className="border-primary"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.designation}`}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
    {
      accessorKey: "designation",
      header: "Označení",
      size: 160,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.designation}</span>
      ),
      meta: { label: "Označení" },
      enableSorting: true,
    },
    ...(withType
      ? ([
          {
            accessorKey: "type",
            header: "Typ",
            size: 170,
            cell: ({ row }) => (
              <Badge variant="secondary">
                {documentTypeLabel(row.original.type)}
              </Badge>
            ),
            meta: {
              label: "Typ",
              variant: "multiSelect",
              options: DOCUMENT_TYPE_OPTIONS,
            },
            enableColumnFilter: true,
            filterFn: (row, columnId, value) => {
              if (!Array.isArray(value) || value.length === 0) return true
              return value.includes(row.getValue(columnId))
            },
            enableSorting: true,
          },
        ] satisfies ColumnDef<DocumentRow>[])
      : []),
    {
      accessorKey: "issued_at",
      header: "Datum",
      size: 120,
      cell: ({ row }) => formatDate(row.original.issued_at),
      meta: { label: "Datum" },
      enableSorting: true,
    },
    {
      accessorKey: "counterparty_name",
      header: counterpartyHeader,
      size: 200,
      cell: ({ row }) =>
        row.original.counterparty_name ?? (
          <span className="text-muted-foreground">—</span>
        ),
      meta: { label: counterpartyHeader },
      enableSorting: true,
    },
    buildSourceColumn<DocumentRow>(documentSource),
    {
      accessorKey: "base_total",
      header: "Základ",
      size: 140,
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {formatDecimal(row.original.base_total)}
        </div>
      ),
      meta: { label: "Základ" },
      enableSorting: true,
      sortingFn: (a, b) =>
        Number(a.original.base_total) - Number(b.original.base_total),
    },
    {
      accessorKey: "vat_total",
      header: "DPH",
      size: 130,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {formatDecimal(row.original.vat_total)}
        </div>
      ),
      meta: { label: "DPH" },
      enableSorting: true,
      sortingFn: (a, b) =>
        Number(a.original.vat_total) - Number(b.original.vat_total),
    },
    {
      id: "total",
      accessorFn: (row) => documentTotal(row),
      header: "Celkem",
      size: 140,
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {formatAmount(documentTotal(row.original))}
        </div>
      ),
      meta: { label: "Celkem" },
      enableSorting: true,
      sortingFn: (a, b) =>
        documentTotal(a.original) - documentTotal(b.original),
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

/** Inspector detail for a single captured document. */
export function DocumentDetail({
  row,
  counterpartyLabel,
}: {
  row: DocumentRow
  counterpartyLabel: string
}) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Označení" value={row.designation} />
      <DetailField
        label="Typ"
        value={<Badge variant="secondary">{documentTypeLabel(row.type)}</Badge>}
      />
      <DetailField label="Datum" value={formatDate(row.issued_at)} />
      <DetailField
        label={counterpartyLabel}
        value={row.counterparty_name ?? "—"}
      />
      <DetailField
        label="Zdroj"
        value={
          documentSource(row) === "agent" ? (
            <Badge variant="secondary">Vytvořeno agentem</Badge>
          ) : (
            "Ruční"
          )
        }
      />
      <DetailField
        label="Základ"
        value={
          <span className="tabular-nums">{formatDecimal(row.base_total)}</span>
        }
      />
      <DetailField
        label="DPH"
        value={
          <span className="tabular-nums">{formatDecimal(row.vat_total)}</span>
        }
      />
      <DetailField
        label="Celkem"
        value={
          <span className="tabular-nums">
            {formatAmount(documentTotal(row))}
          </span>
        }
      />
    </dl>
  )
}
