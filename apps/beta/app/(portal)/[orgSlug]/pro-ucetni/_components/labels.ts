import {
  BETA_CLIENT_DOCUMENT_TYPES,
  type BetaClientDocumentType,
  type BetaDocumentStatus,
  type BetaDocumentType,
} from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Enum value → message key, the org-tier twin of `app/admin/_components/
 * labels.ts`. `satisfies Record<...>` so a new enum member is a compile error
 * here rather than a blank cell in the queue table or the sheet's selects.
 */

export const STATUS_LABEL_KEY = {
  received: "ucetni.statusReceived",
  in_processing: "ucetni.statusInProcessing",
  processed: "ucetni.statusProcessed",
  returned: "ucetni.statusReturned",
} as const satisfies Record<BetaDocumentStatus, BetaMessageKey>

/** Every status the sheet's own select offers, in workflow order. */
export const STATUS_OPTIONS: readonly BetaDocumentStatus[] = [
  "received",
  "in_processing",
  "processed",
  "returned",
]

/**
 * Covers the FULL `BetaDocumentType`, `payslip` included, even though
 * `ownerQueueDocuments` (`lib/data/documents-office.ts`) excludes every
 * payslip row before a `OwnerDocumentDetail` is ever built — `docType` on
 * that projection is typed from the column itself
 * (`DocumentRow["doc_type"]`), not from the narrower client-writable subset,
 * so this map has to be total over the same type or `doc.docType` fails to
 * index it. `DOC_TYPE_OPTIONS` below is the one that actually narrows, for
 * the sheet's own `<select>`.
 */
export const DOC_TYPE_LABEL_KEY = {
  invoice_in: "ucetni.docTypeInvoiceIn",
  invoice_out: "ucetni.docTypeInvoiceOut",
  receipt: "ucetni.docTypeReceipt",
  bank_statement: "ucetni.docTypeBankStatement",
  contract: "ucetni.docTypeContract",
  payroll: "ucetni.docTypePayroll",
  attendance: "ucetni.docTypeAttendance",
  hr: "ucetni.docTypeHr",
  payslip: "ucetni.docTypePayslip",
  other: "ucetni.docTypeOther",
} as const satisfies Record<BetaDocumentType, BetaMessageKey>

/** Reuses the enum's own client-facing subtype — never a second hand list. */
export const DOC_TYPE_OPTIONS: readonly BetaClientDocumentType[] =
  BETA_CLIENT_DOCUMENT_TYPES
