/**
 * UC-1 — record a transaction end-to-end for all three regimes (capture → post).
 * Verifies the double-entry path balances and lands in the ledger, and the
 * cash-book path classifies rows (incl. a multi-row movement and a průběžná
 * položka transfer) in the peněžní deník.
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
import { captureDocument, createCase, post } from "../src/index"
import {
  seedCashUnit,
  seedDoubleEntryUnit,
  seedOrg,
  type CashUnitSeed,
  type DoubleEntrySeed,
} from "./fixtures"

let adminSql: postgres.Sql
let orgPodvojneId: string
let orgJednoducheId: string
let orgDaneId: string
let userId: string

let pod: DoubleEntrySeed
let jed: CashUnitSeed
let dan: CashUnitSeed

beforeAll(async () => {
  adminSql = adminClient()
  const seed = await seedTwoOrganizations(adminSql)
  orgPodvojneId = seed.orgAId
  orgJednoducheId = seed.orgBId
  userId = seed.userAId
  orgDaneId = await seedOrg(
    adminSql,
    seed.workspaceId,
    "osvc-dan",
    "natural_person",
  )

  pod = await seedDoubleEntryUnit(orgPodvojneId, userId)
  jed = await seedCashUnit(orgJednoducheId, userId, "JEDNODUCHE")
  dan = await seedCashUnit(orgDaneId, userId, "DANOVA_EVIDENCE")
}, 120_000)

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
})

describe("PODVOJNE — double-entry", () => {
  it("records FP (zboží 100 + DPH 21) and the ledger reflects it, balanced", async () => {
    const result = await withOrganization(orgPodvojneId, userId, async (db) => {
      const ctx = { organizationId: orgPodvojneId, jednotkaId: pod.jednotkaId }
      const pripadId = await createCase(db, ctx, {
        popis: "Nákup zboží",
        datumUskutecneni: "2026-03-01",
        protistranaId: pod.protistranaId,
      })
      const captured = await captureDocument(db, ctx, {
        obdobiId: pod.obdobiId,
        typ: "FP",
        oznaceni: "FP-2026-001",
        protistranaId: pod.protistranaId,
        lines: [
          {
            pripadId,
            popis: "zboží",
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
      return post(db, ctx, {
        kind: "double",
        entry: {
          obdobiId: pod.obdobiId,
          dokladId: captured.dokladId,
          pripadId,
          datum: "2026-03-01",
          odpovednaOsoba: userId,
          lines: [
            {
              ucetId: pod.accounts["504"]!,
              strana: "MD",
              castka: "100.00",
              dilciId: base.dilciIds[0],
            },
            {
              ucetId: pod.accounts["343"]!,
              strana: "MD",
              castka: "21.00",
              dilciId: base.dilciIds[1],
            },
            { ucetId: pod.accounts["321"]!, strana: "D", castka: "121.00" },
          ],
        },
      })
    })
    expect(result.lineIds).toHaveLength(3)

    const kniha = await withOrganization(orgPodvojneId, userId, (db) =>
      rows<{ ucet_cislo: string; zustatek: string }>(
        db,
        sql`SELECT ucet_cislo, zustatek FROM v_hlavni_kniha ORDER BY ucet_cislo`,
      ),
    )
    const byUcet = Object.fromEntries(
      kniha.map((r) => [r.ucet_cislo, r.zustatek]),
    )
    expect(byUcet["504"]).toBe("100.0000")
    expect(byUcet["343"]).toBe("21.0000")
    expect(byUcet["321"]).toBe("-121.0000")
    // Σ over all accounts nets to zero (the ledger is balanced).
    const total = kniha.reduce((acc, r) => acc + Number(r.zustatek), 0)
    expect(total).toBe(0)
  })

  it("rejects a cash-book posting on a PODVOJNE unit (dispatcher guard)", async () => {
    await expect(
      withOrganization(orgPodvojneId, userId, async (db) => {
        const ctx = {
          organizationId: orgPodvojneId,
          jednotkaId: pod.jednotkaId,
        }
        const pripadId = await createCase(db, ctx, {
          popis: "x",
          datumUskutecneni: "2026-03-02",
        })
        const captured = await captureDocument(db, ctx, {
          obdobiId: pod.obdobiId,
          typ: "BV",
          oznaceni: "BV-GUARD-1",
          lines: [
            {
              pripadId,
              castka: "1.00",
              dilci: [{ druh: "zaklad", castka: "1.00" }],
            },
          ],
        })
        return post(db, ctx, {
          kind: "cash",
          entry: {
            obdobiId: pod.obdobiId,
            dokladId: captured.dokladId,
            pripadId,
            datum: "2026-03-02",
            odpovednaOsoba: userId,
            regime: "JEDNODUCHE",
            lines: [
              { misto: "banka", smer: "vydaj", danovy: true, castka: "1.00" },
            ],
          },
        })
      }),
    ).rejects.toThrow(/PODVOJNE/)
  })
})

describe("JEDNODUCHE — cash book (multi-row + průběžná položka)", () => {
  it("classifies a split payment and a transfer in the peněžní deník", async () => {
    await withOrganization(orgJednoducheId, userId, async (db) => {
      const ctx = {
        organizationId: orgJednoducheId,
        jednotkaId: jed.jednotkaId,
      }
      // A bank payment split across two expense categories (multi-row).
      const pripadId = await createCase(db, ctx, {
        popis: "Úhrada nákladů",
        datumUskutecneni: "2026-04-01",
      })
      const captured = await captureDocument(db, ctx, {
        obdobiId: jed.obdobiId,
        typ: "BV",
        oznaceni: "BV-2026-010",
        lines: [
          {
            pripadId,
            castka: "300.00",
            dilci: [{ druh: "zaklad", castka: "300.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: jed.obdobiId,
          dokladId: captured.dokladId,
          pripadId,
          datum: "2026-04-01",
          odpovednaOsoba: userId,
          regime: "JEDNODUCHE",
          lines: [
            {
              misto: "banka",
              smer: "vydaj",
              danovy: true,
              kategorieId: jed.categories["material"]!,
              zakladDane: "200.00",
              castka: "200.00",
            },
            {
              misto: "banka",
              smer: "vydaj",
              danovy: true,
              kategorieId: jed.categories["rezie"]!,
              zakladDane: "100.00",
              castka: "100.00",
            },
          ],
        },
      })

      // A průběžná položka: cash withdrawn from bank to till (transfer between own funds).
      const transferCase = await createCase(db, ctx, {
        popis: "Výběr z bankomatu",
        datumUskutecneni: "2026-04-02",
      })
      const transferDoc = await captureDocument(db, ctx, {
        obdobiId: jed.obdobiId,
        typ: "BV",
        oznaceni: "BV-2026-011",
        lines: [
          {
            pripadId: transferCase,
            castka: "500.00",
            dilci: [{ druh: "zaklad", castka: "500.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: jed.obdobiId,
          dokladId: transferDoc.dokladId,
          pripadId: transferCase,
          datum: "2026-04-02",
          odpovednaOsoba: userId,
          regime: "JEDNODUCHE",
          lines: [
            {
              misto: "banka",
              smer: "vydaj",
              danovy: false,
              prubezny: true,
              castka: "500.00",
            },
            {
              misto: "hotovost",
              smer: "prijem",
              danovy: false,
              prubezny: true,
              castka: "500.00",
            },
          ],
        },
      })
    })

    const denik = await withOrganization(orgJednoducheId, userId, (db) =>
      rows<{
        misto: string
        smer: string
        danovy: boolean
        prubezny: boolean
        castka: string
        kategorie_nazev: string | null
      }>(
        db,
        sql`SELECT misto, smer, danovy, prubezny, castka, kategorie_nazev FROM v_penezni_denik ORDER BY castka DESC`,
      ),
    )
    expect(denik).toHaveLength(4)
    const danove = denik.filter((r) => r.danovy)
    expect(danove).toHaveLength(2)
    const prubezne = denik.filter((r) => r.prubezny)
    expect(prubezne).toHaveLength(2)
    // taxable expenses total 300 (200 + 100).
    const danoveTotal = danove.reduce((a, r) => a + Number(r.castka), 0)
    expect(danoveTotal).toBe(300)
  })
})

describe("DANOVA_EVIDENCE — cash book", () => {
  it("records a taxable receipt classified in the peněžní deník", async () => {
    await withOrganization(orgDaneId, userId, async (db) => {
      const ctx = { organizationId: orgDaneId, jednotkaId: dan.jednotkaId }
      const pripadId = await createCase(db, ctx, {
        popis: "Tržba za službu",
        datumUskutecneni: "2026-05-01",
      })
      const captured = await captureDocument(db, ctx, {
        obdobiId: dan.obdobiId,
        typ: "pokladni",
        oznaceni: "PD-2026-001",
        lines: [
          {
            pripadId,
            castka: "1000.00",
            dilci: [{ druh: "zaklad", castka: "1000.00" }],
          },
        ],
      })
      await post(db, ctx, {
        kind: "cash",
        entry: {
          obdobiId: dan.obdobiId,
          dokladId: captured.dokladId,
          pripadId,
          datum: "2026-05-01",
          odpovednaOsoba: userId,
          regime: "DANOVA_EVIDENCE",
          lines: [
            {
              misto: "hotovost",
              smer: "prijem",
              danovy: true,
              kategorieId: dan.categories["sluzby"]!,
              zakladDane: "1000.00",
              castka: "1000.00",
            },
          ],
        },
      })
    })

    const denik = await withOrganization(orgDaneId, userId, (db) =>
      rows<{ regime: string; smer: string; danovy: boolean; castka: string }>(
        db,
        sql`SELECT regime, smer, danovy, castka FROM v_penezni_denik`,
      ),
    )
    expect(denik).toHaveLength(1)
    expect(denik[0]!.regime).toBe("DANOVA_EVIDENCE")
    expect(denik[0]!.smer).toBe("prijem")
    expect(denik[0]!.danovy).toBe(true)
    expect(denik[0]!.castka).toBe("1000.0000")
  })
})
