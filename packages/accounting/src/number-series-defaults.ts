import type { DocumentCategory } from "./types"

/**
 * Canonical default series shared by provisioning and the Settings UI. `category`
 * is the Dokladové-řady config bucket (document_category) a DOCUMENT série lives
 * under — null for EVENT / ASSET / INVENTORY_COUNT séries, which carry no category.
 */
export const DEFAULT_NUMBER_SERIES = [
  {
    entityType: "EVENT",
    code: "UC",
    pattern: "UC{YYYY}{NNNNNN}",
    category: null,
    description: "Accounting events",
  },
  {
    entityType: "DOCUMENT",
    code: "FV",
    pattern: "FV{YYYY}{NNNN}",
    category: "ISSUED_INVOICE",
    description: "Issued invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "FP",
    pattern: "FP{YYYY}{NNNN}",
    category: "RECEIVED_INVOICE",
    description: "Received invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "PD",
    pattern: "PD{YYYY}{NNNN}",
    category: "CASH",
    description: "Cash documents",
  },
  {
    entityType: "DOCUMENT",
    code: "BV",
    pattern: "BV{YYYY}{NNNN}",
    category: "BANK",
    description: "Bank statements",
  },
  {
    entityType: "DOCUMENT",
    code: "ID",
    pattern: "ID{YYYY}{NNNN}",
    category: "INTERNAL",
    description: "Internal documents",
  },
  {
    entityType: "ASSET",
    code: "MAJ",
    pattern: "MAJ{YYYY}{NNNN}",
    category: null,
    description: "Assets",
  },
  {
    entityType: "INVENTORY_COUNT",
    code: "INV",
    pattern: "INV{YYYY}{NNNN}",
    category: null,
    description: "Inventory counts",
  },
] as const satisfies readonly {
  entityType: "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT"
  code: string
  pattern: string
  category: DocumentCategory | null
  description: string
}[]

export const DEFAULT_NUMBER_SERIES_CODES = DEFAULT_NUMBER_SERIES.map(
  (series) => series.code,
).join(", ")
