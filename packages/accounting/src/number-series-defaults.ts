import type { DocumentCategory } from "./types"

/**
 * Canonical default series shared by provisioning and the Settings UI. `category`
 * is the Dokladové-řady config bucket (document_category) a DOCUMENT série lives
 * under — null for EVENT / ASSET / INVENTORY_COUNT séries, which carry no category.
 * `name` is the Czech Název the Dokladové řady page shows (stored on the row at
 * scaffold; user-editable). `description` is the legacy English label the old
 * Settings → Number series page keys off; it stays for that page's backward map.
 *
 * This is the full default dokladová-řada taxonomy a fresh org is provisioned
 * with — one série per real-world doklad kind an org keeps: faktury (vydané +
 * přijaté), opravné doklady, zálohové faktury, oba pokladní doklady (příjmový +
 * výdajový), bankovní + úvěrový výpis, interní doklady, dotace, uplatnění daně,
 * pohledávkový + závazkový doklad, zápočty — plus the ASSET (majetek / drobný
 * majetek), EVENT (účetní zápisy) and INVENTORY_COUNT infra séries. Only DOCUMENT
 * séries carry a `category` and surface on the Dokladové řady page.
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
    name: "Vydané faktury",
    description: "Issued invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "FP",
    pattern: "FP{YYYY}{NNNN}",
    category: "RECEIVED_INVOICE",
    name: "Přijaté faktury",
    description: "Received invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "ODV",
    pattern: "ODV{YYYY}{NNNN}",
    category: "ISSUED_INVOICE",
    name: "Opravné doklady vydané",
    description: "Issued credit notes",
  },
  {
    entityType: "DOCUMENT",
    code: "ODP",
    pattern: "ODP{YYYY}{NNNN}",
    category: "RECEIVED_INVOICE",
    name: "Opravné doklady přijaté",
    description: "Received credit notes",
  },
  {
    entityType: "DOCUMENT",
    code: "ZFV",
    pattern: "ZFV{YYYY}{NNNN}",
    category: "ISSUED_INVOICE",
    name: "Zálohové faktury vydané",
    description: "Issued advance invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "ZFP",
    pattern: "ZFP{YYYY}{NNNN}",
    category: "RECEIVED_INVOICE",
    name: "Zálohové faktury přijaté",
    description: "Received advance invoices",
  },
  {
    entityType: "DOCUMENT",
    code: "PPD",
    pattern: "PPD{YYYY}{NNNN}",
    category: "CASH",
    name: "Příjmové pokladní doklady",
    description: "Cash receipts",
  },
  {
    entityType: "DOCUMENT",
    code: "VPD",
    pattern: "VPD{YYYY}{NNNN}",
    category: "CASH",
    name: "Výdajové pokladní doklady",
    description: "Cash disbursements",
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
    code: "VUU",
    pattern: "VUU{YYYY}{NNNN}",
    category: "BANK",
    name: "Výpisy z úvěrového účtu",
    description: "Loan account statements",
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
    entityType: "DOCUMENT",
    code: "DOT",
    pattern: "DOT{YYYY}{NNNN}",
    category: "INTERNAL",
    name: "Dotace",
    description: "Subsidies",
  },
  {
    entityType: "DOCUMENT",
    code: "UDZ",
    pattern: "UDZ{YYYY}{NNNN}",
    category: "TAX_APPLICATION",
    name: "Uplatnění daně - závazky",
    description: "Tax application (payables)",
  },
  {
    entityType: "DOCUMENT",
    code: "POH",
    pattern: "POH{YYYY}{NNNN}",
    category: "OTHER_RECEIVABLE",
    name: "Pohledávkové doklady",
    description: "Receivable documents",
  },
  {
    entityType: "DOCUMENT",
    code: "ZAV",
    pattern: "ZAV{YYYY}{NNNN}",
    category: "OTHER_PAYABLE",
    name: "Závazkové doklady",
    description: "Payable documents",
  },
  {
    entityType: "DOCUMENT",
    code: "ZAP",
    pattern: "ZAP{YYYY}{NNNN}",
    category: "SET_OFF",
    name: "Zápočty",
    description: "Set-offs",
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
    entityType: "ASSET",
    code: "DDM",
    pattern: "DDM{YYYY}{NNNN}",
    category: null,
    name: "Drobný majetek",
    description: "Low-value assets",
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
