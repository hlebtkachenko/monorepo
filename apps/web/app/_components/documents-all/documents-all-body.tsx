"use client"

import { DocumentsTable } from "../documents-received/documents-table"
import type { DocumentRow } from "../documents-received/columns"

/** Records overview body — ALL captured documents, with a Typ column + filter. */
export function DocumentsAllBody({ rows }: { rows: DocumentRow[] }) {
  return (
    <DocumentsTable
      rows={rows}
      counterpartyHeader="Protistrana"
      withType
      searchPlaceholder="Search records…"
    />
  )
}
