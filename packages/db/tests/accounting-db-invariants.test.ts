/**
 * Accounting Records System — DB-layer invariants (M1 / PR1).
 *
 * Proves the database enforces, as the app_user role under FORCE RLS:
 *   - organization_isolation on accounting tables (cross-tenant SELECT leak)
 *   - the cross-tenant composite-FK guard (FK checks bypass RLS, so a child in
 *     org B must not be able to reference a parent in org A)
 *   - R4 balanced double-entry (Σ MD = Σ Dal) + non-empty PODVOJNE zapis
 *   - R7 regime branch (a posting line cannot diverge from its unit's regime)
 *   - R12 closed-period rejection
 *   - R8 append-only postings (UPDATE/DELETE blocked)
 *   - R3 oznaceni (číselná řada) uniqueness per type+period
 *
 * Seeds via the admin (app_owner) client (bypasses RLS; triggers still fire),
 * asserts via the app_user client with app.organization_id set.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient, seedTwoOrganizations, truncateAll } from "./fixtures.js"
import postgres from "postgres"

let adminSql: postgres.Sql
let userSql: postgres.Sql

interface AccountingBaseline {
  jednotkaId: string
  obdobiId: string
  rozvrhId: string
  a504: string
  a321: string
  a343: string
  pripadId: string
  dokladId: string
  dilciId: string
}

/** Seed a full PODVOJNE accounting baseline for one organization. */
async function seedBaseline(
  sql: postgres.Sql,
  orgId: string,
  suffix: string,
): Promise<AccountingBaseline> {
  const [jednotka] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_jednotka (organization_id, regime, nazev, platce_dph)
    VALUES (${orgId}::uuid, 'PODVOJNE', ${"Unit " + suffix}, true)
    RETURNING id`
  const jednotkaId = jednotka!.id

  const [obdobi] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_obdobi (organization_id, jednotka_id, typ, od, "do", stav)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, 'kalendar', '2026-01-01', '2026-12-31', 'otevreno')
    RETURNING id`
  const obdobiId = obdobi!.id

  const [rozvrh] = await sql<Array<{ id: string }>>`
    INSERT INTO uctovy_rozvrh (organization_id, jednotka_id, rok)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, 2026)
    RETURNING id`
  const rozvrhId = rozvrh!.id

  const accounts = await sql<Array<{ id: string; cislo: string }>>`
    INSERT INTO ucet (organization_id, rozvrh_id, cislo, trida, typ)
    VALUES
      (${orgId}::uuid, ${rozvrhId}::uuid, '504', 5, 'N'),
      (${orgId}::uuid, ${rozvrhId}::uuid, '321', 3, 'P'),
      (${orgId}::uuid, ${rozvrhId}::uuid, '343', 3, 'A')
    RETURNING id, cislo`
  const byCislo = (c: string) => accounts.find((a) => a.cislo === c)!.id

  const [pripad] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_pripad (organization_id, jednotka_id, popis, datum_uskutecneni)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, 'nakup zbozi', '2026-03-01')
    RETURNING id`
  const pripadId = pripad!.id

  const [doklad] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_doklad (organization_id, jednotka_id, obdobi_id, typ, oznaceni, okamzik_vyhotoveni)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, ${obdobiId}::uuid, 'FP', 'FP-2026-001', now())
    RETURNING id`
  const dokladId = doklad!.id

  const [dr] = await sql<Array<{ id: string }>>`
    INSERT INTO doklad_radek (organization_id, doklad_id, pripad_id, popis, castka)
    VALUES (${orgId}::uuid, ${dokladId}::uuid, ${pripadId}::uuid, 'zbozi', 121)
    RETURNING id`
  const drId = dr!.id

  const [dilci] = await sql<Array<{ id: string }>>`
    INSERT INTO dilci_zaznam (organization_id, doklad_radek_id, druh, castka, dph_sazba, dph_castka)
    VALUES (${orgId}::uuid, ${drId}::uuid, 'zaklad', 100, 21, 21)
    RETURNING id`

  return {
    jednotkaId,
    obdobiId,
    rozvrhId,
    a504: byCislo("504"),
    a321: byCislo("321"),
    a343: byCislo("343"),
    pripadId,
    dokladId,
    dilciId: dilci!.id,
  }
}

/** Seed a balanced posted PODVOJNE zapis (3 lines: MD 504 100, MD 343 21, D 321 121). */
async function seedPostedZapis(
  sql: postgres.Sql,
  orgId: string,
  b: AccountingBaseline,
  userId: string,
): Promise<string> {
  // One transaction: the R4 deferred constraint trigger fires at COMMIT, so the
  // header + its lines must land together (else the empty-zapis check trips).
  return sql.begin(async (tx) => {
    const [zapis] = await tx<Array<{ id: string }>>`
      INSERT INTO ucetni_zapis
        (organization_id, jednotka_id, obdobi_id, doklad_id, pripad_id, datum, regime, druh, odpovedna_osoba, okamzik_zauctovani)
      VALUES
        (${orgId}::uuid, ${b.jednotkaId}::uuid, ${b.obdobiId}::uuid, ${b.dokladId}::uuid, ${b.pripadId}::uuid,
         '2026-03-01', 'PODVOJNE', 'slozeny', ${userId}::uuid, now())
      RETURNING id`
    const zapisId = zapis!.id
    await tx`
      INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, dilci_id, strana, castka)
      VALUES
        (${orgId}::uuid, ${zapisId}::uuid, 'PODVOJNE', ${b.a504}::uuid, ${b.dilciId}::uuid, 'MD', 100),
        (${orgId}::uuid, ${zapisId}::uuid, 'PODVOJNE', ${b.a343}::uuid, NULL, 'MD', 21),
        (${orgId}::uuid, ${zapisId}::uuid, 'PODVOJNE', ${b.a321}::uuid, NULL, 'D', 121)`
    return zapisId
  }) as Promise<string>
}

interface CashBookBaseline {
  orgId: string
  jednotkaId: string
  obdobiId: string
  dilciId: string
  zapisId: string
}

/**
 * Seed a JEDNODUCHE (cash-book) organization with one posted cash-book zapis +
 * penezni_denik_radek. Used to prove R7 routing: a cash-book posting cannot grow
 * a zapis_radek, and a double-entry posting cannot grow a penezni_denik_radek.
 */
async function seedCashBookOrg(
  sql: postgres.Sql,
  workspaceId: string,
  userId: string,
  slug: string,
): Promise<CashBookBaseline> {
  // natural_person (OSVČ) → legal_subject_kind must be NULL (organization CHECK).
  const [org] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind)
    VALUES (uuidv7(), ${workspaceId}::uuid, ${slug}, 'Cash Org', 'natural_person')
    RETURNING id`
  const orgId = org!.id

  const [jed] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_jednotka (organization_id, regime, nazev, platce_dph)
    VALUES (${orgId}::uuid, 'JEDNODUCHE', 'Cash Unit', false) RETURNING id`
  const jednotkaId = jed!.id

  const [obd] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_obdobi (organization_id, jednotka_id, typ, od, "do", stav)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, 'kalendar', '2026-01-01', '2026-12-31', 'otevreno')
    RETURNING id`
  const obdobiId = obd!.id

  const [prip] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_pripad (organization_id, jednotka_id, popis, datum_uskutecneni)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, 'platba', '2026-03-02') RETURNING id`
  const [dok] = await sql<Array<{ id: string }>>`
    INSERT INTO ucetni_doklad (organization_id, jednotka_id, obdobi_id, typ, oznaceni, okamzik_vyhotoveni)
    VALUES (${orgId}::uuid, ${jednotkaId}::uuid, ${obdobiId}::uuid, 'BV', 'BV-2026-001', now()) RETURNING id`
  const [dr] = await sql<Array<{ id: string }>>`
    INSERT INTO doklad_radek (organization_id, doklad_id, pripad_id, popis, castka)
    VALUES (${orgId}::uuid, ${dok!.id}::uuid, ${prip!.id}::uuid, 'platba', 121) RETURNING id`
  const [dilci] = await sql<Array<{ id: string }>>`
    INSERT INTO dilci_zaznam (organization_id, doklad_radek_id, druh, castka)
    VALUES (${orgId}::uuid, ${dr!.id}::uuid, 'zaklad', 121) RETURNING id`
  const dilciId = dilci!.id

  const zapisId = (await sql.begin(async (tx) => {
    const [z] = await tx<Array<{ id: string }>>`
      INSERT INTO ucetni_zapis
        (organization_id, jednotka_id, obdobi_id, doklad_id, pripad_id, datum, regime, druh, odpovedna_osoba, okamzik_zauctovani)
      VALUES (${orgId}::uuid, ${jednotkaId}::uuid, ${obdobiId}::uuid, ${dok!.id}::uuid, ${prip!.id}::uuid,
              '2026-03-02', 'JEDNODUCHE', 'jednoduchy', ${userId}::uuid, now()) RETURNING id`
    await tx`
      INSERT INTO penezni_denik_radek (organization_id, zapis_id, regime, dilci_id, misto, smer, danovy, castka)
      VALUES (${orgId}::uuid, ${z!.id}::uuid, 'JEDNODUCHE', ${dilciId}::uuid, 'banka', 'vydaj', true, 121)`
    return z!.id
  })) as string

  return { orgId, jednotkaId, obdobiId, dilciId, zapisId }
}

let orgAId: string
let orgBId: string
let userAId: string
let workspaceId: string
let baseA: AccountingBaseline
let baseB: AccountingBaseline
let zapisAId: string
let cashBook: CashBookBaseline

beforeAll(async () => {
  adminSql = adminClient()
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set")
  userSql = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })

  const seed = await seedTwoOrganizations(adminSql)
  orgAId = seed.orgAId
  orgBId = seed.orgBId
  userAId = seed.userAId
  workspaceId = seed.workspaceId

  baseA = await seedBaseline(adminSql, orgAId, "A")
  baseB = await seedBaseline(adminSql, orgBId, "B")
  zapisAId = await seedPostedZapis(adminSql, orgAId, baseA, userAId)
  cashBook = await seedCashBookOrg(adminSql, workspaceId, userAId, "cash-org-c")
}, 120_000)

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

/** Run a callback as app_user scoped to one organization. */
function asOrg<T>(
  orgId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return userSql.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('app.organization_id', '${orgId}', true)`,
    )
    return fn(tx)
  })
}

describe("accounting RLS isolation", () => {
  it("org A sees its own ucetni_zapis", async () => {
    const rows = await asOrg(orgAId, (tx) =>
      tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ucetni_zapis WHERE id = '${zapisAId}'::uuid`,
      ),
    )
    expect(rows.map((r) => r.id)).toContain(zapisAId)
  })

  it("org B sees zero rows for org A's ucetni_zapis", async () => {
    const rows = await asOrg(orgBId, (tx) =>
      tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ucetni_zapis WHERE id = '${zapisAId}'::uuid`,
      ),
    )
    expect(rows).toHaveLength(0)
  })

  it("org B sees zero of org A's doklady; empty GUC returns zero (NULLIF guard)", async () => {
    const crossOrg = await asOrg(orgBId, (tx) =>
      tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ucetni_doklad WHERE id = '${baseA.dokladId}'::uuid`,
      ),
    )
    expect(crossOrg).toHaveLength(0)

    const emptyGuc = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM ucetni_doklad`)
    })
    expect(emptyGuc).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT of a doklad with a foreign organization_id", async () => {
    await expect(
      asOrg(orgBId, async (tx) => {
        await tx.unsafe(
          `INSERT INTO ucetni_doklad (organization_id, jednotka_id, obdobi_id, typ, oznaceni, okamzik_vyhotoveni)
           VALUES ('${orgAId}'::uuid, '${baseA.jednotkaId}'::uuid, '${baseA.obdobiId}'::uuid, 'ID', 'LEAK-1', now())`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })
})

describe("cross-tenant composite-FK guard (FK checks bypass RLS)", () => {
  it("org B cannot attach a zapis_radek to org A's zapis (composite FK, not RLS)", async () => {
    // organization_id=B passes WITH CHECK (matches the GUC), but the composite
    // FK (zapis_id, organization_id, regime) → ucetni_zapis cannot match org A's
    // row — proving the tenancy guard is the FK, not RLS. Assert the specific
    // constraint so a regression to a single-column FK would fail this test.
    await expect(
      asOrg(orgBId, async (tx) => {
        await tx.unsafe(
          `INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, strana, castka)
           VALUES ('${orgBId}'::uuid, '${zapisAId}'::uuid, 'PODVOJNE', '${baseB.a504}'::uuid, 'MD', 1)`,
        )
      }),
    ).rejects.toThrow(/zapis_radek_zapis_fk/)
  })
})

describe("R4 — balanced + non-empty PODVOJNE (deferred constraint trigger)", () => {
  async function insertZapisWithLines(
    orgId: string,
    b: AccountingBaseline,
    lines: Array<{ ucet: string; strana: "MD" | "D"; castka: number }>,
  ): Promise<void> {
    await asOrg(orgId, async (tx) => {
      const [z] = await tx.unsafe<Array<{ id: string }>>(
        `INSERT INTO ucetni_zapis
           (organization_id, jednotka_id, obdobi_id, doklad_id, pripad_id, datum, regime, druh, odpovedna_osoba, okamzik_zauctovani)
         VALUES ('${orgId}'::uuid, '${b.jednotkaId}'::uuid, '${b.obdobiId}'::uuid, '${b.dokladId}'::uuid, '${b.pripadId}'::uuid,
                 '2026-04-01', 'PODVOJNE', 'slozeny', '${userAId}'::uuid, now())
         RETURNING id`,
      )
      for (const l of lines) {
        await tx.unsafe(
          `INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, strana, castka)
           VALUES ('${orgId}'::uuid, '${z!.id}'::uuid, 'PODVOJNE', '${l.ucet}'::uuid, '${l.strana}', ${l.castka})`,
        )
      }
    })
  }

  it("rejects an unbalanced posting at COMMIT", async () => {
    await expect(
      insertZapisWithLines(orgAId, baseA, [
        { ucet: baseA.a504, strana: "MD", castka: 100 },
        { ucet: baseA.a321, strana: "D", castka: 50 },
      ]),
    ).rejects.toThrow(/unbalanced/)
  })

  it("rejects a PODVOJNE zapis with no lines at COMMIT", async () => {
    await expect(insertZapisWithLines(orgAId, baseA, [])).rejects.toThrow(
      /no zapis_radek lines/,
    )
  })

  it("accepts a balanced posting", async () => {
    await expect(
      insertZapisWithLines(orgAId, baseA, [
        { ucet: baseA.a504, strana: "MD", castka: 100 },
        { ucet: baseA.a321, strana: "D", castka: 100 },
      ]),
    ).resolves.not.toThrow()
  })
})

describe("R12 — closed period rejects new postings", () => {
  it("rejects a new doklad in a closed period", async () => {
    await adminSql`UPDATE ucetni_obdobi SET stav = 'uzavreno' WHERE id = ${baseB.obdobiId}::uuid`
    try {
      await expect(
        asOrg(orgBId, async (tx) => {
          await tx.unsafe(
            `INSERT INTO ucetni_doklad (organization_id, jednotka_id, obdobi_id, typ, oznaceni, okamzik_vyhotoveni)
             VALUES ('${orgBId}'::uuid, '${baseB.jednotkaId}'::uuid, '${baseB.obdobiId}'::uuid, 'FV', 'FV-CLOSED-1', now())`,
          )
        }),
      ).rejects.toThrow(/closed \(uzavreno\)/)
    } finally {
      await adminSql`UPDATE ucetni_obdobi SET stav = 'otevreno' WHERE id = ${baseB.obdobiId}::uuid`
    }
  })
})

describe("R8 — postings are append-only", () => {
  it("blocks UPDATE of a posted zapis_radek", async () => {
    await expect(
      asOrg(orgAId, async (tx) => {
        await tx.unsafe(
          `UPDATE zapis_radek SET castka = 999 WHERE zapis_id = '${zapisAId}'::uuid`,
        )
      }),
    ).rejects.toThrow(/append-only/)
  })

  it("blocks DELETE of a posted ucetni_zapis", async () => {
    await expect(
      asOrg(orgAId, async (tx) => {
        await tx.unsafe(
          `DELETE FROM ucetni_zapis WHERE id = '${zapisAId}'::uuid`,
        )
      }),
    ).rejects.toThrow(/append-only/)
  })
})

describe("R3 — oznaceni (číselná řada) uniqueness", () => {
  it("rejects a duplicate (type, period, oznaceni)", async () => {
    await expect(
      asOrg(orgAId, async (tx) => {
        await tx.unsafe(
          `INSERT INTO ucetni_doklad (organization_id, jednotka_id, obdobi_id, typ, oznaceni, okamzik_vyhotoveni)
           VALUES ('${orgAId}'::uuid, '${baseA.jednotkaId}'::uuid, '${baseA.obdobiId}'::uuid, 'FP', 'FP-2026-001', now())`,
        )
      }),
    ).rejects.toThrow(/unique|duplicate/i)
  })
})

describe("R7 — regime routing (cash-book vs double-entry)", () => {
  it("accepts a penezni_denik_radek on a JEDNODUCHE zapis", async () => {
    await expect(
      asOrg(cashBook.orgId, async (tx) => {
        await tx.unsafe(
          `INSERT INTO penezni_denik_radek (organization_id, zapis_id, regime, misto, smer, danovy, castka)
           VALUES ('${cashBook.orgId}'::uuid, '${cashBook.zapisId}'::uuid, 'JEDNODUCHE', 'hotovost', 'prijem', false, 50)`,
        )
      }),
    ).resolves.not.toThrow()
  })

  it("rejects a penezni_denik_radek attached to a PODVOJNE zapis (regime FK leg)", async () => {
    // organization_id + CHECK pass; the composite FK's regime leg
    // (zapis_id, organization_id, regime=JEDNODUCHE) cannot match the PODVOJNE parent.
    await expect(
      asOrg(orgAId, async (tx) => {
        await tx.unsafe(
          `INSERT INTO penezni_denik_radek (organization_id, zapis_id, regime, misto, smer, danovy, castka)
           VALUES ('${orgAId}'::uuid, '${zapisAId}'::uuid, 'JEDNODUCHE', 'banka', 'vydaj', true, 1)`,
        )
      }),
    ).rejects.toThrow(/penezni_denik_radek_zapis_fk/)
  })

  it("rejects a zapis_radek with a non-PODVOJNE regime (CHECK)", async () => {
    await expect(
      asOrg(orgAId, async (tx) => {
        await tx.unsafe(
          `INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, strana, castka)
           VALUES ('${orgAId}'::uuid, '${zapisAId}'::uuid, 'JEDNODUCHE', '${baseA.a504}'::uuid, 'MD', 1)`,
        )
      }),
    ).rejects.toThrow(/zapis_radek_regime_chk|check/i)
  })
})

describe("R8 — corrections post into an OPEN period (storno)", () => {
  // A storno is a NEW ucetni_zapis (opravuje_zapis_id + oprava_typ) with negative
  // castka on the original sides (ČÚS 001). It must itself balance (R4) and may
  // only be posted into an OPEN period (no closed-period carve-out).
  async function postStorno(obdobiId: string): Promise<string> {
    return asOrg(orgAId, async (tx) => {
      const [z] = await tx.unsafe<Array<{ id: string }>>(
        `INSERT INTO ucetni_zapis
           (organization_id, jednotka_id, obdobi_id, doklad_id, pripad_id, opravuje_zapis_id, oprava_typ,
            datum, regime, druh, odpovedna_osoba, okamzik_zauctovani)
         VALUES ('${orgAId}'::uuid, '${baseA.jednotkaId}'::uuid, '${obdobiId}'::uuid, '${baseA.dokladId}'::uuid,
                 '${baseA.pripadId}'::uuid, '${zapisAId}'::uuid, 'storno',
                 '2026-03-05', 'PODVOJNE', 'slozeny', '${userAId}'::uuid, now())
         RETURNING id`,
      )
      const id = z!.id
      await tx.unsafe(
        `INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, strana, castka) VALUES
           ('${orgAId}'::uuid, '${id}'::uuid, 'PODVOJNE', '${baseA.a504}'::uuid, 'MD', -100),
           ('${orgAId}'::uuid, '${id}'::uuid, 'PODVOJNE', '${baseA.a343}'::uuid, 'MD', -21),
           ('${orgAId}'::uuid, '${id}'::uuid, 'PODVOJNE', '${baseA.a321}'::uuid, 'D', -121)`,
      )
      return id
    })
  }

  it("accepts a balanced storno in an open period, linked to the original", async () => {
    const id = await postStorno(baseA.obdobiId)
    const [row] = await adminSql<
      Array<{ opravuje_zapis_id: string; oprava_typ: string }>
    >`SELECT opravuje_zapis_id, oprava_typ FROM ucetni_zapis WHERE id = ${id}::uuid`
    expect(row?.opravuje_zapis_id).toBe(zapisAId)
    expect(row?.oprava_typ).toBe("storno")
  })

  it("rejects a correction into a closed period (no carve-out)", async () => {
    await adminSql`UPDATE ucetni_obdobi SET stav = 'uzavreno' WHERE id = ${baseA.obdobiId}::uuid`
    try {
      await expect(postStorno(baseA.obdobiId)).rejects.toThrow(
        /closed \(uzavreno\)/,
      )
    } finally {
      await adminSql`UPDATE ucetni_obdobi SET stav = 'otevreno' WHERE id = ${baseA.obdobiId}::uuid`
    }
  })
})
