/**
 * DB-level invariants of the partner registry and the saldokonto payload table
 * (migration 0015).
 *
 * Beta has no row-level security: the outer wall is the dedicated database, the
 * inner wall is the application scope seam. That makes these constraints and
 * triggers the only thing standing between a route-level mistake and a broken
 * invariant, so each one is exercised here against a real Postgres 18 — the same
 * contract `db/liabilities.test.ts` holds for the manual residue.
 *
 * THE TWO LOAD-BEARING ONES:
 *
 *   `partner_ico_idx` — one IČO is one partner per book. It is what makes the
 *     import's match order enforceable rather than merely intended: two rows
 *     carrying one legal person would split that counterparty's saldo across two
 *     lines of Pohledávky, and the client would read two smaller debts.
 *   `partner_saldo_payable_has_oldest_due` — a stated payable carries the date
 *     it is due, because the obligations union lists it WITH that date and a
 *     dateless one would be silently dropped from Dluhy a platby. Hiding a debt
 *     is the worse error.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import type { BetaPartnerRole, BetaPartnerSource } from "./schema"
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

async function insertPartner(values: {
  organizationId: string
  name?: string
  ico?: string | null
  dic?: string | null
  role?: BetaPartnerRole
  source?: BetaPartnerSource
  externalRef?: string | null
  countryCode?: string
  postalCode?: string | null
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO partner (
      organization_id, name, ico, dic, partner_role, source, external_ref,
      country_code, postal_code
    )
    VALUES (
      ${values.organizationId},
      ${values.name ?? "ACME s.r.o."},
      ${values.ico ?? null},
      ${values.dic ?? null},
      ${values.role ?? "other"},
      ${values.source ?? "manual"},
      ${values.externalRef ?? null},
      ${values.countryCode ?? "CZ"},
      ${values.postalCode ?? null}
    )
    RETURNING id
  `
  return row!.id
}

async function createPeriod(organizationId: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO reporting_period (organization_id, period_kind, year, month)
    VALUES (${organizationId}, 'month', 2026, 7)
    RETURNING id
  `
  return row!.id
}

async function createBatch(
  organizationId: string,
  periodId: string,
  dataset = "saldokonto",
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO import_batch (organization_id, period_id, dataset, status, source)
    VALUES (${organizationId}, ${periodId}, ${dataset}, 'draft', 'agent')
    RETURNING id
  `
  return row!.id
}

async function insertSaldo(values: {
  organizationId: string
  batchId: string
  partnerId: string
  periodId: string
  receivableTotal?: string | null
  payableTotal?: string | null
  oldestDue?: string | null
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO partner_saldo (
      organization_id, import_batch_id, partner_id, period_id,
      receivable_total, payable_total, oldest_due
    )
    VALUES (
      ${values.organizationId},
      ${values.batchId},
      ${values.partnerId},
      ${values.periodId},
      ${values.receivableTotal ?? null},
      ${values.payableTotal ?? null},
      ${values.oldestDue ?? null}
    )
    RETURNING id
  `
  return row!.id
}

describe("partner — identity", () => {
  it("refuses a blank name", async () => {
    const organizationId = await createOrganization()
    await expect(
      insertPartner({ organizationId, name: "   " }),
    ).rejects.toThrow(/partner_name_present/)
  })

  it("refuses an IČO that is not eight digits", async () => {
    const organizationId = await createOrganization()
    // A seven-digit IČO an export left unpadded is the exact input that would
    // create a SECOND partner for a company that already has one, because the
    // match key would not find the padded row.
    await expect(
      insertPartner({ organizationId, ico: "1234567" }),
    ).rejects.toThrow(/partner_ico_shape/)
    await expect(
      insertPartner({ organizationId, ico: "1234567a" }),
    ).rejects.toThrow(/partner_ico_shape/)
  })

  it("accepts a DIČ of any shape — a foreign VAT id is not CZ-shaped", async () => {
    const organizationId = await createOrganization()
    await expect(
      insertPartner({ organizationId, dic: "ATU12345678" }),
    ).resolves.toBeTruthy()
  })

  it("allows one IČO once per book, and the same one in another book", async () => {
    const first = await createOrganization()
    const second = await createOrganization()

    await insertPartner({ organizationId: first, ico: "12345678" })
    // The same legal person twice in ONE book is what would split a supplier's
    // saldo across two lines of Pohledávky.
    await expect(
      insertPartner({ organizationId: first, ico: "12345678", name: "Jiny" }),
    ).rejects.toThrow(/partner_ico_idx/)
    // Two offices' clients can both trade with the same supplier. The index is
    // per organization for exactly that reason.
    await expect(
      insertPartner({ organizationId: second, ico: "12345678" }),
    ).resolves.toBeTruthy()
  })

  it("allows any number of partners with no IČO at all", async () => {
    const organizationId = await createOrganization()
    // A foreign supplier and a natural person both legitimately have none, and
    // the unique index is partial so they do not collide on NULL.
    await insertPartner({ organizationId, name: "Foreign GmbH" })
    await expect(
      insertPartner({ organizationId, name: "Jan Novak" }),
    ).resolves.toBeTruthy()
  })

  it("allows two partners with the same NAME — a name is not an identity", async () => {
    const organizationId = await createOrganization()
    await insertPartner({ organizationId, name: "Stavby s.r.o." })
    await expect(
      insertPartner({ organizationId, name: "Stavby s.r.o." }),
    ).resolves.toBeTruthy()
  })

  it("allows one external_ref once per book, and none any number of times", async () => {
    const organizationId = await createOrganization()
    await insertPartner({ organizationId, externalRef: "money-1" })
    await expect(
      insertPartner({ organizationId, externalRef: "money-1", name: "Jiny" }),
    ).rejects.toThrow(/partner_external_ref_idx/)
    // Office-typed rows carry no ref and are never claimed by an import run.
    await insertPartner({ organizationId, name: "Rucne A" })
    await expect(
      insertPartner({ organizationId, name: "Rucne B" }),
    ).resolves.toBeTruthy()
  })
})

describe("partner — the two freezes", () => {
  it("refuses to move a partner to another organization", async () => {
    const first = await createOrganization()
    const second = await createOrganization()
    const partnerId = await insertPartner({ organizationId: first })

    await expect(
      sql`UPDATE partner SET organization_id = ${second} WHERE id = ${partnerId}`,
    ).rejects.toThrow(/organization_id is immutable/)
  })

  it("refuses to change a partner's source", async () => {
    const organizationId = await createOrganization()
    const partnerId = await insertPartner({
      organizationId,
      source: "saldokonto",
      externalRef: "money-2",
    })

    // `source` records the row's ORIGIN. An import ADOPTING a hand-typed partner
    // claims its `external_ref` and leaves `source` alone — the origin is still
    // "the office typed this", and that stays answerable.
    await expect(
      sql`UPDATE partner SET source = 'manual' WHERE id = ${partnerId}`,
    ).rejects.toThrow(/partner.source records the row origin/)
  })

  it("moves updated_at on an office edit", async () => {
    const organizationId = await createOrganization()
    const partnerId = await insertPartner({ organizationId })
    const [before] = await sql<{ updated_at: Date }[]>`
      SELECT updated_at FROM partner WHERE id = ${partnerId}
    `
    await sql`UPDATE partner SET city = 'Brno' WHERE id = ${partnerId}`
    const [after] = await sql<{ updated_at: Date }[]>`
      SELECT updated_at FROM partner WHERE id = ${partnerId}
    `
    expect(after!.updated_at.getTime()).toBeGreaterThanOrEqual(
      before!.updated_at.getTime(),
    )
  })
})

describe("partner_saldo — what a row may state", () => {
  it("refuses a row that states neither side", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })

    await expect(
      insertSaldo({ organizationId, batchId, partnerId, periodId }),
    ).rejects.toThrow(/partner_saldo_states_something/)
  })

  it("refuses a negative total on either side", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })

    // A negative receivable IS a payable. Storing one as the other's negation
    // would make the two Pohledávky columns and the obligations union disagree
    // about the same row, and the Dodavatelé arm would hide a real debt behind
    // a minus sign.
    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId,
        periodId,
        receivableTotal: "-100.00",
      }),
    ).rejects.toThrow(/partner_saldo_totals_nonnegative/)
    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId,
        periodId,
        payableTotal: "-100.00",
        oldestDue: "2026-06-30",
      }),
    ).rejects.toThrow(/partner_saldo_totals_nonnegative/)
  })

  it("refuses a stated payable with no splatnost", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })

    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId,
        periodId,
        payableTotal: "1000.00",
      }),
    ).rejects.toThrow(/partner_saldo_payable_has_oldest_due/)
  })

  it("allows a receivable-only row with no splatnost, and a settled zero", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const receivableOnly = await insertPartner({ organizationId, name: "A" })
    const settled = await insertPartner({ organizationId, name: "B" })

    // A receivable owes nobody a deadline, and Pohledávky renders the absent
    // date as absent.
    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId: receivableOnly,
        periodId,
        receivableTotal: "5000.00",
      }),
    ).resolves.toBeTruthy()
    // A settled supplier is a MEASURED zero and never reaches the debt list, so
    // it needs no date either.
    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId: settled,
        periodId,
        payableTotal: "0.00",
      }),
    ).resolves.toBeTruthy()
  })

  it("allows one row per partner per batch and no second", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })

    await insertSaldo({
      organizationId,
      batchId,
      partnerId,
      periodId,
      receivableTotal: "100.00",
    })
    // A re-run of a partial import would otherwise double the partner's saldo,
    // and the total the client reads would be exactly twice the truth.
    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId,
        periodId,
        receivableTotal: "100.00",
      }),
    ).rejects.toThrow(/partner_saldo_identity_unique/)
  })
})

describe("partner_saldo — the batch contract", () => {
  it("refuses a row in a batch that is not a saldokonto", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const predvaha = await createBatch(organizationId, periodId, "predvaha")
    const partnerId = await insertPartner({ organizationId })

    await expect(
      insertSaldo({
        organizationId,
        batchId: predvaha,
        partnerId,
        periodId,
        receivableTotal: "1.00",
      }),
    ).rejects.toThrow(/does not belong to a predvaha batch/)
  })

  it("refuses a row written into a published batch", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })
    await sql`
      UPDATE import_batch SET status = 'published', published_at = now()
       WHERE id = ${batchId}
    `

    // A correction is a NEW batch published over the old one (§3.2). If a row
    // could be added under a live batch, the client's page would change with no
    // supersession recorded and nothing in the history to explain it.
    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId,
        periodId,
        receivableTotal: "1.00",
      }),
    ).rejects.toThrow(/frozen once the batch leaves draft/)
  })

  it("refuses a row stamped with a period other than its batch's", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })
    const [other] = await sql<{ id: string }[]>`
      INSERT INTO reporting_period (organization_id, period_kind, year, month)
      VALUES (${organizationId}, 'month', 2026, 8)
      RETURNING id
    `

    await expect(
      insertSaldo({
        organizationId,
        batchId,
        partnerId,
        periodId: other!.id,
        receivableTotal: "1.00",
      }),
    ).rejects.toThrow(/must equal its batch period/)
  })

  it("refuses a partner from another organization", async () => {
    const mine = await createOrganization()
    const theirs = await createOrganization()
    const periodId = await createPeriod(mine)
    const batchId = await createBatch(mine, periodId)
    const foreignPartner = await insertPartner({ organizationId: theirs })

    // The composite FK carries the tenant, so a saldo row naming another book's
    // partner is not a bug this application has to detect — it is a state the
    // schema cannot express.
    await expect(
      insertSaldo({
        organizationId: mine,
        batchId,
        partnerId: foreignPartner,
        periodId,
        receivableTotal: "1.00",
      }),
    ).rejects.toThrow(/partner_saldo_partner_fk/)
  })

  it("takes its rows with it when a draft batch is discarded", async () => {
    const organizationId = await createOrganization()
    const periodId = await createPeriod(organizationId)
    const batchId = await createBatch(organizationId, periodId)
    const partnerId = await insertPartner({ organizationId })
    await insertSaldo({
      organizationId,
      batchId,
      partnerId,
      periodId,
      receivableTotal: "1.00",
    })

    await sql`DELETE FROM import_batch WHERE id = ${batchId}`
    const rows = await sql`
      SELECT 1 FROM partner_saldo WHERE import_batch_id = ${batchId}
    `
    expect(rows).toHaveLength(0)
    // The PARTNER survives: a discarded draft says nothing about whether the
    // counterparty exists.
    const partners = await sql`SELECT 1 FROM partner WHERE id = ${partnerId}`
    expect(partners).toHaveLength(1)
  })
})

describe("document.partner_id / liability.partner_id (spec §4)", () => {
  it("refuses a document naming another organization's partner", async () => {
    const mine = await createOrganization()
    const theirs = await createOrganization()
    const foreignPartner = await insertPartner({ organizationId: theirs })

    await expect(sql`
      INSERT INTO document (
        organization_id, doc_type, original_filename, storage_key, content_type,
        extension, byte_size, sha256, partner_id
      )
      VALUES (
        ${mine}, 'invoice_in', 'f.pdf',
        'org/' || ${mine}::text || '/' || gen_random_uuid()::text || '.pdf',
        'application/pdf', 'pdf', 10,
        md5(random()::text) || md5(random()::text), ${foreignPartner}
      )
    `).rejects.toThrow(/document_partner_fk/)
  })

  it("refuses a liability naming another organization's partner", async () => {
    const mine = await createOrganization()
    const theirs = await createOrganization()
    const foreignPartner = await insertPartner({ organizationId: theirs })

    await expect(sql`
      INSERT INTO liability (
        organization_id, creditor_group, label, amount, due_on, partner_id
      )
      VALUES (${mine}, 'ostatni', 'Penale', '100.00', '2026-04-30', ${foreignPartner})
    `).rejects.toThrow(/liability_partner_fk/)
  })
})
