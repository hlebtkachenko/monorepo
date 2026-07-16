/**
 * Unit tests for the [M1.7] edit-before-approve merge (`applyHeldWriteEdit`).
 * Pure data shaping, no DB/React — mirrors `view-model.test.ts`'s fixture
 * style so the two stay in lockstep (an edit must merge back onto EXACTLY
 * the shape the view-model rolled up from).
 */
import { describe, expect, it } from "vitest"

import { applyHeldWriteEdit, HeldWriteEditSchema } from "./edit-model"

describe("applyHeldWriteEdit — createAccountingEvent", () => {
  it("overwrites occurredAt from the edited header date, keeping everything else", () => {
    const input = {
      counterpartyId: "cp-1",
      description: "FP — nájem kanceláře",
      occurredAt: "2026-06-01",
      confidence: "0.5000",
    }
    const next = applyHeldWriteEdit("createAccountingEvent", input, {
      header: { date: "2026-06-15" },
    })
    expect(next).toEqual({ ...input, occurredAt: "2026-06-15" })
  })

  it("is a no-op when the edit carries no header", () => {
    const input = { occurredAt: "2026-06-01" }
    expect(applyHeldWriteEdit("createAccountingEvent", input, {})).toEqual(
      input,
    )
  })
})

describe("applyHeldWriteEdit — captureAccountingDocument", () => {
  function documentFixture() {
    return {
      periodId: "period-1",
      issuedAt: "2026-06-01",
      lines: [
        {
          eventId: "event-1",
          partials: [
            {
              baseAmount: "10000.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "2100.00",
              currencyCode: "CZK",
              quantity: "1",
            },
            {
              baseAmount: "1000.00",
              vatMode: "STANDARD",
              vatRate: "12",
              vatAmount: "120.00",
              currencyCode: "CZK",
            },
          ],
        },
      ],
    }
  }

  it("rewrites issuedAt from the edited header date", () => {
    const input = documentFixture()
    const next = applyHeldWriteEdit("captureAccountingDocument", input, {
      header: { date: "2026-07-01" },
    })
    expect(next["issuedAt"]).toBe("2026-07-01")
  })

  it("rewrites base/vat for an UNAMBIGUOUS (single-partial) rate group, preserving other partial fields", () => {
    const input = documentFixture()
    const next = applyHeldWriteEdit("captureAccountingDocument", input, {
      vatAmounts: [{ rateLabel: "21 %", base: "9000.00", vat: "1890.00" }],
    }) as { lines: Array<{ partials: Array<Record<string, unknown>> }> }

    const partials = next.lines[0]?.partials
    expect(partials?.[0]).toEqual({
      baseAmount: "9000.00",
      vatMode: "STANDARD",
      vatRate: "21",
      vatAmount: "1890.00",
      currencyCode: "CZK",
      quantity: "1",
    })
    // The 12 % partial is untouched — no edit targeted it.
    expect(partials?.[1]).toEqual(documentFixture().lines[0]?.partials[1])
  })

  it("leaves an AMBIGUOUS (multi-partial, same rate) group untouched even when an edit targets its label", () => {
    const input = {
      issuedAt: "2026-06-01",
      lines: [
        {
          eventId: "event-1",
          partials: [
            {
              baseAmount: "10000.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "2100.00",
              currencyCode: "CZK",
            },
            {
              baseAmount: "500.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "105.00",
              currencyCode: "CZK",
            },
          ],
        },
      ],
    }
    const next = applyHeldWriteEdit("captureAccountingDocument", input, {
      vatAmounts: [{ rateLabel: "21 %", base: "1.00", vat: "1.00" }],
    })
    // Untouched — two partials share the 21 % rate, no safe 1:1 target.
    expect(next).toEqual(input)
  })

  it("does not touch lines when no vatAmounts edit is supplied", () => {
    const input = documentFixture()
    const next = applyHeldWriteEdit("captureAccountingDocument", input, {
      header: { date: "2026-07-01" },
    })
    expect(next["lines"]).toEqual(input.lines)
  })
})

describe("applyHeldWriteEdit — createAccountingPosting", () => {
  function postingFixture(kind: "double" | "monetary" = "double") {
    return {
      kind,
      entry: {
        postingDate: "2026-06-01",
        lines:
          kind === "double"
            ? [
                { accountId: "acc-1", side: "DEBIT", amount: "12100.00" },
                { accountId: "acc-2", side: "CREDIT", amount: "12100.00" },
              ]
            : [
                {
                  location: "BANK",
                  direction: "OUTFLOW",
                  isTaxRelevant: false,
                  amount: "500.00",
                },
              ],
      },
    }
  }

  it("rewrites postingDate from the edited header date", () => {
    const input = postingFixture()
    const next = applyHeldWriteEdit("createAccountingPosting", input, {
      header: { date: "2026-07-01" },
    }) as { entry: { postingDate: string } }
    expect(next.entry.postingDate).toBe("2026-07-01")
  })

  it("rewrites double-entry lines positionally (accountId/side/amount), preserving partialRecordId etc.", () => {
    const input = {
      kind: "double" as const,
      entry: {
        postingDate: "2026-06-01",
        lines: [
          {
            accountId: "acc-1",
            side: "DEBIT",
            amount: "12100.00",
            partialRecordId: "partial-1",
          },
          { accountId: "acc-2", side: "CREDIT", amount: "12100.00" },
        ],
      },
    }
    const next = applyHeldWriteEdit("createAccountingPosting", input, {
      postingLines: [
        { accountId: "acc-3", side: "DEBIT", amount: "13000.00" },
        { accountId: "acc-2", side: "CREDIT", amount: "13000.00" },
      ],
    }) as { entry: { lines: Array<Record<string, unknown>> } }

    expect(next.entry.lines).toEqual([
      {
        accountId: "acc-3",
        side: "DEBIT",
        amount: "13000.00",
        partialRecordId: "partial-1",
      },
      { accountId: "acc-2", side: "CREDIT", amount: "13000.00" },
    ])
  })

  it("never rewrites lines for a monetary/cash posting (no accountId/side to edit)", () => {
    const input = postingFixture("monetary")
    const next = applyHeldWriteEdit("createAccountingPosting", input, {
      postingLines: [{ accountId: "acc-1", side: "DEBIT", amount: "1.00" }],
    }) as { entry: { lines: unknown } }
    expect(next.entry.lines).toEqual(input.entry.lines)
  })
})

describe("applyHeldWriteEdit — unknown tool", () => {
  it("passes the input through unchanged (defensive default)", () => {
    const input = { foo: "bar" }
    expect(applyHeldWriteEdit("someFutureTool", input, {})).toEqual(input)
  })
})

describe("HeldWriteEditSchema", () => {
  it("accepts an empty edit (all fields optional)", () => {
    expect(HeldWriteEditSchema.safeParse({}).success).toBe(true)
  })

  it("rejects a malformed decimal amount", () => {
    const result = HeldWriteEditSchema.safeParse({
      vatAmounts: [{ rateLabel: "21 %", base: "abc", vat: "1.00" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a non-uuid accountId", () => {
    const result = HeldWriteEditSchema.safeParse({
      postingLines: [
        { accountId: "not-a-uuid", side: "DEBIT", amount: "1.00" },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid side", () => {
    const result = HeldWriteEditSchema.safeParse({
      postingLines: [
        {
          accountId: "0196f1de-0000-7000-8000-0000000000a1",
          side: "BOTH",
          amount: "1.00",
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
