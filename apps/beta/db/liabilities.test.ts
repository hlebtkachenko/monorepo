/**
 * DB-level invariants of the manual liability residue (migration 0006).
 *
 * Beta has no row-level security: the outer wall is the dedicated database, the
 * inner wall is the application scope seam. That makes these constraints and
 * triggers the only thing standing between a route-level mistake and a broken
 * invariant, so each one is exercised here against a real Postgres 18 — the same
 * contract `db/filings.test.ts` holds for the filing registry.
 *
 * The load-bearing one is `liability_group_is_residue`. It is what makes the
 * obligations union DISJOINT rather than merely conventional: `dodavatele`
 * belongs wholly to the imported saldokonto (PR 28), and a hand-typed supplier
 * payable standing next to its imported twin is Advisor defect F11 — the
 * triple-entry the derived read model exists to kill.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import type { BetaObligationGroup } from "./schema"
import { sharedDatabaseUrl, unique } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

async function createOrganization(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name)
    VALUES (${unique("org-")}, 'Testovaci s.r.o.')
    RETURNING id
  `
  return row!.id
}

async function insertLiability(values: {
  organizationId: string
  group?: BetaObligationGroup
  label?: string
  amount?: string
  dueOn?: string
  paidAt?: string | null
  variableSymbol?: string | null
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO liability (
      organization_id, creditor_group, label, amount, due_on,
      paid_at, variable_symbol
    )
    VALUES (
      ${values.organizationId},
      ${values.group ?? "ostatni"},
      ${values.label ?? "Penale z prodleni"},
      ${values.amount ?? "1500.00"},
      ${values.dueOn ?? "2026-04-30"},
      ${values.paidAt ?? null},
      ${values.variableSymbol ?? null}
    )
    RETURNING id
  `
  return row!.id
}

async function expectRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  await expect(run()).rejects.toThrow(constraint)
}

describe("liability_group_is_residue — the anti-triple-entry fence", () => {
  it("refuses `dodavatele`, whichever door the write comes through", async () => {
    const organizationId = await createOrganization()

    // The saldokonto import owns this group (§2.4, PR 28). Typing into it by
    // hand is exactly the defect the derived read model was designed against.
    await expectRefusal(
      () => insertLiability({ organizationId, group: "dodavatele" }),
      /liability_group_is_residue/,
    )
  })

  it("refuses a LATER move into `dodavatele` too, not just the insert", async () => {
    const organizationId = await createOrganization()
    const id = await insertLiability({ organizationId })

    await expectRefusal(
      () =>
        sql`UPDATE liability SET creditor_group = 'dodavatele' WHERE id = ${id}`,
      /liability_group_is_residue/,
    )
  })

  it("accepts the three groups the manual source may own", async () => {
    const organizationId = await createOrganization()

    // `ostatni` is the ordinary residue; `fu` and `cssz_zp` carry the residue
    // that HAS no filing row to duplicate — a penalty, interest, an installment
    // schedule. None of those is a form with a statutory deadline.
    for (const group of ["fu", "cssz_zp", "ostatni"] as const) {
      const id = await insertLiability({ organizationId, group })
      const [row] = await sql<{ creditor_group: string }[]>`
        SELECT creditor_group FROM liability WHERE id = ${id}
      `
      expect(row!.creditor_group).toBe(group)
    }
  })

  it("defaults to `ostatni` — §2.4's own case for the residue", async () => {
    const organizationId = await createOrganization()
    const [row] = await sql<{ creditor_group: string }[]>`
      INSERT INTO liability (organization_id, label, amount, due_on)
      VALUES (${organizationId}, 'Najemne', '12000.00', '2026-05-15')
      RETURNING creditor_group
    `
    expect(row!.creditor_group).toBe("ostatni")
  })

  it("has no column that could name a filing — the second fence", async () => {
    // The union cannot show the same debt twice because a liability cannot BE a
    // filing's money: there is nowhere to say so. If a `filing_id` ever appears
    // here, the dedup question stops being structural and this test is the
    // place that says so out loud.
    const columns = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'liability'
       ORDER BY column_name
    `
    expect(columns.map((c) => c.column_name)).not.toContain("filing_id")
  })
})

describe("liability value constraints", () => {
  it("refuses a non-positive amount — a receivable is not a negative debt", async () => {
    const organizationId = await createOrganization()

    for (const amount of ["0.00", "-1.00"]) {
      await expectRefusal(
        () => insertLiability({ organizationId, amount }),
        /liability_amount_positive/,
      )
    }
  })

  it("refuses a blank titul, spaces included", async () => {
    const organizationId = await createOrganization()

    for (const label of ["", "   "]) {
      await expectRefusal(
        () => insertLiability({ organizationId, label }),
        /liability_label_present/,
      )
    }
  })

  it("refuses a variabilní symbol that is not 1-10 digits", async () => {
    const organizationId = await createOrganization()

    for (const variableSymbol of ["", "abc", "1234-5678"]) {
      await expectRefusal(
        () => insertLiability({ organizationId, variableSymbol }),
        /liability_variable_symbol_digits/,
      )
    }

    // An 11-digit VS is refused one layer earlier, by `varchar(10)` itself —
    // the type is the length rule and the CHECK is the alphabet rule, so this
    // asserts the refusal rather than which constraint names it.
    await expect(
      insertLiability({ organizationId, variableSymbol: "12345678901" }),
    ).rejects.toThrow(/too long/)

    const id = await insertLiability({
      organizationId,
      variableSymbol: "1234567890",
    })
    expect(id).toBeTruthy()
  })

  it("keeps money at numeric(14,2) — no rounding, no float", async () => {
    const organizationId = await createOrganization()
    const id = await insertLiability({ organizationId, amount: "12345678.91" })

    const [row] = await sql<{ amount: string }[]>`
      SELECT amount FROM liability WHERE id = ${id}
    `
    expect(row!.amount).toBe("12345678.91")
    expect(typeof row!.amount).toBe("string")
  })
})

describe("liability triggers", () => {
  it("moves updated_at on every edit — it is the §2.4 source stamp", async () => {
    const organizationId = await createOrganization()
    const id = await insertLiability({ organizationId })

    // Read as an epoch string, not as a `Date`: `now()` has microsecond
    // resolution and two statements on a local socket land inside the same
    // millisecond, so a `Date.getTime()` comparison is flaky by construction.
    const stamp = async (): Promise<string> => {
      const [row] = await sql<{ at: string }[]>`
        SELECT extract(epoch FROM updated_at)::text AS at
          FROM liability WHERE id = ${id}
      `
      return row!.at
    }

    const before = await stamp()
    await sql`UPDATE liability SET label = 'Urok z prodleni' WHERE id = ${id}`
    const after = await stamp()

    expect(Number(after)).toBeGreaterThan(Number(before))
  })

  it("refuses to move a liability into another organization's book", async () => {
    const organizationId = await createOrganization()
    const foreignId = await createOrganization()
    const id = await insertLiability({ organizationId })

    await expectRefusal(
      () =>
        sql`UPDATE liability SET organization_id = ${foreignId} WHERE id = ${id}`,
      /organization_id is immutable/,
    )
  })

  it("goes with the organization when the book is deleted", async () => {
    const organizationId = await createOrganization()
    await insertLiability({ organizationId })

    await sql`DELETE FROM organization WHERE id = ${organizationId}`
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM liability WHERE organization_id = ${organizationId}
    `
    expect(rows).toEqual([])
  })
})
