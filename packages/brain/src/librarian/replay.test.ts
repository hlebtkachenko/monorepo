import { describe, expect, it } from "vitest"

import type { CorrectionEdit } from "./correction"
import { applyCorrectionEditReplay } from "./replay"

// Fidelity tests for the faithful per-tool replay (mirrors apps/web edit-model.ts applyHeldWriteEdit).
// Each asserts the edit lands in the SAME place the real booking replay would put it — never a
// top-level `postingLines` / `vatAmounts` array (the diverging shallow-merge shape).

describe("applyCorrectionEditReplay — createAccountingEvent", () => {
  it("replays the header date onto occurredAt and ignores everything else", () => {
    const input = { occurredAt: "2025-01-01", counterpartyKey: "CZ1" }
    const edit: CorrectionEdit = {
      header: { date: "2025-03-15" },
      vatAmounts: [{ rateLabel: "21 %", base: "1", vat: "1" }],
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "1" }],
    }
    expect(
      applyCorrectionEditReplay("createAccountingEvent", input, edit),
    ).toEqual({
      occurredAt: "2025-03-15",
      counterpartyKey: "CZ1",
    })
  })

  it("passes input through unchanged when there is no header date", () => {
    const input = { occurredAt: "2025-01-01" }
    expect(applyCorrectionEditReplay("createAccountingEvent", input, {})).toBe(
      input,
    )
  })
})

describe("applyCorrectionEditReplay — captureAccountingDocument", () => {
  it("folds an edited per-rate VAT amount onto the single matching partial + sets issuedAt", () => {
    const input = {
      issuedAt: "2025-01-01",
      lines: [
        {
          partials: [
            {
              vatRate: "21",
              vatMode: "STANDARD",
              baseAmount: "1000.00",
              vatAmount: "210.00",
              currencyCode: "CZK",
            },
          ],
        },
      ],
    }
    const edit: CorrectionEdit = {
      header: { date: "2025-03-15" },
      vatAmounts: [{ rateLabel: "21 %", base: "1100.00", vat: "231.00" }],
    }
    const result = applyCorrectionEditReplay(
      "captureAccountingDocument",
      input,
      edit,
    )
    expect(result).toEqual({
      issuedAt: "2025-03-15",
      lines: [
        {
          partials: [
            {
              vatRate: "21",
              vatMode: "STANDARD",
              baseAmount: "1100.00", // rewritten
              vatAmount: "231.00", // rewritten
              currencyCode: "CZK", // preserved untouched
            },
          ],
        },
      ],
    })
    // Never a top-level VAT array.
    expect(result).not.toHaveProperty("vatAmounts")
    // Original input is not mutated.
    expect(
      (input.lines[0]!.partials[0] as { baseAmount: string }).baseAmount,
    ).toBe("1000.00")
  })

  it("leaves an AMBIGUOUS rate group (2+ partials same label) untouched — no unsafe redistribution", () => {
    const input = {
      lines: [
        {
          partials: [
            {
              vatRate: "21",
              vatMode: "STANDARD",
              baseAmount: "600.00",
              vatAmount: "126.00",
            },
            {
              vatRate: "21",
              vatMode: "STANDARD",
              baseAmount: "400.00",
              vatAmount: "84.00",
            },
          ],
        },
      ],
    }
    const edit: CorrectionEdit = {
      vatAmounts: [{ rateLabel: "21 %", base: "9999.00", vat: "9999.00" }],
    }
    const result = applyCorrectionEditReplay(
      "captureAccountingDocument",
      input,
      edit,
    ) as typeof input
    expect(result.lines[0]!.partials).toEqual(input.lines[0]!.partials)
  })
})

describe("applyCorrectionEditReplay — createAccountingPosting", () => {
  it("replays double-entry line edits POSITIONALLY onto entry.lines (kind double)", () => {
    const input = {
      kind: "double",
      entry: {
        postingDate: "2025-01-01",
        lines: [
          { accountId: "999", side: "DEBIT", amount: "500.00" },
          { accountId: "321", side: "CREDIT", amount: "500.00" },
        ],
      },
    }
    const edit: CorrectionEdit = {
      header: { date: "2025-03-15" },
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "500.00" }],
    }
    expect(
      applyCorrectionEditReplay("createAccountingPosting", input, edit),
    ).toEqual({
      kind: "double",
      entry: {
        postingDate: "2025-03-15",
        lines: [
          { accountId: "504", side: "DEBIT", amount: "500.00" }, // index 0 edited
          { accountId: "321", side: "CREDIT", amount: "500.00" }, // index 1 untouched (no edit)
        ],
      },
    })
  })

  it("ignores posting-line edits for a NON-double posting (monetary has no accountId/side lines)", () => {
    const input = {
      kind: "monetary",
      entry: { lines: [{ amount: "500.00" }] },
    }
    const edit: CorrectionEdit = {
      postingLines: [{ accountId: "504", side: "DEBIT", amount: "500.00" }],
    }
    expect(
      applyCorrectionEditReplay("createAccountingPosting", input, edit),
    ).toEqual({
      kind: "monetary",
      entry: { lines: [{ amount: "500.00" }] },
    })
  })
})

describe("applyCorrectionEditReplay — unknown tool", () => {
  it("passes the input through unchanged (defensive default, matches the real replay)", () => {
    const input = { anything: true }
    expect(applyCorrectionEditReplay("someOtherTool", input, {})).toBe(input)
  })
})
