"use client"

import { DocumentsTable } from "./documents-table"
import type { DocumentRow } from "./columns"

/** Faktury přijaté body — received invoices only; rows come from the page. */
export function DocumentsReceivedBody({ rows }: { rows: DocumentRow[] }) {
  return (
    <DocumentsTable
      rows={rows}
      counterpartyHeader="Dodavatel"
      searchPlaceholder="Search faktury přijaté…"
    />
  )
}
