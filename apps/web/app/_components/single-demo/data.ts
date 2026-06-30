import type { IconName } from "@workspace/ui/icon-packs"

import type { LineRow } from "./line-items"

/**
 * Mock single-record data for the #425 demo. The record is shown as an ABRA-style
 * workspace: section tabs in the content header, a dense form per section, an
 * editable-style line-items grid, and a document preview. The record's title /
 * status / actions live in the content header.
 */
export type SingleView =
  | "header"
  | "accounting"
  | "other"
  | "payment"
  | "attachments"

export const SINGLE_TABS: { value: SingleView; label: string }[] = [
  { value: "header", label: "Header" },
  { value: "accounting", label: "Accounting" },
  { value: "other", label: "Other" },
  { value: "payment", label: "Payment" },
  { value: "attachments", label: "Attachments" },
]

/** cs-CZ number with plain-space thousands separators (no narrow no-break). */
export const formatNum = (n: number) =>
  n.toLocaleString("cs-CZ").replace(/[\u00a0\u202f]/g, " ")

export interface LedgerTotals {
  base: number
  vat: number
  total: number
}

/** Sum a set of lines into base / VAT / total — the recap + preview share this. */
export const ledgerTotals = (lines: LineRow[]): LedgerTotals => ({
  base: lines.reduce((s, l) => s + l.base, 0),
  vat: lines.reduce((s, l) => s + (l.total - l.base), 0),
  total: lines.reduce((s, l) => s + l.total, 0),
})

export const LINE_ITEMS: LineRow[] = [
  {
    id: "l1",
    code: "ARABICA",
    warehouse: "MAIN",
    name: "Arabica 100%",
    qty: 2,
    unit: "kg",
    unitPrice: 300,
    base: 600,
    vatRate: 21,
    total: 726,
  },
  {
    id: "l2",
    code: "BAILEYS",
    warehouse: "MAIN",
    name: "Baileys coffee",
    qty: 3,
    unit: "kg",
    unitPrice: 300,
    base: 900,
    vatRate: 21,
    total: 1089,
  },
  {
    id: "l3",
    code: "MILK",
    warehouse: "COLD",
    name: "Milk 1.5%",
    qty: 10,
    unit: "l",
    unitPrice: 25,
    base: 250,
    vatRate: 12,
    total: 280,
  },
  {
    id: "l4",
    code: "CUP",
    warehouse: "MAIN",
    name: "Paper cup 0.3l",
    qty: 50,
    unit: "pc",
    unitPrice: 8,
    base: 400,
    vatRate: 21,
    total: 484,
  },
]

export interface AttachmentItem {
  id: string
  name: string
  size: string
  icon: IconName
}

export const ATTACHMENTS: AttachmentItem[] = [
  {
    id: "f1",
    name: "invoice-FV-2026-0001.pdf",
    size: "182 KB",
    icon: "FileText",
  },
  { id: "f2", name: "delivery-note.pdf", size: "94 KB", icon: "FileText" },
]
