/**
 * UC-2 (books), UC-3 (period output + R6 gate), UC-4 (supporting postings),
 * R8 (corrections), R11 (trace), R12 (period close + 701 carry-forward).
 * Each describe seeds a fresh organization/unit for isolation.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedTwoOrganizations,
  truncateAll,
} from "@workspace/db/tests/fixtures"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { rows } from "../src/sql"
import {
  captureDocument,
  closePeriod,
  createAccount,
  createCase,
  generateDepreciation,
  generateOutput,
  hlavniKniha,
  knihaAnalytickych,
  openNextPeriod,
  post,
  reconcileAnalytics,
  stornoEntry,
  traceAccount,
  tracePripad,
  unpostedCases,
  UnpostedPeriodError,
  type Dpfo,
  type Prehledy,
  type Zaverka,
} from "../src/index"
import {
  seedCashUnit,
  seedDoubleEntryUnit,
  seedOrg,
  type CashUnitSeed,
  type DoubleEntrySeed,
} from "./fixtures"

let adminSql: postgres.Sql
let workspaceId: string
let userId: string

beforeAll(async () => {
  adminSql = adminClient()
  const seed = await seedTwoOrganizations(adminSql)
  workspaceId = seed.workspaceId
  userId = seed.userAId
}, 120_000)

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
})

let slugCounter = 0
async function freshDouble(): Promise<{
  orgId: string
  seed: DoubleEntrySeed
}> {
  const orgId = await seedOrg(adminSql, workspaceId, `pod-${slugCounter++}`)
  const seed = await seedDoubleEntryUnit(orgId, userId)
  return { orgId, seed }
}
async function freshCash(
  regime: "JEDNODUCHE" | "DANOVA_EVIDENCE",
): Promise<{ orgId: string; seed: CashUnitSeed }> {
  const orgId = await seedOrg(
    adminSql,
    workspaceId,
    `cash-${slugCounter++}`,
    "natural_person",
  )
  const seed = await seedCashUnit(orgId, userId, regime)
  return { orgId, seed }
}

/** Capture + post a standard FP (zboží 100 + DPH 21): MD 504 / MD 343 / D 321. */
async function postFP(
  db: Parameters<typeof createCase>[0],
  ctx: { organizationId: string; jednotkaId: string },
  s: DoubleEntrySeed,
  oznaceni: string,
  datum = "2026-03-01",
): Promise<{ pripadId: string; zapisId: string }> {
  const pripadId = await createCase(db, ctx, {
    popis: "Nákup zboží",
    datumUskutecneni: datum,
    protistranaId: s.protistranaId,
  })
  const captured = await captureDocument(db, ctx, {
    obdobiId: s.obdobiId,
    typ: "FP",
    oznaceni,
    protistranaId: s.protistranaId,
    lines: [
      {
        pripadId,
        castka: "121.00",
        dilci: [
          { druh: "zaklad", castka: "100.00" },
          {
            druh: "dph",
            castka: "21.00",
            dphSazba: "21.00",
            dphCastka: "21.00",
          },
        ],
      },
    ],
  })
  const base = captured.lines[0]!
  const posted = await post(db, ctx, {
    kind: "double",
    entry: {
      obdobiId: s.obdobiId,
      dokladId: captured.dokladId,
      pripadId,
      datum,
      odpovednaOsoba: userId,
      lines: [
        {
          ucetId: s.accounts["504"]!,
          strana: "MD",
          castka: "100.00",
          dilciId: base.dilciIds[0],
        },
        {
          ucetId: s.accounts["343"]!,
          strana: "MD",
          castka: "21.00",
          dilciId: base.dilciIds[1],
        },
        { ucetId: s.accounts["321"]!, strana: "D", castka: "121.00" },
      ],
    },
  })
  return { pripadId, zapisId: posted.zapisId }
}

describe("UC-2 books + UC-3 ZAVERKA + R6 gate + R11 trace (PODVOJNE)", () => {
  let orgId: string
  let s: DoubleEntrySeed

  beforeAll(async () => {
    ;({ orgId, seed: s } = await freshDouble())
    await withOrganization(orgId, userId, (db) =>
      postFP(
        db,
        { organizationId: orgId, jednotkaId: s.jednotkaId },
        s,
        "FP-2026-001",
      ),
    )
  })

  it("hlavní kniha shows the posting and nets to zero", async () => {
    const kniha = await withOrganization(orgId, userId, (db) => hlavniKniha(db))
    const byUcet = Object.fromEntries(
      kniha.map((r) => [r.ucet_cislo, r.zustatek]),
    )
    expect(byUcet["504"]).toBe("100.0000")
    expect(byUcet["343"]).toBe("21.0000")
    expect(byUcet["321"]).toBe("-121.0000")
    expect(kniha.reduce((a, r) => a + Number(r.zustatek), 0)).toBe(0)
  })

  it("ZAVERKA derives náklady/výnosy/výsledek from the ledger", async () => {
    const out = await withOrganization(orgId, userId, (db) =>
      generateOutput(
        db,
        { organizationId: orgId, jednotkaId: s.jednotkaId },
        s.obdobiId,
      ),
    )
    const z = out.figures as Zaverka
    expect(z.typ).toBe("ZAVERKA")
    expect(z.naklady).toBe("100.0000")
    expect(z.vynosy).toBe("0")
    expect(z.vysledek).toBe("-100.0000")
    expect(out.vystupId).toBeTruthy()
  })

  it("R11 trace: account 504 -> zápis -> doklad -> případ, and reverse", async () => {
    const trace = await withOrganization(orgId, userId, (db) =>
      traceAccount(db, s.accounts["504"]!),
    )
    expect(trace).toHaveLength(1)
    expect(trace[0]!.doklad_oznaceni).toBe("FP-2026-001")
    const back = await withOrganization(orgId, userId, (db) =>
      tracePripad(db, trace[0]!.pripad_id),
    )
    expect(back.length).toBeGreaterThanOrEqual(1)
    expect(back.some((r) => r.zapis_id === trace[0]!.zapis_id)).toBe(true)
  })

  it("R6: output is blocked while a period case is unposted", async () => {
    const { orgId: o2, seed: s2 } = await freshDouble()
    // Capture a case + document but never post it.
    await withOrganization(o2, userId, async (db) => {
      const ctx = { organizationId: o2, jednotkaId: s2.jednotkaId }
      const pripadId = await createCase(db, ctx, {
        popis: "Nezaúčtováno",
        datumUskutecneni: "2026-03-01",
      })
      await captureDocument(db, ctx, {
        obdobiId: s2.obdobiId,
        typ: "FP",
        oznaceni: "FP-UNPOSTED",
        lines: [
          {
            pripadId,
            castka: "50.00",
            dilci: [{ druh: "zaklad", castka: "50.00" }],
          },
        ],
      })
    })
    const gaps = await withOrganization(o2, userId, (db) =>
      unpostedCases(db, s2.obdobiId),
    )
    expect(gaps).toHaveLength(1)
    await expect(
      withOrganization(o2, userId, (db) =>
        generateOutput(
          db,
          { organizationId: o2, jednotkaId: s2.jednotkaId },
          s2.obdobiId,
        ),
      ),
    ).rejects.toBeInstanceOf(UnpostedPeriodError)
  })
})

describe("UC-3 PREHLEDY (JEDNODUCHE) + DPFO (DANOVA_EVIDENCE)", () => {
  it("PREHLEDY sums taxable income/expense from the peněžní deník", async () => {
    const { orgId, seed: s } = await freshCash("JEDNODUCHE")
    await withOrganization(orgId, userId, async (db) => {
      const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
      const p1 = await createCase(db, ctx, {
        popis: "Tržba",
        datumUskutecneni: "2026-04-01",
      })
      const d1 = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "pokladni",
        oznaceni: "PD-1",
        lines: [
          {
            pripadId: p1,
            castka: "1000.00",
            dilci: [{ druh: "zaklad", castka: "1000.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: d1.dokladId,
          pripadId: p1,
          datum: "2026-04-01",
          odpovednaOsoba: userId,
          regime: "JEDNODUCHE",
          lines: [
            {
              misto: "hotovost",
              smer: "prijem",
              danovy: true,
              kategorieId: s.categories["sluzby"]!,
              zakladDane: "1000.00",
              castka: "1000.00",
              dilciId: d1.lines[0]!.dilciIds[0],
            },
          ],
        },
      })
      const p2 = await createCase(db, ctx, {
        popis: "Materiál",
        datumUskutecneni: "2026-04-02",
      })
      const d2 = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "BV",
        oznaceni: "BV-1",
        lines: [
          {
            pripadId: p2,
            castka: "400.00",
            dilci: [{ druh: "zaklad", castka: "400.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: d2.dokladId,
          pripadId: p2,
          datum: "2026-04-02",
          odpovednaOsoba: userId,
          regime: "JEDNODUCHE",
          lines: [
            {
              misto: "banka",
              smer: "vydaj",
              danovy: true,
              kategorieId: s.categories["material"]!,
              zakladDane: "400.00",
              castka: "400.00",
              dilciId: d2.lines[0]!.dilciIds[0],
            },
          ],
        },
      })
    })
    const out = await withOrganization(orgId, userId, (db) =>
      generateOutput(
        db,
        { organizationId: orgId, jednotkaId: s.jednotkaId },
        s.obdobiId,
      ),
    )
    const p = out.figures as Prehledy
    expect(p.typ).toBe("PREHLEDY")
    expect(p.prijmy_danove).toBe("1000.0000")
    expect(p.vydaje_danove).toBe("400.0000")
    expect(p.rozdil_danovy).toBe("600.0000")
  })

  it("DPFO computes základ daně for daňová evidence", async () => {
    const { orgId, seed: s } = await freshCash("DANOVA_EVIDENCE")
    await withOrganization(orgId, userId, async (db) => {
      const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
      const p1 = await createCase(db, ctx, {
        popis: "Příjem",
        datumUskutecneni: "2026-05-01",
      })
      const d1 = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "pokladni",
        oznaceni: "PD-D-1",
        lines: [
          {
            pripadId: p1,
            castka: "2000.00",
            dilci: [{ druh: "zaklad", castka: "2000.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: d1.dokladId,
          pripadId: p1,
          datum: "2026-05-01",
          odpovednaOsoba: userId,
          regime: "DANOVA_EVIDENCE",
          lines: [
            {
              misto: "hotovost",
              smer: "prijem",
              danovy: true,
              kategorieId: s.categories["sluzby"]!,
              zakladDane: "2000.00",
              castka: "2000.00",
              dilciId: d1.lines[0]!.dilciIds[0],
            },
          ],
        },
      })
    })
    const out = await withOrganization(orgId, userId, (db) =>
      generateOutput(
        db,
        { organizationId: orgId, jednotkaId: s.jednotkaId },
        s.obdobiId,
      ),
    )
    const d = out.figures as Dpfo
    expect(d.typ).toBe("DPFO")
    expect(d.prijmy_danove).toBe("2000.0000")
    expect(d.zaklad_dane).toBe("2000.0000")
  })
})

describe("R8 corrections (storno)", () => {
  it("storno reverses a posting into an open period; ledger nets to zero; original stays", async () => {
    const { orgId, seed: s } = await freshDouble()
    const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
    const { zapisId } = await withOrganization(orgId, userId, (db) =>
      postFP(db, ctx, s, "FP-STORNO-1"),
    )
    const storno = await withOrganization(orgId, userId, (db) =>
      stornoEntry(db, ctx, {
        originalZapisId: zapisId,
        obdobiId: s.obdobiId,
        datum: "2026-03-10",
        odpovednaOsoba: userId,
      }),
    )
    expect(storno.zapisId).toBeTruthy()
    // Original + storno both present; the account balances now net to zero.
    const kniha = await withOrganization(orgId, userId, (db) => hlavniKniha(db))
    const byUcet = Object.fromEntries(
      kniha.map((r) => [r.ucet_cislo, r.zustatek]),
    )
    expect(Number(byUcet["504"] ?? "0")).toBe(0)
    expect(Number(byUcet["321"] ?? "0")).toBe(0)
    // The original is still visible.
    const original =
      await adminSql`SELECT id FROM ucetni_zapis WHERE id = ${zapisId}::uuid`
    expect(original).toHaveLength(1)
  })

  it("rejects a correction into a closed period (no carve-out)", async () => {
    const { orgId, seed: s } = await freshDouble()
    const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
    const { zapisId } = await withOrganization(orgId, userId, (db) =>
      postFP(db, ctx, s, "FP-STORNO-2"),
    )
    await withOrganization(orgId, userId, (db) => closePeriod(db, s.obdobiId))
    // The DB R12 trigger rejects the storno's INSERT; drizzle wraps the PG error,
    // so the "closed (uzavreno)" text is on the cause, not the top-level message.
    let err: unknown
    try {
      await withOrganization(orgId, userId, (db) =>
        stornoEntry(db, ctx, {
          originalZapisId: zapisId,
          obdobiId: s.obdobiId,
          datum: "2026-03-10",
          odpovednaOsoba: userId,
        }),
      )
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    const e = err as { message?: string; cause?: { message?: string } }
    expect(`${e.message ?? ""} ${e.cause?.message ?? ""}`).toMatch(
      /closed \(uzavreno\)/,
    )
  })
})

describe("R12 period close + 701 carry-forward", () => {
  it("opens the next period with carried balance-sheet balances", async () => {
    const { orgId, seed: s } = await freshDouble()
    const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
    // Post a payable settled from bank: MD 321 100 / D 221 100, plus a receivable
    // so balance-sheet accounts carry forward.
    await withOrganization(orgId, userId, async (db) => {
      const pripadId = await createCase(db, ctx, {
        popis: "Pohledávka",
        datumUskutecneni: "2026-06-01",
      })
      const captured = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "FV",
        oznaceni: "FV-CF-1",
        lines: [
          {
            pripadId,
            castka: "500.00",
            dilci: [{ druh: "zaklad", castka: "500.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "double",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: captured.dokladId,
          pripadId,
          datum: "2026-06-01",
          odpovednaOsoba: userId,
          lines: [
            { ucetId: s.accounts["311"]!, strana: "MD", castka: "500.00" },
            {
              ucetId: s.accounts["602"]!,
              strana: "D",
              castka: "500.00",
              dilciId: captured.lines[0]!.dilciIds[0],
            },
          ],
        },
      })
    })
    const result = await withOrganization(orgId, userId, async (db) => {
      await closePeriod(db, s.obdobiId)
      return openNextPeriod(db, ctx, {
        priorObdobiId: s.obdobiId,
        newObdobi: { typ: "kalendar", od: "2027-01-01", do: "2027-12-31" },
        account701Id: s.accounts["701"]!,
        datum: "2027-01-01",
        odpovednaOsoba: userId,
      })
    })
    expect(result.openingZapisId).toBeTruthy()
    // The new period's opening ledger shows 311 carried forward (500 debit).
    const opening = await withOrganization(orgId, userId, (db) =>
      rows<{ ucet_cislo: string; zustatek: string }>(
        db,
        sql`SELECT u.cislo AS ucet_cislo,
               COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana='MD'), 0) - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana='D'), 0) AS zustatek
            FROM zapis_radek zr JOIN ucetni_zapis z ON zr.zapis_id=z.id JOIN ucet u ON zr.ucet_id=u.id
            WHERE z.obdobi_id = ${result.newObdobiId}::uuid GROUP BY u.cislo ORDER BY u.cislo`,
      ),
    )
    const byUcet = Object.fromEntries(
      opening.map((r) => [r.ucet_cislo, r.zustatek]),
    )
    expect(byUcet["311"]).toBe("500.0000")
    expect(byUcet["701"]).toBe("-500.0000")
  })
})

describe("UC-4 supporting postings", () => {
  it("generates a balanced depreciation posting linked to its plan", async () => {
    const { orgId, seed: s } = await freshDouble()
    const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
    const { planId, opravkyUcetId } = await withOrganization(
      orgId,
      userId,
      async (db) => {
        const [asset] = await adminSql<Array<{ id: string }>>`
        INSERT INTO majetek (organization_id, nazev) VALUES (${orgId}::uuid, 'Stroj') RETURNING id`
        const [plan] = await adminSql<Array<{ id: string }>>`
        INSERT INTO odpisovy_plan (organization_id, jednotka_id, majetek_id, metoda, mesicni_castka)
        VALUES (${orgId}::uuid, ${s.jednotkaId}::uuid, ${asset!.id}::uuid, 'rovnomerny', 100) RETURNING id`
        const [opravky] = await adminSql<Array<{ id: string }>>`
        INSERT INTO ucet (organization_id, rozvrh_id, cislo, trida, typ) VALUES (${orgId}::uuid, ${s.rozvrhId}::uuid, '082', 0, 'P') RETURNING id`
        return { planId: plan!.id, opravkyUcetId: opravky!.id }
      },
    )
    const posted = await withOrganization(orgId, userId, async (db) => {
      const pripadId = await createCase(db, ctx, {
        popis: "Odpis",
        datumUskutecneni: "2026-07-31",
      })
      // Generated postings use an internal doc with NO dílčí (they link via
      // odpisovy_plan_id, not the Zaúčtování dílčí), so R6 has nothing to expect.
      const captured = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "ID",
        oznaceni: "ODP-1",
        lines: [],
      })
      return generateDepreciation(db, ctx, {
        odpisovyPlanId: planId,
        obdobiId: s.obdobiId,
        dokladId: captured.dokladId,
        pripadId,
        datum: "2026-07-31",
        odpovednaOsoba: userId,
        nakladovyUcetId: s.accounts["518"]!,
        opravkyUcetId,
        castka: "100.00",
      })
    })
    expect(posted.lineIds).toHaveLength(2)
    const [row] = await adminSql<Array<{ odpisovy_plan_id: string }>>`
      SELECT odpisovy_plan_id FROM ucetni_zapis WHERE id = ${posted.zapisId}::uuid`
    expect(row?.odpisovy_plan_id).toBe(planId)
    // A generated depreciation posting must not block period output (R6).
    const out = await withOrganization(orgId, userId, (db) =>
      generateOutput(db, ctx, s.obdobiId),
    )
    expect(out.vystupId).toBeTruthy()
  })
})

describe("R13 — DECIMAL/CZK + rounding (zaokr) dílčí", () => {
  it("captures a zaokr dílčí and posts it with exact decimals", async () => {
    const { orgId, seed: s } = await freshDouble()
    const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
    await withOrganization(orgId, userId, async (db) => {
      const pripadId = await createCase(db, ctx, {
        popis: "Nákup s zaokrouhlením",
        datumUskutecneni: "2026-08-01",
      })
      const captured = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "FP",
        oznaceni: "FP-ZAOKR-1",
        lines: [
          {
            pripadId,
            castka: "121.50",
            dilci: [
              { druh: "zaklad", castka: "100.00" },
              {
                druh: "dph",
                castka: "21.00",
                dphSazba: "21.00",
                dphCastka: "21.00",
              },
              { druh: "zaokr", castka: "0.50" },
            ],
          },
        ],
      })
      const base = captured.lines[0]!
      await post(db, ctx, {
        kind: "double",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: captured.dokladId,
          pripadId,
          datum: "2026-08-01",
          odpovednaOsoba: userId,
          lines: [
            {
              ucetId: s.accounts["504"]!,
              strana: "MD",
              castka: "100.00",
              dilciId: base.dilciIds[0],
            },
            {
              ucetId: s.accounts["343"]!,
              strana: "MD",
              castka: "21.00",
              dilciId: base.dilciIds[1],
            },
            {
              ucetId: s.accounts["518"]!,
              strana: "MD",
              castka: "0.50",
              dilciId: base.dilciIds[2],
            },
            { ucetId: s.accounts["321"]!, strana: "D", castka: "121.50" },
          ],
        },
      })
    })
    const kniha = await withOrganization(orgId, userId, (db) => hlavniKniha(db))
    const byUcet = Object.fromEntries(
      kniha.map((r) => [r.ucet_cislo, r.zustatek]),
    )
    expect(byUcet["518"]).toBe("0.5000")
    expect(byUcet["321"]).toBe("-121.5000")
    // Exact decimal: 100 + 21 + 0.50 = 121.50, ledger nets to zero (no float drift).
    expect(kniha.reduce((a, r) => a + Number(r.zustatek), 0)).toBe(0)
  })

  it("DPFO base excludes pass-through VAT for a registered OSVČ (§9)", async () => {
    const { orgId, seed: s } = await freshCash("DANOVA_EVIDENCE")
    await withOrganization(orgId, userId, async (db) => {
      const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
      const pripadId = await createCase(db, ctx, {
        popis: "Tržba (plátce DPH)",
        datumUskutecneni: "2026-06-01",
      })
      // Gross receipt 1210 incl. 210 VAT; the taxable base is 1000.
      const doc = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "pokladni",
        oznaceni: "PD-VAT-1",
        lines: [
          {
            pripadId,
            castka: "1210.00",
            dilci: [{ druh: "zaklad", castka: "1000.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: doc.dokladId,
          pripadId,
          datum: "2026-06-01",
          odpovednaOsoba: userId,
          regime: "DANOVA_EVIDENCE",
          lines: [
            {
              misto: "hotovost",
              smer: "prijem",
              danovy: true,
              kategorieId: s.categories["sluzby"]!,
              zakladDane: "1000.00",
              castka: "1210.00",
              dilciId: doc.lines[0]!.dilciIds[0],
            },
          ],
        },
      })
    })
    const out = await withOrganization(orgId, userId, (db) =>
      generateOutput(
        db,
        { organizationId: orgId, jednotkaId: s.jednotkaId },
        s.obdobiId,
      ),
    )
    const d = out.figures as Dpfo
    // base is 1000 (zaklad_dane), NOT the 1210 gross cash receipt.
    expect(d.prijmy_danove).toBe("1000.0000")
    expect(d.zaklad_dane).toBe("1000.0000")
  })
})

describe("R5 — analytics reconcile (Σ analytical = synthetic, §16)", () => {
  it("an analytical account rolls up to its synthetic and reconciles", async () => {
    const { orgId, seed: s } = await freshDouble()
    const ctx = { organizationId: orgId, jednotkaId: s.jednotkaId }
    // Analytical child 311001 under synthetic 311.
    const analytical = await withOrganization(orgId, userId, (db) =>
      createAccount(db, {
        organizationId: orgId,
        rozvrhId: s.rozvrhId,
        cislo: "311001",
        trida: 3,
        typ: "A",
        parentId: s.accounts["311"]!,
      }),
    )
    await withOrganization(orgId, userId, async (db) => {
      const pripadId = await createCase(db, ctx, {
        popis: "Pohledávka (analyticky)",
        datumUskutecneni: "2026-09-01",
      })
      const doc = await captureDocument(db, ctx, {
        obdobiId: s.obdobiId,
        typ: "FV",
        oznaceni: "FV-AN-1",
        lines: [
          {
            pripadId,
            castka: "500.00",
            dilci: [{ druh: "zaklad", castka: "500.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "double",
        entry: {
          obdobiId: s.obdobiId,
          dokladId: doc.dokladId,
          pripadId,
          datum: "2026-09-01",
          odpovednaOsoba: userId,
          lines: [
            { ucetId: analytical, strana: "MD", castka: "500.00" },
            {
              ucetId: s.accounts["602"]!,
              strana: "D",
              castka: "500.00",
              dilciId: doc.lines[0]!.dilciIds[0],
            },
          ],
        },
      })
    })
    const analytics = await withOrganization(orgId, userId, (db) =>
      knihaAnalytickych(db),
    )
    expect(analytics).toHaveLength(1)
    expect(analytics[0]!.ucet_cislo).toBe("311001")
    expect(analytics[0]!.synteticky_ucet_id).toBe(s.accounts["311"])
    expect(analytics[0]!.zustatek).toBe("500.0000")

    const recon = await withOrganization(orgId, userId, (db) =>
      reconcileAnalytics(db),
    )
    const row = recon.find((r) => r.synteticky_ucet_id === s.accounts["311"])
    expect(row).toBeDefined()
    expect(row!.analytical_sum).toBe("500.0000")
    expect(row!.reconciles).toBe(true)
  })
})
