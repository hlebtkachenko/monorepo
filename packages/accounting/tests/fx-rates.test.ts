/**
 * FX rate resolution + conversion (fx/rates.ts) over the 0072 rate store.
 *
 * Proves the ADR-0013 precedence (org override -> shared ČNB -> error), that a
 * rate is never taken from a neighbouring date NOR a different rate_kind, that
 * overrides are org-isolated (another org falls back to the shared rate) and
 * date-scoped (a stale override never shadows today's shared rate), that a locked
 * override still resolves, and that conversion math (done in SQL) honours the ČNB
 * "množství" unit, agrees with the per-1 effectiveRate capture freezes, and
 * rounds to the 4-dp money precision (incl. negative/zero amounts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  FxRateNotFoundError,
  convertAmount,
  convertAmountAt,
  effectiveRate,
  resolveFxRate,
} from "../src/index"
import { adminClient, seedTwoOrganizations } from "./fixtures"

let admin: ReturnType<typeof adminClient>
let orgA: string
let orgB: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const s = await seedTwoOrganizations(admin)
  orgA = s.orgAId
  orgB = s.orgBId
  userId = s.userAId

  // Shared ČNB fixes: EUR->CZK 25.15 (DAILY), GBP->CZK 29.00 per 100 (a
  // "množství" DAILY row), USD->CZK 23.50 as a FIXED (pevný) kurz.
  await admin`
    INSERT INTO fx_rate (from_code, to_code, rate_date, rate_kind, unit_amount, rate, source)
    VALUES ('EUR', 'CZK', '2026-07-20', 'DAILY', 1,   25.150000,  'CNB'),
           ('GBP', 'CZK', '2026-07-20', 'DAILY', 100, 2900.000000, 'CNB'),
           ('USD', 'CZK', '2026-07-20', 'FIXED', 1,   23.500000,  'CNB')
  `
  // Org A overrides: EUR->CZK today (forward contract); a locked USD FIXED
  // override; and a STALE GBP override on a different day that must not shadow.
  await admin`
    INSERT INTO fx_rate_override
      (organization_id, from_code, to_code, rate_date, rate_kind, unit_amount, rate, reason, is_locked)
    VALUES
      (${orgA}::uuid, 'EUR', 'CZK', '2026-07-20', 'DAILY', 1,   25.500000,  'forward contract', false),
      (${orgA}::uuid, 'USD', 'CZK', '2026-07-20', 'FIXED', 1,   24.000000,  'pevný kurz směrnice', true),
      (${orgA}::uuid, 'GBP', 'CZK', '2026-07-19', 'DAILY', 100, 3100.000000, 'stale prior day', false)
  `
})

afterAll(async () => {
  await admin`DELETE FROM fx_rate_override`
  await admin`DELETE FROM fx_rate`
  await admin.end({ timeout: 5 })
})

describe("resolveFxRate — precedence override -> ČNB -> error", () => {
  it("an org override beats the shared ČNB rate at the same pair/date", async () => {
    const r = await withOrganization(orgA, userId, (db) =>
      resolveFxRate(db, { fromCode: "EUR", toCode: "CZK", on: "2026-07-20" }),
    )
    expect(r.rate).toBe("25.500000")
    expect(r.source).toBe("override")
  })

  it("another org has no override and falls back to the shared ČNB rate", async () => {
    const r = await withOrganization(orgB, userId, (db) =>
      resolveFxRate(db, { fromCode: "EUR", toCode: "CZK", on: "2026-07-20" }),
    )
    expect(r.rate).toBe("25.150000")
    expect(r.source).toBe("CNB")
  })

  it("a stale override on a different date does NOT shadow today's shared rate", async () => {
    // org A has a GBP override only on 2026-07-19; the 07-20 lookup must return
    // the shared ČNB fix, not the prior day's override.
    const r = await withOrganization(orgA, userId, (db) =>
      resolveFxRate(db, { fromCode: "GBP", toCode: "CZK", on: "2026-07-20" }),
    )
    expect(r.rate).toBe("2900.000000")
    expect(r.source).toBe("CNB")
  })

  it("throws FxRateNotFoundError when no rate exists for the pair", async () => {
    // USD has only a FIXED row → a DAILY query finds nothing (also proves kind isolation).
    await expect(
      withOrganization(orgB, userId, (db) =>
        resolveFxRate(db, { fromCode: "USD", toCode: "CZK", on: "2026-07-20" }),
      ),
    ).rejects.toBeInstanceOf(FxRateNotFoundError)
  })

  it("never substitutes a neighbouring date (exact-date match only)", async () => {
    await expect(
      withOrganization(orgB, userId, (db) =>
        resolveFxRate(db, { fromCode: "EUR", toCode: "CZK", on: "2026-07-21" }),
      ),
    ).rejects.toBeInstanceOf(FxRateNotFoundError)
  })

  it("filters on rate_kind — a FIXED query resolves the FIXED row", async () => {
    const r = await withOrganization(orgB, userId, (db) =>
      resolveFxRate(db, {
        fromCode: "USD",
        toCode: "CZK",
        on: "2026-07-20",
        kind: "FIXED",
      }),
    )
    expect(r.rate).toBe("23.500000")
    expect(r.rateKind).toBe("FIXED")
  })

  it("a locked override still resolves and still wins over the shared rate", async () => {
    // org A's USD FIXED override (24.00, is_locked) beats the shared 23.50; locking
    // is a write-freeze concern, never a read filter.
    const r = await withOrganization(orgA, userId, (db) =>
      resolveFxRate(db, {
        fromCode: "USD",
        toCode: "CZK",
        on: "2026-07-20",
        kind: "FIXED",
      }),
    )
    expect(r.rate).toBe("24.000000")
    expect(r.source).toBe("override")
  })
})

describe("convertAmount / effectiveRate — SQL math, množství, rounding", () => {
  it("converts at a unit_amount = 1 rate", async () => {
    const out = await withOrganization(orgB, userId, async (db) => {
      const rate = await resolveFxRate(db, {
        fromCode: "EUR",
        toCode: "CZK",
        on: "2026-07-20",
      })
      return convertAmount(db, "100.00", rate)
    })
    expect(out).toBe("2515.0000")
  })

  it("honours the ČNB množství and agrees with the per-1 effectiveRate (capture's formula)", async () => {
    const { converted, eff } = await withOrganization(
      orgB,
      userId,
      async (db) => {
        const rate = await resolveFxRate(db, {
          fromCode: "GBP",
          toCode: "CZK",
          on: "2026-07-20",
        })
        return {
          converted: await convertAmount(db, "250.00", rate),
          eff: await effectiveRate(db, rate),
        }
      },
    )
    // effectiveRate = 2900 / 100 = 29.000000 (the value capture freezes onto
    // partial_record.fx_rate); 250 × 29 = 7250, matching convertAmount.
    expect(eff).toBe("29.000000")
    expect(converted).toBe("7250.0000")
  })

  it("handles negative (credit note) and zero amounts", async () => {
    const { neg, zero } = await withOrganization(orgB, userId, async (db) => {
      const rate = await resolveFxRate(db, {
        fromCode: "EUR",
        toCode: "CZK",
        on: "2026-07-20",
      })
      return {
        neg: await convertAmount(db, "-50.00", rate),
        zero: await convertAmount(db, "0.00", rate),
      }
    })
    expect(neg).toBe("-1257.5000")
    expect(zero).toBe("0.0000")
  })
})

describe("convertAmountAt — resolve + convert in one call", () => {
  it("short-circuits same-currency at rate 1 with no lookup", async () => {
    const res = await withOrganization(orgB, userId, (db) =>
      convertAmountAt(db, "1234.5600", {
        fromCode: "CZK",
        toCode: "CZK",
        on: "2026-07-20",
      }),
    )
    expect(res.amount).toBe("1234.5600")
    expect(res.rate.source).toBe("identity")
  })

  it("resolves the override then converts for org A", async () => {
    const res = await withOrganization(orgA, userId, (db) =>
      convertAmountAt(db, "100.00", {
        fromCode: "EUR",
        toCode: "CZK",
        on: "2026-07-20",
      }),
    )
    // org A override 25.50 → 100 × 25.50 = 2550
    expect(res.amount).toBe("2550.0000")
    expect(res.rate.source).toBe("override")
  })
})
