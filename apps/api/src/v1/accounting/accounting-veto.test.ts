import { describe, expect, it, vi } from "vitest"

import type { OrganizationBoundDb } from "@workspace/db"

import { deriveCaptureVeto, derivePostingVeto } from "./accounting-veto"

// A minimal drizzle-shaped stub: db.select({...}).from(account).where(pred)
// resolves to the given account rows. `where` is a spy so we can assert the
// in-tx lookup actually ran (or didn't, for the monetary pass-through).
function mkDb(accounts: Array<{ id: string; number: string }>) {
  const where = vi.fn().mockResolvedValue(accounts)
  const db = {
    select: () => ({ from: () => ({ where }) }),
  } as unknown as OrganizationBoundDb
  return { db, where }
}

const line = (accountId: string, side: "DEBIT" | "CREDIT", amount: string) => ({
  accountId,
  side,
  amount,
})

describe("derivePostingVeto — asset_vs_expense", () => {
  it("HOLDS a >=40k Kč debit to a capitalization-plausible expense account (518)", async () => {
    const { db } = mkDb([{ id: "acc-518", number: "518" }])
    const veto = await derivePostingVeto(db, "org-1", "double", {
      lines: [
        line("acc-518", "DEBIT", "50000.00"),
        line("acc-321", "CREDIT", "50000.00"),
      ],
    })
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["asset_vs_expense"])
  })

  it("does NOT hold a >=40k debit to a NON-candidate account (521 payroll auto-applies)", async () => {
    const { db } = mkDb([{ id: "acc-521", number: "521" }])
    const veto = await derivePostingVeto(db, "org-1", "double", {
      lines: [
        line("acc-521", "DEBIT", "50000.00"),
        line("acc-331", "CREDIT", "50000.00"),
      ],
    })
    expect(veto.held).toBe(false)
    expect(veto.signals).toEqual([])
  })

  it("does NOT hold a sub-40k debit to 518 (the control is precise, not blanket)", async () => {
    const { db } = mkDb([{ id: "acc-518", number: "518" }])
    const veto = await derivePostingVeto(db, "org-1", "double", {
      lines: [
        line("acc-518", "DEBIT", "30000.00"),
        line("acc-321", "CREDIT", "30000.00"),
      ],
    })
    expect(veto.held).toBe(false)
  })

  it("aggregates a split-cost asset across DIFFERENT analytics of one synthetic (518.001 + 518.002)", async () => {
    const { db } = mkDb([
      { id: "acc-a", number: "518.001" },
      { id: "acc-b", number: "518.002" },
    ])
    const veto = await derivePostingVeto(db, "org-1", "double", {
      lines: [
        line("acc-a", "DEBIT", "25000.00"),
        line("acc-b", "DEBIT", "25000.00"),
        line("acc-321", "CREDIT", "50000.00"),
      ],
    })
    // Per-synthetic aggregation: neither analytic alone reaches 40k, together they do.
    expect(veto.held).toBe(true)
  })

  it("passes MONETARY (cash-book) postings through untouched — no account lookup", async () => {
    const { db, where } = mkDb([])
    const veto = await derivePostingVeto(db, "org-1", "monetary", {
      lines: [{ location: "CASH", direction: "OUTFLOW", amount: "50000.00" }],
    })
    expect(veto.held).toBe(false)
    expect(where).not.toHaveBeenCalled()
  })
})

describe("deriveCaptureVeto — vat_mismatch", () => {
  const partial = (over: Record<string, unknown>) => ({
    baseAmount: "1000.00",
    vatMode: "STANDARD",
    vatRate: "21",
    vatAmount: "210.00",
    ...over,
  })

  it("passes a consistent STANDARD partial (vat == base*rate)", () => {
    const veto = deriveCaptureVeto([{ partials: [partial({})] }])
    expect(veto.held).toBe(false)
  })

  it("HOLDS a STANDARD partial whose vatAmount is grossly wrong", () => {
    const veto = deriveCaptureVeto([
      { partials: [partial({ vatAmount: "999.00" })] },
    ])
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["vat_mismatch"])
  })

  it("tolerates ±1 Kč rounding on the declared VAT", () => {
    const veto = deriveCaptureVeto([
      { partials: [partial({ vatAmount: "210.90" })] },
    ])
    expect(veto.held).toBe(false)
  })

  it("passes REVERSE_CHARGE through (VAT is the recipient's, not base*rate)", () => {
    const veto = deriveCaptureVeto([
      {
        partials: [
          partial({
            vatMode: "REVERSE_CHARGE",
            vatAmount: "0.00",
            vatRate: "21",
          }),
        ],
      },
    ])
    expect(veto.held).toBe(false)
  })

  it("passes a STANDARD partial with no declared vatAmount through", () => {
    const veto = deriveCaptureVeto([
      {
        partials: [
          { baseAmount: "1000.00", vatMode: "STANDARD", vatRate: "21" },
        ],
      },
    ])
    expect(veto.held).toBe(false)
  })
})
