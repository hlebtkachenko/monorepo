import { describe, expect, it } from "vitest"

import {
  CaptureAccountingDocumentRequestSchema,
  CreateAccountingEventRequestSchema,
  CreateAccountingPostingRequestSchema,
} from "./accounting-writes"

const doubleEntry = {
  periodId: "00000000-0000-4000-8000-000000000001",
  summaryRecordId: "00000000-0000-4000-8000-000000000002",
  accountingEventId: "00000000-0000-4000-8000-000000000003",
  postingDate: "2026-03-14",
  lines: [
    {
      accountId: "00000000-0000-4000-8000-000000000010",
      side: "DEBIT",
      amount: "1000.00",
    },
    {
      accountId: "00000000-0000-4000-8000-000000000011",
      side: "CREDIT",
      amount: "1000.00",
    },
  ],
}

describe("createAccountingPosting openObligation directive", () => {
  it("accepts a double-entry posting with an openObligation directive", () => {
    const parsed = CreateAccountingPostingRequestSchema.safeParse({
      kind: "double",
      entry: doubleEntry,
      openObligation: { saldoAccountNumber: "321", direction: "PAYABLE" },
      confidence: 1,
      rationale: "Contract obligation",
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an openObligation directive on a monetary posting", () => {
    const parsed = CreateAccountingPostingRequestSchema.safeParse({
      kind: "monetary",
      entry: {
        periodId: "00000000-0000-4000-8000-000000000001",
        summaryRecordId: "00000000-0000-4000-8000-000000000002",
        accountingEventId: "00000000-0000-4000-8000-000000000003",
        postingDate: "2026-03-14",
        lines: [
          {
            location: "BANK",
            direction: "INFLOW",
            isTaxRelevant: true,
            amount: "1000.00",
          },
        ],
      },
      openObligation: { saldoAccountNumber: "311", direction: "RECEIVABLE" },
      confidence: 1,
      rationale: "Invalid on monetary",
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path)).toContainEqual([
        "openObligation",
      ])
    }
  })
})

describe("accounting legal-date schemas", () => {
  it("rejects calendar-invalid legal dates before they reach PostgreSQL", () => {
    const event = CreateAccountingEventRequestSchema.safeParse({
      periodId: "00000000-0000-4000-8000-000000000001",
      seriesId: "00000000-0000-4000-8000-000000000002",
      description: "Invalid date",
      occurredAt: "2026-02-28T12:00:00Z",
      occurredOn: "2026-02-30",
      confidence: 1,
      rationale: "Schema boundary test",
    })

    expect(event.success).toBe(false)
    if (!event.success) {
      expect(event.error.issues.map((issue) => issue.path)).toContainEqual([
        "occurredOn",
      ])
    }
  })

  it("rejects received-document dates on issued invoices", () => {
    const document = CaptureAccountingDocumentRequestSchema.safeParse({
      periodId: "00000000-0000-4000-8000-000000000001",
      seriesId: "00000000-0000-4000-8000-000000000002",
      type: "ISSUED_INVOICE",
      issuedAt: "2026-03-14T12:00:00Z",
      receivedDate: "2026-03-14",
      lines: [],
      confidence: 1,
      rationale: "Schema boundary test",
    })

    expect(document.success).toBe(false)
    if (!document.success) {
      expect(document.error.issues.map((issue) => issue.path)).toContainEqual([
        "receivedDate",
      ])
    }
  })

  it("rejects tax-point dates on non-invoice documents", () => {
    const document = CaptureAccountingDocumentRequestSchema.safeParse({
      periodId: "00000000-0000-4000-8000-000000000001",
      seriesId: "00000000-0000-4000-8000-000000000002",
      type: "BANK_STATEMENT",
      issuedAt: "2026-03-14T12:00:00Z",
      taxPointDate: "2026-03-14",
      lines: [],
      confidence: 1,
      rationale: "Schema boundary test",
    })

    expect(document.success).toBe(false)
    if (!document.success) {
      expect(document.error.issues.map((issue) => issue.path)).toContainEqual([
        "taxPointDate",
      ])
    }
  })
})
