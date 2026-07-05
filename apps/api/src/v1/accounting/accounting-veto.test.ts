import { describe, expect, it, vi } from "vitest"

import type { OrganizationBoundDb } from "@workspace/db"

import {
  deriveCaptureVeto,
  deriveTemplateNovelty,
  derivePostingVeto,
} from "./accounting-veto"

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

// A drizzle-shaped stub for the template-novelty lookup:
//   db.select({...}).from(t).where(pred).limit(1)  -> the template row (or none)
//   db.update(t).set({...}).where(pred)            -> held_count bump (spied)
function mkTemplateDb(row: { humanConfirmedAt: Date | null } | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : [])
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn(() => ({ where: updateWhere }))
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    update: () => ({ set }),
  } as unknown as OrganizationBoundDb
  return { db, limit, set, updateWhere }
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

  it("HOLDS a >=40k debit to 548 (widened capitalization-plausible set — M-E)", async () => {
    const { db } = mkDb([{ id: "acc-548", number: "548" }])
    const veto = await derivePostingVeto(db, "org-1", "double", {
      lines: [
        line("acc-548", "DEBIT", "50000.00"),
        line("acc-321", "CREDIT", "50000.00"),
      ],
    })
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["asset_vs_expense"])
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

  it("HOLDS non-STANDARD VAT (REVERSE_CHARGE cannot be server-verified — M-E)", () => {
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
    // Closes the "claim RC to dodge the VAT check" vector — routes to human review.
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["unverified_vat_regime"])
  })

  it("HOLDS EXEMPT / OUTSIDE_VAT / IMPORT the same way (M-E)", () => {
    for (const mode of ["EXEMPT", "OUTSIDE_VAT", "IMPORT"]) {
      const veto = deriveCaptureVeto([
        { partials: [partial({ vatMode: mode })] },
      ])
      expect(veto.held).toBe(true)
      expect(veto.signals).toEqual(["unverified_vat_regime"])
    }
  })

  it("HOLDS a STANDARD partial with a nonzero rate but NO declared vatAmount (M-E)", () => {
    const veto = deriveCaptureVeto([
      {
        partials: [
          { baseAmount: "1000.00", vatMode: "STANDARD", vatRate: "21" },
        ],
      },
    ])
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["vat_amount_missing"])
  })

  it("does NOT hold a STANDARD 0% partial with no vatAmount (rate 0 = 0 VAT)", () => {
    const veto = deriveCaptureVeto([
      {
        partials: [
          { baseAmount: "1000.00", vatMode: "STANDARD", vatRate: "0" },
        ],
      },
    ])
    expect(veto.held).toBe(false)
  })

  it("HOLDS a STANDARD partial with a null vatRate and no vatAmount ([G3-B1] blind spot)", () => {
    // Without this rider a STANDARD + vatRate=null + no vatAmount payload slips the
    // whole VAT screen and auto-applies on the client scalar. It must be HELD.
    const veto = deriveCaptureVeto([
      {
        partials: [
          { baseAmount: "1000.00", vatMode: "STANDARD", vatRate: null },
        ],
      },
    ])
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["unverified_vat_regime"])
  })

  it("HOLDS a STANDARD partial with an ABSENT vatRate ([G3-B1] blind spot)", () => {
    const veto = deriveCaptureVeto([
      { partials: [{ baseAmount: "1000.00", vatMode: "STANDARD" }] },
    ])
    expect(veto.held).toBe(true)
    expect(veto.signals).toEqual(["unverified_vat_regime"])
  })
})

describe("deriveTemplateNovelty — unconfirmed OCR template", () => {
  it("fires (novel) for an UNCONFIRMED template (human_confirmed_at IS NULL)", async () => {
    const { db, limit, set } = mkTemplateDb({ humanConfirmedAt: null })
    const r = await deriveTemplateNovelty(db, "tpl-1")
    expect(r.novel).toBe(true)
    expect(limit).toHaveBeenCalledOnce() // the lookup ran
    expect(set).toHaveBeenCalledOnce() // held_count telemetry bumped on the hold
  })

  it("does NOT fire for a CONFIRMED template (human_confirmed_at set)", async () => {
    const { db, set } = mkTemplateDb({ humanConfirmedAt: new Date() })
    const r = await deriveTemplateNovelty(db, "tpl-2")
    expect(r.novel).toBe(false)
    expect(set).not.toHaveBeenCalled() // no hold => no held_count bump
  })

  it("does NOT fire when the template id resolves to NO row under RLS", async () => {
    // A workspace-scoped id that RLS narrows to zero rows: this leg adds no hold
    // (the omitted/absent-template fail-closed case is B2/M4 scope).
    const { db, set } = mkTemplateDb(null)
    const r = await deriveTemplateNovelty(db, "tpl-missing")
    expect(r.novel).toBe(false)
    expect(set).not.toHaveBeenCalled()
  })
})
