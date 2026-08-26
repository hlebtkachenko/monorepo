import type { BetaDocumentStatus, BetaDocumentType } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Enum value → message key, for the client-facing Dokumenty surface.
 *
 * A SEPARATE MAP FROM `app/admin/_components/labels.ts`, for the reason set out
 * in `lib/role-labels.ts`: `admin.*` is the office's namespace and this is the
 * client's. Same Czech words today, different audiences, and a future wording
 * change for one must not silently move the other.
 *
 * `satisfies Record<...>` so an `ALTER TYPE ... ADD VALUE` is a compile error
 * here rather than a blank cell in the table.
 */

export const DOCUMENT_STATUS_LABEL_KEY = {
  received: "dokumenty.statusReceived",
  in_processing: "dokumenty.statusInProcessing",
  processed: "dokumenty.statusProcessed",
  returned: "dokumenty.statusReturned",
} as const satisfies Record<BetaDocumentStatus, BetaMessageKey>

/**
 * Keyed on the FULL document enum, `payslip` included.
 *
 * A payslip row can never reach this table — `documents.ts` excludes it in the
 * WHERE clause of every read — but `DocumentSummary.docType` is still the full
 * union, so narrowing the map to the client subset would only move the problem
 * to a cast at the call site. The label exists and is never rendered; the filter
 * options below are where the exclusion is expressed.
 */
export const DOCUMENT_TYPE_LABEL_KEY = {
  invoice_in: "dokumenty.typeInvoiceIn",
  invoice_out: "dokumenty.typeInvoiceOut",
  receipt: "dokumenty.typeReceipt",
  bank_statement: "dokumenty.typeBankStatement",
  contract: "dokumenty.typeContract",
  payroll: "dokumenty.typePayroll",
  attendance: "dokumenty.typeAttendance",
  hr: "dokumenty.typeHr",
  payslip: "dokumenty.typePayslip",
  other: "dokumenty.typeOther",
} as const satisfies Record<BetaDocumentType, BetaMessageKey>

/**
 * The `Vráceno` chip is the one that has to be noticed — it means the office
 * needs something from the client (spec §2.2: the document "comes back for a
 * fix"). Everything else is progress reporting.
 */
export const DOCUMENT_STATUS_BADGE_VARIANT = {
  received: "outline",
  in_processing: "secondary",
  processed: "secondary",
  returned: "destructive",
} as const satisfies Record<
  BetaDocumentStatus,
  "outline" | "secondary" | "destructive"
>
