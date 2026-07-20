import type { DocumentCategory } from "./types"

/**
 * Canonical default series shared by provisioning and the Settings UI. `category`
 * is the Dokladové-řady config bucket (document_category) a DOCUMENT série lives
 * under — null for EVENT / ASSET / INVENTORY_COUNT séries, which carry no category.
 * `name` is the Czech Název the Dokladové řady page shows (stored on the row at
 * scaffold; user-editable). `description` is the legacy English label the old
 * Settings → Number series page keys off; it stays for that page's backward map.
 */
export const DEFAULT_NUMBER_SERIES = [
  {
    entityType: "EVENT",
    code: "UC",
    pattern: "UC{YYYY}{NNNNNN}",
    category: null,
    name: "Účetní zápisy",
    description: "Accounting events",
  },
  {
    entityType: "DOCUMENT",
    code: "FV",
    pattern: "FV{YYYY}{NNNN}",
    category: "ISSUED_INVOICE",
    name: "Faktury vydané",
    description: "Issued invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "FP",
    pattern: "FP{YYYY}{NNNN}",
    category: "RECEIVED_INVOICE",
    name: "Faktury přijaté",
    description: "Received invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "PD",
    pattern: "PD{YYYY}{NNNN}",
    category: "CASH",
    name: "Pokladní doklady",
    description: "Cash documents",
  },
  {
    entityType: "DOCUMENT",
    code: "BV",
    pattern: "BV{YYYY}{NNNN}",
    category: "BANK",
    name: "Bankovní výpisy",
    description: "Bank statements",
  },
  {
    entityType: "DOCUMENT",
    code: "ID",
    pattern: "ID{YYYY}{NNNN}",
    category: "INTERNAL",
    name: "Interní doklady",
    description: "Internal documents",
  },
  {
    entityType: "ASSET",
    code: "MAJ",
    pattern: "MAJ{YYYY}{NNNN}",
    category: null,
    name: "Majetek",
    description: "Assets",
  },
  {
    entityType: "INVENTORY_COUNT",
    code: "INV",
    pattern: "INV{YYYY}{NNNN}",
    category: null,
    name: "Inventury",
    description: "Inventory counts",
  },
] as const satisfies readonly {
  entityType: "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT"
  code: string
  pattern: string
  category: DocumentCategory | null
  name: string
  description: string
}[]

export const DEFAULT_NUMBER_SERIES_CODES = DEFAULT_NUMBER_SERIES.map(
  (series) => series.code,
).join(", ")

/**
 * The config category a canonical default série carries, by (entityType, code) —
 * so a série created through a code-only path (the onboarding recovery endpoint,
 * which seeds the canonical defaults) is bucketed like the coupled scaffold does.
 * Returns null for a non-default or custom code (categorized later in the editor).
 */
export function defaultSeriesCategory(
  entityType: string,
  code: string,
): DocumentCategory | null {
  return (
    DEFAULT_NUMBER_SERIES.find(
      (s) => s.entityType === entityType && s.code === code,
    )?.category ?? null
  )
}
