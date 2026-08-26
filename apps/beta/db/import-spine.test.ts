/**
 * DB-level invariants of the import spine (migration 0007).
 *
 * Beta has no row-level security: the outer wall is the dedicated database, the
 * inner wall is the application scope seam. That makes the constraints and
 * triggers here the only thing standing between a route-level mistake and a
 * client reading a number nobody published — so each one is exercised against a
 * real Postgres 18 rather than trusted because it is written down.
 *
 * The publish RITUAL (supersede, rollback, idempotent re-publish) is tested
 * through the seam in `lib/data/imports.test.ts`. What is tested here is the
 * floor underneath it: the things that stay true even if every line of that
 * module is wrong.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import {
  createImportBatchRow,
  createOrganization,
  createReportingPeriod,
  createStatementLineRow,
  createTrialBalanceLineRow,
  endFixtures,
} from "../tests/fixtures"
import { sharedDatabaseUrl } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

/**
 * Assert that the database refused a write, by CONSTRAINT NAME.
 *
 * The raw driver is used here rather than Drizzle, so the message is the
 * driver's own and a `rejects.toThrow(/name/)` would be honest — but naming the
 * constraint in the assertion is what makes a test fail loudly when a future
 * migration renames or drops it, instead of passing because some OTHER
 * constraint happened to refuse the same row.
 */
async function expectRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let message = "<no throw>"
  try {
    await run()
  } catch (error) {
    message = String((error as { message?: unknown }).message ?? error)
  }
  expect(message).toMatch(constraint)
}

/** An organization with one month period — the world every case below needs. */
async function seedWorld(): Promise<{
  organizationId: string
  periodId: string
}> {
  const { organizationId } = await createOrganization()
  const periodId = await createReportingPeriod(organizationId, {
    kind: "month",
    year: 2026,
    month: 7,
  })
  return { organizationId, periodId }
}

describe("import_batch — one published batch per (org, period, dataset)", () => {
  it("refuses a second published batch for the same key", async () => {
    const { organizationId, periodId } = await seedWorld()
    await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
      status: "published",
    })

    await expectRefusal(
      () =>
        createImportBatchRow(organizationId, periodId, {
          dataset: "rozvaha",
          status: "published",
        }),
      /import_batch_one_published_idx/,
    )
  })

  it("allows a published batch per dataset and per period", async () => {
    const { organizationId, periodId } = await seedWorld()
    const otherPeriodId = await createReportingPeriod(organizationId, {
      kind: "month",
      year: 2026,
      month: 8,
    })

    // Same period, three datasets.
    for (const dataset of ["rozvaha", "vzz", "predvaha"] as const) {
      await createImportBatchRow(organizationId, periodId, {
        dataset,
        status: "published",
      })
    }
    // Same dataset, next period.
    await createImportBatchRow(organizationId, otherPeriodId, {
      dataset: "rozvaha",
      status: "published",
    })

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM import_batch
       WHERE organization_id = ${organizationId} AND status = 'published'
    `
    expect(row!.count).toBe("4")
  })

  it("does not count drafts or superseded batches against the key", async () => {
    const { organizationId, periodId } = await seedWorld()
    const published = await createImportBatchRow(organizationId, periodId, {
      dataset: "vzz",
      status: "published",
    })

    // Any number of drafts may sit behind the one published batch — that is
    // exactly the staging the office needs (spec §3.2).
    await createImportBatchRow(organizationId, periodId, { dataset: "vzz" })
    await createImportBatchRow(organizationId, periodId, { dataset: "vzz" })

    // A superseded batch does not count either. Written the way the write path
    // writes it — a batch reaches `superseded` from `published`, which is why
    // `published_at` has to be set as well (the coherence CHECK says so).
    await sql`
      UPDATE import_batch
         SET status = 'superseded', published_at = now(), superseded_at = now(),
             superseded_by_batch_id = ${published}
       WHERE id = (
         SELECT id FROM import_batch
          WHERE organization_id = ${organizationId} AND status = 'draft'
          LIMIT 1
       )
    `

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM import_batch
       WHERE organization_id = ${organizationId} AND status = 'published'
    `
    expect(row!.count).toBe("1")
  })

  /**
   * The floor, proved from TWO CONNECTIONS.
   *
   * `lib/data/imports.ts` takes a period row lock so that the ordinary
   * concurrent case resolves into a clean supersession rather than an error —
   * but the lock is an optimisation of the failure message. This is the case
   * where nobody took the lock at all: two connections racing straight at the
   * key. Exactly one row survives, and it is the INDEX that says so.
   */
  it("resolves two lockless concurrent publishes to exactly one winner", async () => {
    const { organizationId, periodId } = await seedWorld()

    const a = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
    const b = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
    const insert = (client: postgres.Sql) => client`
      INSERT INTO import_batch (
        organization_id, period_id, dataset, status, source, published_at
      )
      VALUES (${organizationId}, ${periodId}, 'rozvaha', 'published', 'agent', now())
      RETURNING id
    `

    try {
      const results = await Promise.allSettled([insert(a), insert(b)])
      const fulfilled = results.filter((r) => r.status === "fulfilled")
      const rejected = results.filter((r) => r.status === "rejected")

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(
        String((rejected[0] as PromiseRejectedResult).reason?.message),
      ).toMatch(/import_batch_one_published_idx/)
    } finally {
      await a.end({ timeout: 5 })
      await b.end({ timeout: 5 })
    }

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM import_batch
       WHERE organization_id = ${organizationId} AND status = 'published'
    `
    expect(row!.count).toBe("1")
  })
})

describe("import_batch — state coherence", () => {
  it("refuses a published batch with no publication timestamp", async () => {
    const { organizationId, periodId } = await seedWorld()
    await expectRefusal(
      () => sql`
        INSERT INTO import_batch (organization_id, period_id, dataset, status, source)
        VALUES (${organizationId}, ${periodId}, 'rozvaha', 'published', 'agent')
      `,
      /import_batch_status_coherence/,
    )
  })

  it("refuses a draft that still carries a publication timestamp", async () => {
    const { organizationId, periodId } = await seedWorld()
    // The exact shape a rollback would leave behind if it cleared `status` and
    // forgot `published_at` — and the freshness read is `max(published_at)`, so
    // the surface would keep stamping an import nobody can see any more.
    await expectRefusal(
      () => sql`
        INSERT INTO import_batch (
          organization_id, period_id, dataset, status, source, published_at
        )
        VALUES (${organizationId}, ${periodId}, 'rozvaha', 'draft', 'agent', now())
      `,
      /import_batch_status_coherence/,
    )
  })

  it("refuses a superseded batch with nothing superseding it", async () => {
    const { organizationId, periodId } = await seedWorld()
    await expectRefusal(
      () => sql`
        INSERT INTO import_batch (
          organization_id, period_id, dataset, status, source,
          published_at, superseded_at
        )
        VALUES (
          ${organizationId}, ${periodId}, 'rozvaha', 'superseded', 'agent',
          now(), now()
        )
      `,
      /import_batch_status_coherence/,
    )
  })

  it("refuses a batch that supersedes itself", async () => {
    const { organizationId, periodId } = await seedWorld()
    const id = await createImportBatchRow(organizationId, periodId, {
      status: "published",
    })
    await expectRefusal(
      () => sql`
        UPDATE import_batch
           SET status = 'superseded', superseded_at = now(),
               superseded_by_batch_id = id
         WHERE id = ${id}
      `,
      /import_batch_no_self_supersession/,
    )
  })

  /**
   * Supersession is INJECTIVE, which is what makes rollback's backward walk a
   * function rather than a guess: "which batch did the current published one
   * replace?" has exactly one answer.
   */
  it("refuses two batches superseded by the same batch", async () => {
    const { organizationId, periodId } = await seedWorld()
    const winner = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
      status: "published",
    })
    const first = await createImportBatchRow(organizationId, periodId, {
      dataset: "vzz",
      status: "published",
    })
    const second = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
      status: "published",
    })

    await sql`
      UPDATE import_batch
         SET status = 'superseded', superseded_at = now(),
             superseded_by_batch_id = ${winner}
       WHERE id = ${first}
    `
    await expectRefusal(
      () => sql`
        UPDATE import_batch
           SET status = 'superseded', superseded_at = now(),
               superseded_by_batch_id = ${winner}
         WHERE id = ${second}
      `,
      /import_batch_supersession_injective_idx/,
    )
  })

  it("refuses an agent batch that carries a filename", async () => {
    const { organizationId, periodId } = await seedWorld()
    await expectRefusal(
      () => sql`
        INSERT INTO import_batch (
          organization_id, period_id, dataset, status, source, filename
        )
        VALUES (
          ${organizationId}, ${periodId}, 'rozvaha', 'draft', 'agent',
          'rozvaha-2026-07.csv'
        )
      `,
      /import_batch_manual_has_filename/,
    )
  })

  it("refuses a sha256 that is not 64 lowercase hex characters", async () => {
    const { organizationId, periodId } = await seedWorld()
    await expectRefusal(
      () => sql`
        INSERT INTO import_batch (
          organization_id, period_id, dataset, status, source, filename, sha256
        )
        VALUES (
          ${organizationId}, ${periodId}, 'rozvaha', 'draft', 'manual',
          'r.csv', ${"Z".repeat(64)}
        )
      `,
      /import_batch_sha256_hex/,
    )
  })
})

describe("import_batch — frozen identity", () => {
  it("refuses to move a batch to another organization", async () => {
    const { organizationId, periodId } = await seedWorld()
    const other = await createOrganization()
    const id = await createImportBatchRow(organizationId, periodId)

    await expectRefusal(
      () =>
        sql`UPDATE import_batch SET organization_id = ${other.organizationId} WHERE id = ${id}`,
      /organization_id is immutable/,
    )
  })

  /**
   * The sharpest of the three freezes. `dataset` and `period_id` are what the
   * partial unique index is computed over — re-pointing a PUBLISHED batch at
   * another period would move it out from under the index with no supersession
   * recorded, and two batches could then be published for one key without any
   * constraint ever being violated.
   */
  it("refuses to re-point a batch at another period or dataset", async () => {
    const { organizationId, periodId } = await seedWorld()
    const otherPeriodId = await createReportingPeriod(organizationId, {
      kind: "month",
      year: 2026,
      month: 9,
    })
    const id = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
      status: "published",
    })

    await expectRefusal(
      () =>
        sql`UPDATE import_batch SET period_id = ${otherPeriodId} WHERE id = ${id}`,
      /identity \(period, dataset\) is immutable/,
    )
    await expectRefusal(
      () => sql`UPDATE import_batch SET dataset = 'vzz' WHERE id = ${id}`,
      /identity \(period, dataset\) is immutable/,
    )
  })

  it("refuses a batch stamped with another organization's period", async () => {
    const { organizationId } = await seedWorld()
    const foreign = await seedWorld()

    await expectRefusal(
      () => sql`
        INSERT INTO import_batch (organization_id, period_id, dataset, status, source)
        VALUES (${organizationId}, ${foreign.periodId}, 'rozvaha', 'draft', 'agent')
      `,
      /import_batch_period_fk/,
    )
  })
})

describe("statement_line — the five statutory value columns (Advisor F7/F8)", () => {
  it("carries a full rozvaha aktiva row through unchanged", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    await createStatementLineRow(organizationId, batchId, periodId, {
      statementKind: "rozvaha_aktiva",
      ozn: "B.II.",
      rowCode: "014",
      rowLabel: "Dlouhodobý hmotný majetek",
      sortOrder: 14,
      brutto: "4560000.00",
      korekce: "-1230000.50",
      netto: "3329999.50",
      minule: "3510000.00",
    })

    const [row] = await sql<
      {
        value_brutto: string
        value_korekce: string
        value_netto: string
        value_bezne: string | null
        value_minule: string
      }[]
    >`
      SELECT value_brutto, value_korekce, value_netto, value_bezne, value_minule
        FROM statement_line WHERE import_batch_id = ${batchId}
    `

    // Exact decimal text, both ways. Beta never parses a money value into a
    // JavaScript number (spec §0.7 / §0.2), and this is the assertion that the
    // storage layer does not either.
    expect(row).toEqual({
      value_brutto: "4560000.00",
      value_korekce: "-1230000.50",
      value_netto: "3329999.50",
      value_bezne: null,
      value_minule: "3510000.00",
    })
  })

  it("refuses a rozvaha aktiva row that carries the běžné column", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, batchId, periodId, {
          statementKind: "rozvaha_aktiva",
          brutto: "1.00",
          bezne: "1.00",
        }),
      /statement_line_column_shape/,
    )
  })

  it("refuses brutto / korekce / netto on pasiva and on the VZZ", async () => {
    const { organizationId, periodId } = await seedWorld()
    const rozvaha = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    const vzz = await createImportBatchRow(organizationId, periodId, {
      dataset: "vzz",
    })

    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, rozvaha, periodId, {
          statementKind: "rozvaha_pasiva",
          rowCode: "078",
          brutto: "1.00",
        }),
      /statement_line_column_shape/,
    )
    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, vzz, periodId, {
          statementKind: "vzz",
          rowCode: "001",
          netto: "1.00",
        }),
      /statement_line_column_shape/,
    )
  })

  it("refuses two rows for the same řádek of the same statement", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    await createStatementLineRow(organizationId, batchId, periodId, {
      statementKind: "rozvaha_aktiva",
      rowCode: "001",
    })
    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, batchId, periodId, {
          statementKind: "rozvaha_aktiva",
          rowCode: "001",
        }),
      /statement_line_identity_unique/,
    )
    // The same řádek number on the OTHER side of the rozvaha is a different
    // line — aktiva and pasiva number independently.
    await expect(
      createStatementLineRow(organizationId, batchId, periodId, {
        statementKind: "rozvaha_pasiva",
        rowCode: "001",
      }),
    ).resolves.toBeTypeOf("string")
  })

  it("refuses a blank řádek number", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, batchId, periodId, {
          rowCode: "   ",
        }),
      /statement_line_row_code_present/,
    )
  })
})

describe("trial_balance_line — the obratová předvaha", () => {
  it("carries account, opening, MD/D turnovers and closing through unchanged", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
    })
    await createTrialBalanceLineRow(organizationId, batchId, periodId, {
      accountCode: "221100",
      accountName: "Bankovní účet CZK",
      openingBalance: "1250000.00",
      turnoverDebit: "890450.75",
      turnoverCredit: "-12000.25",
      closingBalance: "2128450.50",
    })

    const [row] = await sql<
      {
        account_code: string
        opening_balance: string
        turnover_debit: string
        turnover_credit: string
        closing_balance: string
      }[]
    >`
      SELECT account_code, opening_balance, turnover_debit, turnover_credit,
             closing_balance
        FROM trial_balance_line WHERE import_batch_id = ${batchId}
    `
    expect(row).toEqual({
      account_code: "221100",
      opening_balance: "1250000.00",
      turnover_debit: "890450.75",
      turnover_credit: "-12000.25",
      closing_balance: "2128450.50",
    })
  })

  it("accepts an analytical account code with a separator", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
    })
    // Deliberately NOT digits-only: a CHECK that guessed wrong would refuse a
    // real client's real předvaha at month end.
    await expect(
      createTrialBalanceLineRow(organizationId, batchId, periodId, {
        accountCode: "343.01",
      }),
    ).resolves.toBeTypeOf("string")
  })

  it("refuses the same account twice in one batch", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
    })
    await createTrialBalanceLineRow(organizationId, batchId, periodId, {
      accountCode: "211",
    })
    await expectRefusal(
      () =>
        createTrialBalanceLineRow(organizationId, batchId, periodId, {
          accountCode: "211",
        }),
      /trial_balance_line_identity_unique/,
    )
  })
})

describe("payload rows belong to a draft batch", () => {
  it("refuses an insert into a published batch", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
      status: "published",
    })
    await expectRefusal(
      () => createStatementLineRow(organizationId, batchId, periodId),
      /frozen once the batch leaves draft/,
    )
  })

  it("refuses an edit of a row whose batch has been published", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
    })
    await createTrialBalanceLineRow(organizationId, batchId, periodId, {
      accountCode: "211",
      closingBalance: "100.00",
    })

    await sql`
      UPDATE import_batch SET status = 'published', published_at = now()
       WHERE id = ${batchId}
    `

    // The whole point of the batch model: a published number cannot change
    // under the client. A correction is a NEW batch (spec §3.2).
    await expectRefusal(
      () => sql`
        UPDATE trial_balance_line SET closing_balance = '999.00'
         WHERE import_batch_id = ${batchId}
      `,
      /frozen once the batch leaves draft/,
    )
  })

  it("refuses a line stamped with a different period than its batch", async () => {
    const { organizationId, periodId } = await seedWorld()
    const otherPeriodId = await createReportingPeriod(organizationId, {
      kind: "month",
      year: 2026,
      month: 11,
    })
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })

    // Both FKs carry organization_id, so this period is legitimately the
    // organization's own — it is simply the WRONG one, which is the single
    // thing a denormalised column can get wrong.
    await expectRefusal(
      () => createStatementLineRow(organizationId, batchId, otherPeriodId),
      /period_id must equal its batch period/,
    )
  })

  it("refuses a payload row in a batch of the wrong dataset", async () => {
    const { organizationId, periodId } = await seedWorld()
    const rozvaha = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    const predvaha = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
    })

    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, rozvaha, periodId, {
          statementKind: "vzz",
        }),
      /does not belong to a rozvaha batch/,
    )
    await expectRefusal(
      () =>
        createStatementLineRow(organizationId, predvaha, periodId, {
          statementKind: "rozvaha_aktiva",
        }),
      /does not belong to a predvaha batch/,
    )
    await expectRefusal(
      () => createTrialBalanceLineRow(organizationId, rozvaha, periodId),
      /trial_balance_line does not belong to a rozvaha batch/,
    )
  })

  it("refuses a line pointing at another organization's batch", async () => {
    const mine = await seedWorld()
    const foreign = await seedWorld()
    const foreignBatch = await createImportBatchRow(
      foreign.organizationId,
      foreign.periodId,
      { dataset: "rozvaha" },
    )

    // The foreign batch's OWN period, so the draft-batch trigger's coherence
    // check passes and what refuses is the tenancy in the composite keys
    // themselves: neither (batch, my org) nor (period, my org) exists. Which of
    // the two fires first is Postgres's business — the assertion is that a
    // cross-tenant line is unrepresentable, not which key says so.
    await expectRefusal(
      () =>
        createStatementLineRow(
          mine.organizationId,
          foreignBatch,
          foreign.periodId,
        ),
      /statement_line_(batch|period)_fk/,
    )

    // Naming MY period instead trips the trigger first, which is the same
    // refusal one layer earlier.
    await expectRefusal(
      () =>
        createStatementLineRow(
          mine.organizationId,
          foreignBatch,
          mine.periodId,
        ),
      /period_id must equal its batch period/,
    )
  })
})

describe("deletion", () => {
  it("takes a draft's rows with it", async () => {
    const { organizationId, periodId } = await seedWorld()
    const batchId = await createImportBatchRow(organizationId, periodId, {
      dataset: "predvaha",
    })
    await createTrialBalanceLineRow(organizationId, batchId, periodId, {
      accountCode: "211",
    })
    await createTrialBalanceLineRow(organizationId, batchId, periodId, {
      accountCode: "221",
    })

    await sql`DELETE FROM import_batch WHERE id = ${batchId}`

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM trial_balance_line
       WHERE import_batch_id = ${batchId}
    `
    expect(row!.count).toBe("0")
  })

  /**
   * The reason `import_batch_supersession_fk` has NO `ON DELETE` action.
   *
   * `RESTRICT` is checked immediately and would refuse this delete — the
   * referenced batch is still there at the moment the referencing one goes —
   * so "Smazat organizaci" (spec §2.10) would fail for every client that has
   * ever had a correction published. The default NO ACTION is checked at the
   * end of the statement, by which time both rows are gone.
   */
  it("lets an organization with a supersession chain be deleted", async () => {
    const { organizationId, periodId } = await seedWorld()

    // The whole chain, built the way the write path builds it: a draft with
    // rows, published, then replaced by a second batch.
    const older = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    await createStatementLineRow(organizationId, older, periodId)
    const newer = await createImportBatchRow(organizationId, periodId, {
      dataset: "rozvaha",
    })
    await sql`
      UPDATE import_batch
         SET status = 'superseded', published_at = now(), superseded_at = now(),
             superseded_by_batch_id = ${newer}
       WHERE id = ${older}
    `
    await sql`
      UPDATE import_batch SET status = 'published', published_at = now()
       WHERE id = ${newer}
    `

    await expect(
      sql`DELETE FROM organization WHERE id = ${organizationId}`,
    ).resolves.toBeDefined()

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM import_batch
       WHERE organization_id = ${organizationId}
    `
    expect(row!.count).toBe("0")
  })

  it("refuses to delete a period a batch is stamped with", async () => {
    const { organizationId, periodId } = await seedWorld()
    await createImportBatchRow(organizationId, periodId)

    await expectRefusal(
      () => sql`DELETE FROM reporting_period WHERE id = ${periodId}`,
      /import_batch_period_fk/,
    )
  })
})

describe("the dataset axis", () => {
  it("declares every dataset spec §4 names, in order", async () => {
    const [row] = await sql<{ labels: string[] }[]>`
      SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'beta_import_dataset'
    `
    // saldokonto (PR 27) is still declared ahead of its payload table so the
    // publish semantics never have to be re-reasoned when it lands; payroll's
    // arrived with migration 0016.
    expect(row!.labels).toEqual([
      "predvaha",
      "rozvaha",
      "vzz",
      "saldokonto",
      "payroll",
    ])
  })

  it("keeps unique batch ids across organizations", async () => {
    // A sanity floor on the composite FKs: two organizations, same period
    // shape, no interference.
    const a = await seedWorld()
    const b = await seedWorld()
    const batchA = await createImportBatchRow(a.organizationId, a.periodId, {
      dataset: "vzz",
      status: "published",
    })
    const batchB = await createImportBatchRow(b.organizationId, b.periodId, {
      dataset: "vzz",
      status: "published",
    })
    expect(batchA).not.toBe(batchB)

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM import_batch
       WHERE id IN (${batchA}, ${batchB}) AND status = 'published'
    `
    expect(row!.count).toBe("2")
  })
})
