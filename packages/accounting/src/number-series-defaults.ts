/** Canonical default series shared by provisioning and the Settings UI. */
export const DEFAULT_NUMBER_SERIES = [
  {
    entityType: "EVENT",
    code: "UC",
    pattern: "UC{YYYY}{NNNNNN}",
    description: "Accounting events",
  },
  {
    entityType: "DOCUMENT",
    code: "FV",
    pattern: "FV{YYYY}{NNNN}",
    description: "Issued invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "FP",
    pattern: "FP{YYYY}{NNNN}",
    description: "Received invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "PD",
    pattern: "PD{YYYY}{NNNN}",
    description: "Cash documents",
  },
  {
    entityType: "DOCUMENT",
    code: "BV",
    pattern: "BV{YYYY}{NNNN}",
    description: "Bank statements",
  },
  {
    entityType: "DOCUMENT",
    code: "ID",
    pattern: "ID{YYYY}{NNNN}",
    description: "Internal documents",
  },
  {
    entityType: "ASSET",
    code: "MAJ",
    pattern: "MAJ{YYYY}{NNNN}",
    description: "Assets",
  },
  {
    entityType: "INVENTORY_COUNT",
    code: "INV",
    pattern: "INV{YYYY}{NNNN}",
    description: "Inventory counts",
  },
] as const

export const DEFAULT_NUMBER_SERIES_CODES = DEFAULT_NUMBER_SERIES.map(
  (series) => series.code,
).join(", ")
