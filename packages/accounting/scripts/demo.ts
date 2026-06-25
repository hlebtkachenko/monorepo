/**
 * Accounting Records System — end-to-end demo (no UI).
 *
 * Records a transaction for each of the three regimes against the LOCAL dev DB
 * and prints the books + period outputs, so the system can be exercised "with
 * data requests" without a frontend. Run:
 *
 *   pnpm --filter @workspace/accounting demo
 *
 * Defaults to the local compose Postgres (app_dev). Override with DATABASE_URL /
 * DATABASE_DIRECT_URL. Each run seeds a fresh workspace, so it is re-runnable.
 */

process.env["DATABASE_URL"] ??=
  "postgres://app_user:dev_user@127.0.0.1:6432/app_dev"
process.env["DATABASE_DIRECT_URL"] ??=
  "postgres://app_owner:dev_owner@127.0.0.1:5432/app_dev"

import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "@workspace/db/tests/fixtures"
import {
  captureDocument,
  createCase,
  generateOutput,
  hlavniKniha,
  penezniDenik,
  post,
} from "../src/index"
import { seedCashUnit, seedDoubleEntryUnit, seedOrg } from "../tests/fixtures"

function heading(title: string): void {
  console.log(`\n${"=".repeat(64)}\n${title}\n${"=".repeat(64)}`)
}

async function main(): Promise<void> {
  const adminSql = adminClient()
  try {
    const seed = await seedTwoOrganizations(adminSql)
    const userId = seed.userAId
    const orgDan = await seedOrg(
      adminSql,
      seed.workspaceId,
      `demo-osvc-${Math.floor(Date.now() / 1000)}`,
      "natural_person",
    )

    // --- PODVOJNÉ ----------------------------------------------------------
    heading(
      "PODVOJNÉ (double-entry s.r.o.) — FP nákup zboží + FV prodej služby",
    )
    const pod = await seedDoubleEntryUnit(seed.orgAId, userId)
    await withOrganization(seed.orgAId, userId, async (db) => {
      const ctx = { organizationId: seed.orgAId, jednotkaId: pod.jednotkaId }
      // FP: zboží 100 + DPH 21 -> MD 504 / MD 343 / D 321
      const fpCase = await createCase(db, ctx, {
        popis: "Nákup zboží od dodavatele",
        datumUskutecneni: "2026-03-01",
        protistranaId: pod.protistranaId,
      })
      const fp = await captureDocument(db, ctx, {
        obdobiId: pod.obdobiId,
        typ: "FP",
        oznaceni: "FP-2026-001",
        protistranaId: pod.protistranaId,
        lines: [
          {
            pripadId: fpCase,
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
      await post(db, ctx, {
        kind: "double",
        entry: {
          obdobiId: pod.obdobiId,
          dokladId: fp.dokladId,
          pripadId: fpCase,
          datum: "2026-03-01",
          odpovednaOsoba: userId,
          lines: [
            {
              ucetId: pod.accounts["504"]!,
              strana: "MD",
              castka: "100.00",
              dilciId: fp.lines[0]!.dilciIds[0],
            },
            {
              ucetId: pod.accounts["343"]!,
              strana: "MD",
              castka: "21.00",
              dilciId: fp.lines[0]!.dilciIds[1],
            },
            { ucetId: pod.accounts["321"]!, strana: "D", castka: "121.00" },
          ],
        },
      })
      // FV: služba 200 + DPH 42 -> MD 311 / D 602 / D 343
      const fvCase = await createCase(db, ctx, {
        popis: "Prodej služby odběrateli",
        datumUskutecneni: "2026-03-05",
        protistranaId: pod.protistranaId,
      })
      const fv = await captureDocument(db, ctx, {
        obdobiId: pod.obdobiId,
        typ: "FV",
        oznaceni: "FV-2026-001",
        protistranaId: pod.protistranaId,
        lines: [
          {
            pripadId: fvCase,
            castka: "242.00",
            dilci: [
              { druh: "zaklad", castka: "200.00" },
              {
                druh: "dph",
                castka: "42.00",
                dphSazba: "21.00",
                dphCastka: "42.00",
              },
            ],
          },
        ],
      })
      await post(db, ctx, {
        kind: "double",
        entry: {
          obdobiId: pod.obdobiId,
          dokladId: fv.dokladId,
          pripadId: fvCase,
          datum: "2026-03-05",
          odpovednaOsoba: userId,
          lines: [
            { ucetId: pod.accounts["311"]!, strana: "MD", castka: "242.00" },
            {
              ucetId: pod.accounts["602"]!,
              strana: "D",
              castka: "200.00",
              dilciId: fv.lines[0]!.dilciIds[0],
            },
            {
              ucetId: pod.accounts["343"]!,
              strana: "D",
              castka: "42.00",
              dilciId: fv.lines[0]!.dilciIds[1],
            },
          ],
        },
      })
    })
    await withOrganization(seed.orgAId, userId, async (db) => {
      console.log("\nHlavní kniha:")
      console.table(await hlavniKniha(db))
      const out = await generateOutput(
        db,
        { organizationId: seed.orgAId, jednotkaId: pod.jednotkaId },
        pod.obdobiId,
      )
      console.log("\nÚčetní závěrka:", out.figures)
    })

    // --- JEDNODUCHÉ --------------------------------------------------------
    heading("JEDNODUCHÉ (spolek) — peněžní deník: tržba + výdaj")
    const jed = await seedCashUnit(seed.orgBId, userId, "JEDNODUCHE")
    await runCashFlow(seed.orgBId, userId, jed, "JEDNODUCHE")

    // --- DAŇOVÁ EVIDENCE ---------------------------------------------------
    heading("DAŇOVÁ EVIDENCE (OSVČ) — peněžní deník + podklad DPFO")
    const dan = await seedCashUnit(orgDan, userId, "DANOVA_EVIDENCE")
    await runCashFlow(orgDan, userId, dan, "DANOVA_EVIDENCE")

    console.log("\nDemo complete. Data left in app_dev for inspection.\n")
  } finally {
    await adminSql.end({ timeout: 5 })
  }
}

async function runCashFlow(
  orgId: string,
  userId: string,
  seed: {
    jednotkaId: string
    obdobiId: string
    categories: Record<string, string>
  },
  regime: "JEDNODUCHE" | "DANOVA_EVIDENCE",
): Promise<void> {
  await withOrganization(orgId, userId, async (db) => {
    const ctx = { organizationId: orgId, jednotkaId: seed.jednotkaId }
    const incomeCase = await createCase(db, ctx, {
      popis: "Tržba za službu",
      datumUskutecneni: "2026-04-01",
    })
    const incomeDoc = await captureDocument(db, ctx, {
      obdobiId: seed.obdobiId,
      typ: "pokladni",
      oznaceni: "PD-2026-001",
      lines: [
        {
          pripadId: incomeCase,
          castka: "1000.00",
          dilci: [{ druh: "zaklad", castka: "1000.00" }],
        },
      ],
    })
    await post(db, ctx, {
      kind: "cash",
      entry: {
        obdobiId: seed.obdobiId,
        dokladId: incomeDoc.dokladId,
        pripadId: incomeCase,
        datum: "2026-04-01",
        odpovednaOsoba: userId,
        regime,
        lines: [
          {
            misto: "hotovost",
            smer: "prijem",
            danovy: true,
            kategorieId: seed.categories["sluzby"]!,
            zakladDane: "1000.00",
            castka: "1000.00",
            dilciId: incomeDoc.lines[0]!.dilciIds[0],
          },
        ],
      },
    })
    const expenseCase = await createCase(db, ctx, {
      popis: "Nákup materiálu",
      datumUskutecneni: "2026-04-02",
    })
    const expenseDoc = await captureDocument(db, ctx, {
      obdobiId: seed.obdobiId,
      typ: "BV",
      oznaceni: "BV-2026-001",
      lines: [
        {
          pripadId: expenseCase,
          castka: "350.00",
          dilci: [{ druh: "zaklad", castka: "350.00" }],
        },
      ],
    })
    await post(db, ctx, {
      kind: "cash",
      entry: {
        obdobiId: seed.obdobiId,
        dokladId: expenseDoc.dokladId,
        pripadId: expenseCase,
        datum: "2026-04-02",
        odpovednaOsoba: userId,
        regime,
        lines: [
          {
            misto: "banka",
            smer: "vydaj",
            danovy: true,
            kategorieId: seed.categories["material"]!,
            zakladDane: "350.00",
            castka: "350.00",
            dilciId: expenseDoc.lines[0]!.dilciIds[0],
          },
        ],
      },
    })
  })
  await withOrganization(orgId, userId, async (db) => {
    console.log("\nPeněžní deník:")
    console.table(await penezniDenik(db))
    const out = await generateOutput(
      db,
      { organizationId: orgId, jednotkaId: seed.jednotkaId },
      seed.obdobiId,
    )
    console.log("\nVýstup:", out.figures)
  })
}

main().catch((err) => {
  console.error("demo failed:", err)
  process.exit(1)
})
