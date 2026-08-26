/**
 * DB-level invariants of the filing registry (migration 0005).
 *
 * Beta has no row-level security: the outer wall is the dedicated database, the
 * inner wall is the application scope seam. That makes these constraints,
 * triggers and mapping functions the only thing standing between a route-level
 * mistake and a broken invariant, so each one is exercised here against a real
 * Postgres 18 — the same contract `invariants.test.ts` holds for the core
 * schema.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import type {
  BetaFilingFamily,
  BetaFilingKind,
  BetaObligationGroup,
} from "./schema"
import { sharedDatabaseUrl, unique } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

async function createOrganization(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name)
    VALUES (${unique("org-")}, 'Testovací s.r.o.')
    RETURNING id
  `
  return row!.id
}

async function createPeriod(
  organizationId: string,
  values: {
    kind: "month" | "quarter" | "year"
    year?: number
    month?: number | null
    quarter?: number | null
  },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO reporting_period (organization_id, period_kind, year, month, quarter)
    VALUES (
      ${organizationId},
      ${values.kind},
      ${values.year ?? 2026},
      ${values.month ?? null},
      ${values.quarter ?? null}
    )
    RETURNING id
  `
  return row!.id
}

async function insertFiling(values: {
  organizationId: string
  periodId: string
  kind?: BetaFilingKind
  status?: string
  dueOn?: string
  filedOn?: string | null
  amountDue?: string | null
  paidAt?: string | null
  variableSymbol?: string | null
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO filing (
      organization_id, kind, period_id, due_on, status, filed_on,
      amount_due, paid_at, variable_symbol
    )
    VALUES (
      ${values.organizationId},
      ${values.kind ?? "dph_priznani"},
      ${values.periodId},
      ${values.dueOn ?? "2026-03-25"},
      ${values.status ?? "planned"},
      ${values.filedOn ?? null},
      ${values.amountDue ?? null},
      ${values.paidAt ?? null},
      ${values.variableSymbol ?? null}
    )
    RETURNING id
  `
  return row!.id
}

describe("reporting_period", () => {
  it("derives the boundaries of all three period shapes", async () => {
    const organizationId = await createOrganization()
    const ids = await Promise.all([
      createPeriod(organizationId, { kind: "month", month: 2 }),
      createPeriod(organizationId, { kind: "quarter", quarter: 4 }),
      createPeriod(organizationId, { kind: "year" }),
    ])

    const rows = await sql<
      { period_kind: string; starts_on: string; ends_on: string }[]
    >`
      SELECT period_kind, starts_on::text, ends_on::text
        FROM reporting_period WHERE id = ANY(${ids})
       ORDER BY period_kind
    `
    expect(rows).toEqual([
      // February 2026 is not a leap year — the derived end is the real one, not
      // a hardcoded 30 or 31.
      { period_kind: "month", starts_on: "2026-02-01", ends_on: "2026-02-28" },
      {
        period_kind: "quarter",
        starts_on: "2026-10-01",
        ends_on: "2026-12-31",
      },
      { period_kind: "year", starts_on: "2026-01-01", ends_on: "2026-12-31" },
    ])
  })

  it("derives February correctly in a leap year too", async () => {
    const organizationId = await createOrganization()
    const id = await createPeriod(organizationId, {
      kind: "month",
      year: 2028,
      month: 2,
    })
    const [row] = await sql<{ ends_on: string }[]>`
      SELECT ends_on::text FROM reporting_period WHERE id = ${id}
    `
    expect(row!.ends_on).toBe("2028-02-29")
  })

  it("refuses to have its boundaries written by hand", async () => {
    const organizationId = await createOrganization()
    await expect(sql`
      INSERT INTO reporting_period (organization_id, period_kind, year, month, starts_on)
      VALUES (${organizationId}, 'month', 2026, 1, '2020-01-01')
    `).rejects.toThrow(/cannot insert a non-DEFAULT value into column/)
  })

  /**
   * THE INVARIANT IS "UNREPRESENTABLE", NOT A PARTICULAR ERROR STRING. A shape
   * the spec does not describe is refused by up to three floors at once, and
   * Postgres does not promise which of them reports first:
   *
   *   - `reporting_period_shape`, the CHECK that states the rule;
   *   - the NOT NULL on `starts_on`, whose generating expression evaluates to
   *     NULL when the coordinate its kind needs is absent;
   *   - `make_date` inside that expression, which raises on month 13 (and on
   *     quarter 5, which is month 13 after `quarter * 3 - 2`).
   *
   * Asserting the CHECK's name specifically would make this test a hostage to
   * evaluation order. Each case below asserts what actually matters: the row is
   * not in the table afterwards.
   */
  it("enforces the per-kind shape", async () => {
    const organizationId = await createOrganization()

    const rejected: Parameters<typeof createPeriod>[1][] = [
      // A month period with no month, with a quarter riding along, or with a
      // month outside the year.
      { kind: "month", month: null },
      { kind: "month", month: 3, quarter: 1 },
      { kind: "month", month: 13 },
      { kind: "month", month: 0 },
      // A quarter period with no quarter, or one that does not exist.
      { kind: "quarter", quarter: null },
      { kind: "quarter", quarter: 5 },
      { kind: "quarter", quarter: 0 },
      // A year period carrying either coordinate.
      { kind: "year", month: 6 },
      { kind: "year", quarter: 2 },
    ]

    for (const shape of rejected) {
      await expect(
        createPeriod(organizationId, shape),
        JSON.stringify(shape),
      ).rejects.toThrow()
    }

    const [remaining] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM reporting_period
       WHERE organization_id = ${organizationId}
    `
    expect(remaining!.count).toBe(0)

    // Non-vacuous: the three legal shapes go in.
    await expect(
      createPeriod(organizationId, { kind: "month", month: 3 }),
    ).resolves.toBeTruthy()
    await expect(
      createPeriod(organizationId, { kind: "quarter", quarter: 1 }),
    ).resolves.toBeTruthy()
    await expect(
      createPeriod(organizationId, { kind: "year" }),
    ).resolves.toBeTruthy()
  })

  it("bounds the year", async () => {
    const organizationId = await createOrganization()
    await expect(
      createPeriod(organizationId, { kind: "year", year: 1999 }),
    ).rejects.toThrow(/reporting_period_year_range/)
    await expect(
      createPeriod(organizationId, { kind: "year", year: 2101 }),
    ).rejects.toThrow(/reporting_period_year_range/)
  })

  it("allows exactly one period per (organization, kind, year, month, quarter)", async () => {
    const organizationId = await createOrganization()

    await createPeriod(organizationId, { kind: "month", month: 7 })
    await expect(
      createPeriod(organizationId, { kind: "month", month: 7 }),
    ).rejects.toThrow(/reporting_period_identity_unique/)

    // The NULLS NOT DISTINCT half: under the DEFAULT NULLS DISTINCT both of
    // these year rows would insert, because (NULL, NULL) never equals itself.
    await createPeriod(organizationId, { kind: "year" })
    await expect(
      createPeriod(organizationId, { kind: "year" }),
    ).rejects.toThrow(/reporting_period_identity_unique/)

    // A quarter and a month that both cover July are different periods.
    await expect(
      createPeriod(organizationId, { kind: "quarter", quarter: 3 }),
    ).resolves.toBeTruthy()

    // And the constraint is per organization, not global.
    const other = await createOrganization()
    await expect(
      createPeriod(other, { kind: "month", month: 7 }),
    ).resolves.toBeTruthy()
  })

  it("freezes the identity — a period is created, never renamed", async () => {
    const organizationId = await createOrganization()
    const other = await createOrganization()
    const id = await createPeriod(organizationId, { kind: "month", month: 5 })

    for (const patch of [
      sql`UPDATE reporting_period SET year = 2027 WHERE id = ${id}`,
      sql`UPDATE reporting_period SET month = 6 WHERE id = ${id}`,
      sql`UPDATE reporting_period SET period_kind = 'year', month = NULL WHERE id = ${id}`,
      sql`UPDATE reporting_period SET organization_id = ${other} WHERE id = ${id}`,
    ]) {
      await expect(patch).rejects.toThrow(
        /reporting_period identity is immutable/,
      )
    }
  })

  it("goes away with its organization", async () => {
    const organizationId = await createOrganization()
    await createPeriod(organizationId, { kind: "year" })
    await sql`DELETE FROM organization WHERE id = ${organizationId}`
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM reporting_period
       WHERE organization_id = ${organizationId}
    `
    expect(row!.count).toBe(0)
  })
})

describe("filing", () => {
  it("refuses a period belonging to another organization", async () => {
    const home = await createOrganization()
    const foreign = await createOrganization()
    const foreignPeriod = await createPeriod(foreign, {
      kind: "month",
      month: 1,
    })

    // The single-column FK would accept this: `foreignPeriod` is a real
    // reporting_period id. The COMPOSITE FK carries organization_id, so the
    // cross-tenant reference is not representable.
    await expect(
      insertFiling({ organizationId: home, periodId: foreignPeriod }),
    ).rejects.toThrow(/filing_period_fk/)
  })

  it("refuses to delete a period that filings are stamped with", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 4,
    })
    await insertFiling({ organizationId, periodId })

    await expect(
      sql`DELETE FROM reporting_period WHERE id = ${periodId}`,
    ).rejects.toThrow(/filing_period_fk/)
  })

  it("keeps status and filed_on coherent, both directions", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 8,
    })

    // "Podáno" with no filing date behind the chip.
    await expect(
      insertFiling({ organizationId, periodId, status: "filed" }),
    ).rejects.toThrow(/filing_filed_coherence/)
    await expect(
      insertFiling({ organizationId, periodId, status: "confirmed" }),
    ).rejects.toThrow(/filing_filed_coherence/)
    await expect(
      insertFiling({ organizationId, periodId, status: "corrective" }),
    ).rejects.toThrow(/filing_filed_coherence/)

    // A filing date under a row claiming nothing was filed.
    await expect(
      insertFiling({ organizationId, periodId, filedOn: "2026-08-20" }),
    ).rejects.toThrow(/filing_filed_coherence/)

    await expect(
      insertFiling({
        organizationId,
        periodId,
        status: "filed",
        filedOn: "2026-08-20",
      }),
    ).resolves.toBeTruthy()
  })

  it("refuses a payment of an amount nobody stated", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 9,
    })

    await expect(
      insertFiling({ organizationId, periodId, paidAt: "2026-09-25" }),
    ).rejects.toThrow(/filing_paid_requires_amount/)

    // A záloha is PAID without ever being FILED — `planned` + paid_at is a
    // legitimate row and must stay reachable.
    await expect(
      insertFiling({
        organizationId,
        periodId,
        kind: "dppo_zaloha",
        status: "planned",
        amountDue: "45000.00",
        paidAt: "2026-09-15",
      }),
    ).resolves.toBeTruthy()
  })

  it("stores money as numeric(14,2), sign and scale intact", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 10,
    })

    const id = await insertFiling({
      organizationId,
      periodId,
      // A nadměrný odpočet: the FÚ owes the client. Negative is legitimate.
      amountDue: "-12345.67",
    })
    const [row] = await sql<{ amount_due: string }[]>`
      SELECT amount_due FROM filing WHERE id = ${id}
    `
    // A string all the way through — never a float, and never re-scaled.
    expect(row!.amount_due).toBe("-12345.67")
    expect(typeof row!.amount_due).toBe("string")

    const big = await insertFiling({
      organizationId,
      periodId,
      amountDue: "123456789012.34",
    })
    const [bigRow] = await sql<{ amount_due: string }[]>`
      SELECT amount_due FROM filing WHERE id = ${big}
    `
    expect(bigRow!.amount_due).toBe("123456789012.34")
  })

  it("constrains the variabilní symbol to 1-10 digits", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 11,
    })

    for (const variableSymbol of ["", "12345678901", "12a45", "12 45"]) {
      await expect(
        insertFiling({ organizationId, periodId, variableSymbol }),
      ).rejects.toThrow(/filing_variable_symbol_digits|value too long/)
    }
    await expect(
      insertFiling({ organizationId, periodId, variableSymbol: "1234567890" }),
    ).resolves.toBeTruthy()
  })

  it("never lets a filing change books", async () => {
    const organizationId = await createOrganization()
    const other = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 12,
    })
    const id = await insertFiling({ organizationId, periodId })

    await expect(
      sql`UPDATE filing SET organization_id = ${other} WHERE id = ${id}`,
    ).rejects.toThrow(/organization_id is immutable/)
  })

  it("touches updated_at on every edit — the §2.4 freshness stamp", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "quarter",
      quarter: 1,
    })
    const id = await insertFiling({ organizationId, periodId })

    // Compared as TEXT, at Postgres's own microsecond resolution. A JavaScript
    // Date truncates to milliseconds, and two statements this close together
    // land inside the same millisecond often enough to make that comparison
    // flake — which would look like the trigger being broken.
    const [before] = await sql<{ stamp: string }[]>`
      SELECT updated_at::text AS stamp FROM filing WHERE id = ${id}
    `
    await sql`UPDATE filing SET amount_due = '1000.00' WHERE id = ${id}`
    const [after] = await sql<{ stamp: string }[]>`
      SELECT updated_at::text AS stamp FROM filing WHERE id = ${id}
    `
    expect(after!.stamp > before!.stamp).toBe(true)
  })

  it("permits a second filing for the same period — that is what a correction is", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 6,
    })

    await insertFiling({
      organizationId,
      periodId,
      status: "filed",
      filedOn: "2026-07-25",
    })
    await expect(
      insertFiling({
        organizationId,
        periodId,
        status: "corrective",
        filedOn: "2026-08-10",
      }),
    ).resolves.toBeTruthy()
  })

  it("goes away with its organization", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, { kind: "year" })
    await insertFiling({ organizationId, periodId })

    await sql`DELETE FROM organization WHERE id = ${organizationId}`
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM filing
       WHERE organization_id = ${organizationId}
    `
    expect(row!.count).toBe(0)
  })
})

describe("the document foreign keys 0004 left for 0005", () => {
  /** A `document` row, built to satisfy `document_storage_key_shape`. */
  async function createDocument(
    organizationId: string,
    payslipPeriodId: string | null = null,
  ): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256, payslip_period_id
      )
      VALUES (
        ${organizationId}, 'potvrzeni.pdf',
        'org/' || ${organizationId}::text || '/' || gen_random_uuid()::text || '.pdf',
        'application/pdf', 'pdf', 1024,
        md5(random()::text) || md5(random()::text),
        ${payslipPeriodId}
      )
      RETURNING id
    `
    return row!.id
  }

  it("refuses a filing pointing at another organization's document", async () => {
    const home = await createOrganization()
    const foreign = await createOrganization()
    const periodId = await createPeriod(home, { kind: "month", month: 1 })
    const foreignDocument = await createDocument(foreign)

    const filingId = await insertFiling({
      organizationId: home,
      periodId,
    })

    // A single-column FK would accept this — `foreignDocument` is a real
    // document id. The composite one carries organization_id.
    await expect(
      sql`UPDATE filing SET document_id = ${foreignDocument} WHERE id = ${filingId}`,
    ).rejects.toThrow(/filing_document_fk/)
  })

  it("keeps the filing and clears the link when a document is hard-deleted", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 2,
    })
    const documentId = await createDocument(organizationId)
    const filingId = await insertFiling({ organizationId, periodId })
    await sql`UPDATE filing SET document_id = ${documentId} WHERE id = ${filingId}`

    // PR 37's retention purge, or an operator. The filing is the record that
    // has to survive: an accountant's proof that a přiznání was filed does not
    // stop being true because its scan was purged.
    await sql`DELETE FROM document WHERE id = ${documentId}`

    const [row] = await sql<{ document_id: string | null }[]>`
      SELECT document_id FROM filing WHERE id = ${filingId}
    `
    expect(row).toBeDefined()
    expect(row!.document_id).toBeNull()

    // And organization_id survived: the column-list form of SET NULL touched
    // only `document_id`. A bare SET NULL would have tried to null a NOT NULL
    // column and turned this delete into a constraint violation.
    const [still] = await sql<{ organization_id: string }[]>`
      SELECT organization_id FROM filing WHERE id = ${filingId}
    `
    expect(still!.organization_id).toBe(organizationId)
  })

  it("refuses a payslip stamped with another organization's period", async () => {
    const home = await createOrganization()
    const foreign = await createOrganization()
    const foreignPeriod = await createPeriod(foreign, {
      kind: "month",
      month: 3,
    })

    await expect(createDocument(home, foreignPeriod)).rejects.toThrow(
      /document_payslip_period_fk/,
    )
  })

  it("refuses to delete a period a payslip is stamped with", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, {
      kind: "month",
      month: 4,
    })
    await createDocument(organizationId, periodId)

    await expect(
      sql`DELETE FROM reporting_period WHERE id = ${periodId}`,
    ).rejects.toThrow(/document_payslip_period_fk/)
  })

  /**
   * The RESTRICT arms above must not turn an organization delete into a
   * deadlock of its own children. `organization` cascades to reporting_period,
   * filing AND document, and two of the three FKs between those children are
   * RESTRICT — so this is the case that proves the cascade still completes.
   */
  it("still lets the whole organization be deleted, RESTRICT arms and all", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId, { kind: "year" })
    const documentId = await createDocument(organizationId, periodId)
    const filingId = await insertFiling({ organizationId, periodId })
    await sql`UPDATE filing SET document_id = ${documentId} WHERE id = ${filingId}`

    await sql`DELETE FROM organization WHERE id = ${organizationId}`

    const [counts] = await sql<
      { periods: number; filings: number; documents: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM reporting_period WHERE organization_id = ${organizationId}) AS periods,
        (SELECT count(*)::int FROM filing WHERE organization_id = ${organizationId}) AS filings,
        (SELECT count(*)::int FROM document WHERE organization_id = ${organizationId}) AS documents
    `
    expect(counts).toEqual({ periods: 0, filings: 0, documents: 0 })
  })
})

describe("the constant mappings over filing.kind", () => {
  /**
   * TOTALITY FIRST. Neither function has an ELSE arm, so a kind added to the
   * enum without an arm returns NULL rather than being quietly filed under
   * Ostatní. This is the case that fails when that happens.
   */
  it("maps every kind in the enum to a family and a creditor group", async () => {
    const rows = await sql<
      {
        kind: BetaFilingKind
        family: BetaFilingFamily | null
        obligation_group: BetaObligationGroup | null
      }[]
    >`
      SELECT k::text                              AS kind,
             beta_filing_family(k)::text          AS family,
             beta_filing_obligation_group(k)::text AS obligation_group
        FROM unnest(enum_range(NULL::beta_filing_kind)) k
    `

    expect(rows.length).toBeGreaterThan(0)
    const unmapped = rows.filter(
      (row) => row.family === null || row.obligation_group === null,
    )
    expect(unmapped.map((row) => row.kind)).toEqual([])
  })

  it("puts each kind in the family spec §2.3 puts it in", async () => {
    const rows = await sql<
      { kind: BetaFilingKind; family: BetaFilingFamily }[]
    >`
      SELECT k::text AS kind, beta_filing_family(k)::text AS family
        FROM unnest(enum_range(NULL::beta_filing_kind)) k
    `
    expect(Object.fromEntries(rows.map((r) => [r.kind, r.family]))).toEqual({
      // §2.3 DPH: "Přiznání + KH + SH".
      dph_priznani: "dph",
      dph_kontrolni_hlaseni: "dph",
      dph_souhrnne_hlaseni: "dph",
      // §2.3 Daň z příjmů: "DPPO + zálohy schedule + závěrka row".
      dppo_priznani: "dan_z_prijmu",
      dppo_zaloha: "dan_z_prijmu",
      ucetni_zaverka: "dan_z_prijmu",
      // §2.3 Mzdové odvody a hlášení: "Vyúčtování, Přehled ČSSZ, Přehledy ZP,
      // JMHZ (mandatory from 04/2026)".
      vyuctovani_dane: "mzdove_odvody",
      prehled_cssz: "mzdove_odvody",
      prehled_zp: "mzdove_odvody",
      jmhz: "mzdove_odvody",
      // §2.3 Ostatní: "silniční (data-driven), ostatní".
      silnicni_dan: "ostatni",
      ostatni: "ostatni",
    })
  })

  it("groups by creditor, which is NOT the family with different labels", async () => {
    const rows = await sql<
      { kind: BetaFilingKind; obligation_group: BetaObligationGroup }[]
    >`
      SELECT k::text AS kind, beta_filing_obligation_group(k)::text AS obligation_group
        FROM unnest(enum_range(NULL::beta_filing_kind)) k
    `
    const byKind = Object.fromEntries(
      rows.map((r) => [r.kind, r.obligation_group]),
    )

    // The two mappings genuinely differ, which is why they are two functions:
    // a payroll FILING owed to the finanční úřad, and an Ostatní-family tax also
    // owed to the FÚ.
    expect(byKind["vyuctovani_dane"]).toBe("fu")
    expect(byKind["silnicni_dan"]).toBe("fu")

    // JMHZ goes through ČSSZ as the single gateway.
    expect(byKind["jmhz"]).toBe("cssz_zp")
    expect(byKind["prehled_cssz"]).toBe("cssz_zp")
    expect(byKind["prehled_zp"]).toBe("cssz_zp")

    expect(byKind["ostatni"]).toBe("ostatni")

    // No filing kind is ever a supplier debt — `dodavatele` belongs to the
    // partner_saldo source (PR 28) alone.
    expect(Object.values(byKind)).not.toContain("dodavatele")
  })
})
