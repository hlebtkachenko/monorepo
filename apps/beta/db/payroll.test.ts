/**
 * Migration 0016's invariants, asserted against a real Postgres 18.
 *
 * WHAT THIS FILE IS FOR. Everything here is a claim the DATABASE makes, not the
 * application: an employee cannot change books, a payload row cannot be edited
 * under a published batch, a payslip cannot point at another organization's
 * employee, and an employee with payroll history cannot be deleted out from
 * under it. Each has a code path above it that also honours the rule; these
 * assertions are the floor under a future caller that does not.
 *
 * The personal-data posture is asserted here too (`the column list`), because
 * "this table stores no rodné číslo" is a property of the schema and nothing
 * else — a column added later would pass every application test in the suite.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"

import {
  createAccount,
  createDocumentRow,
  createImportBatchRow,
  createMonthPeriod,
  createOrganization,
  createPayrollEmployeeRow,
  createPayrollLineRow,
  createPayrollSummaryRow,
  endFixtures,
  publishPayrollFixture,
} from "@/tests/fixtures"
import { sharedDatabaseUrl, unique } from "@/tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

type World = {
  organizationId: string
  periodId: string
  employeeId: string
}

async function seedWorld(): Promise<World> {
  const { organizationId } = await createOrganization()
  const periodId = await createMonthPeriod(organizationId)
  const employeeId = await createPayrollEmployeeRow(organizationId)
  return { organizationId, periodId, employeeId }
}

let world: World

beforeAll(async () => {
  world = await seedWorld()
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

describe("payroll_employee — the register", () => {
  it("stores a name, an employment type, two dates and nothing personal", async () => {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'payroll_employee'
       ORDER BY column_name
    `
    // THE WHOLE COLUMN LIST, asserted exactly. A birth number, an address or a
    // bank account added later fails here — which is the only place it can fail,
    // because no application test would notice a column nothing reads.
    expect(rows.map((r) => r.column_name)).toEqual([
      "active",
      "app_user_id",
      "contract_type",
      "created_at",
      "ended_on",
      "external_ref",
      "full_name",
      "id",
      "organization_id",
      "started_on",
      "updated_at",
    ])
  })

  it("declares the three Czech contract types spec §2.6 names", async () => {
    const [row] = await sql<{ labels: string[] }[]>`
      SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'beta_payroll_contract_type'
    `
    expect(row!.labels).toEqual(["hpp", "dpc", "dpp"])
  })

  it("refuses an employment that ends before it begins", async () => {
    await expect(
      createPayrollEmployeeRow(world.organizationId, {
        startedOn: "2026-03-01",
        endedOn: "2026-02-01",
      }),
    ).rejects.toThrow(/payroll_employee_employment_dates_ordered/)
  })

  it("lets an ended employee stay active — the two are independent (spec §2.6.1)", async () => {
    const id = await createPayrollEmployeeRow(world.organizationId, {
      startedOn: "2024-01-01",
      endedOn: "2026-02-28",
      active: true,
    })
    const [row] = await sql<{ active: boolean; ended_on: string }[]>`
      SELECT active, ended_on::text FROM payroll_employee WHERE id = ${id}
    `
    // The "Zaměstnanec ukončen, účet aktivní" warning of spec §2.6.1 only
    // exists because this state is representable. A CHECK coupling the two
    // would make the warning unstatable and deactivate the leaver
    // automatically, which the spec forbids in the same sentence.
    expect(row).toEqual({ active: true, ended_on: "2026-02-28" })
  })

  it("allows at most one employee per portal account per book", async () => {
    const { organizationId } = await createOrganization()
    const account = await createAccount()
    await createPayrollEmployeeRow(organizationId, {
      appUserId: account.userId,
    })
    await expect(
      createPayrollEmployeeRow(organizationId, { appUserId: account.userId }),
    ).rejects.toThrow(/payroll_employee_app_user_idx/)
  })

  it("allows many employees with NO portal account (the index is partial)", async () => {
    const { organizationId } = await createOrganization()
    await createPayrollEmployeeRow(organizationId, { appUserId: null })
    await expect(
      createPayrollEmployeeRow(organizationId, { appUserId: null }),
    ).resolves.toBeTypeOf("string")
  })

  it("allows at most one employee per externalRef per book, and many with none", async () => {
    const { organizationId } = await createOrganization()
    const ref = unique("money-s3:employee")
    await createPayrollEmployeeRow(organizationId, { externalRef: ref })
    await expect(
      createPayrollEmployeeRow(organizationId, { externalRef: ref }),
    ).rejects.toThrow(/payroll_employee_external_ref_idx/)

    // A hand-typed row carries none, and an ingestion run therefore cannot
    // reach it (migration 0011's rule, applied to this registry).
    await createPayrollEmployeeRow(organizationId, { externalRef: null })
    await expect(
      createPayrollEmployeeRow(organizationId, { externalRef: null }),
    ).resolves.toBeTypeOf("string")
  })

  it("lets two books use the same externalRef", async () => {
    const ref = unique("money-s3:employee")
    const a = await createOrganization()
    const b = await createOrganization()
    await createPayrollEmployeeRow(a.organizationId, { externalRef: ref })
    await expect(
      createPayrollEmployeeRow(b.organizationId, { externalRef: ref }),
    ).resolves.toBeTypeOf("string")
  })

  it("never changes books", async () => {
    const other = await createOrganization()
    await expect(
      sql`
        UPDATE payroll_employee
           SET organization_id = ${other.organizationId}
         WHERE id = ${world.employeeId}
      `,
    ).rejects.toThrow(/organization_id is immutable/)
  })
})

describe("payroll payload rows belong to a published-able payroll batch", () => {
  it("refuses a summary inside a batch of another dataset", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "rozvaha", status: "draft" },
    )
    await expect(
      createPayrollSummaryRow(world.organizationId, batchId, world.periodId),
    ).rejects.toThrow(/does not belong to a rozvaha batch/)
  })

  it("refuses a line inside a batch of another dataset", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "predvaha", status: "draft" },
    )
    await expect(
      createPayrollLineRow(
        world.organizationId,
        batchId,
        world.periodId,
        world.employeeId,
      ),
    ).rejects.toThrow(/does not belong to a predvaha batch/)
  })

  it("refuses payload written into an already-published batch", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "payroll", status: "published" },
    )
    await expect(
      createPayrollSummaryRow(world.organizationId, batchId, world.periodId),
    ).rejects.toThrow(/frozen once the batch leaves draft/)
  })

  it("freezes a published summary against edits — a correction is a new batch", async () => {
    const { organizationId } = await createOrganization()
    const periodId = await createMonthPeriod(organizationId)
    const batchId = await publishPayrollFixture(organizationId, periodId, {
      summary: { netPaidTotal: "308280.00" },
    })

    await expect(
      sql`
        UPDATE payroll_summary
           SET net_paid_total = '999999.00'
         WHERE import_batch_id = ${batchId}
      `,
    ).rejects.toThrow(/frozen once the batch leaves draft/)
  })

  it("refuses a payload row stamped with a period other than its batch's", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "payroll", status: "draft" },
    )
    const otherPeriod = await createMonthPeriod(world.organizationId)
    await expect(
      createPayrollSummaryRow(world.organizationId, batchId, otherPeriod),
    ).rejects.toThrow(/must equal its batch period/)
  })

  it("allows one summary per batch and no more", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "payroll", status: "draft" },
    )
    await createPayrollSummaryRow(world.organizationId, batchId, world.periodId)
    await expect(
      createPayrollSummaryRow(world.organizationId, batchId, world.periodId),
    ).rejects.toThrow(/payroll_summary_batch_unique/)
  })

  it("allows one line per employee per batch and no more", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "payroll", status: "draft" },
    )
    await createPayrollLineRow(
      world.organizationId,
      batchId,
      world.periodId,
      world.employeeId,
    )
    await expect(
      createPayrollLineRow(
        world.organizationId,
        batchId,
        world.periodId,
        world.employeeId,
      ),
    ).rejects.toThrow(/payroll_employee_line_identity_unique/)
  })

  it("refuses a negative headcount", async () => {
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "payroll", status: "draft" },
    )
    await expect(
      createPayrollSummaryRow(world.organizationId, batchId, world.periodId, {
        headcountDpp: -1,
      }),
    ).rejects.toThrow(/payroll_summary_headcounts_nonnegative/)
  })

  it("keeps at most ONE published payroll batch per period (the spine's index)", async () => {
    const { organizationId } = await createOrganization()
    const periodId = await createMonthPeriod(organizationId)
    await publishPayrollFixture(organizationId, periodId)
    await expect(
      publishPayrollFixture(organizationId, periodId),
    ).rejects.toThrow(/import_batch_one_published_idx/)
  })
})

describe("cross-organization isolation", () => {
  it("refuses a line pointing at another book's employee", async () => {
    const other = await createOrganization()
    const foreignEmployee = await createPayrollEmployeeRow(other.organizationId)
    const batchId = await createImportBatchRow(
      world.organizationId,
      world.periodId,
      { dataset: "payroll", status: "draft" },
    )
    await expect(
      createPayrollLineRow(
        world.organizationId,
        batchId,
        world.periodId,
        foreignEmployee,
      ),
    ).rejects.toThrow(/payroll_employee_line_employee_fk/)
  })

  it("refuses a line pointing at another book's batch", async () => {
    const other = await createOrganization()
    const otherPeriod = await createMonthPeriod(other.organizationId)
    const foreignBatch = await createImportBatchRow(
      other.organizationId,
      otherPeriod,
      { dataset: "payroll", status: "draft" },
    )
    // The BEFORE INSERT trigger runs ahead of the constraint check, so the
    // period mismatch is what NAMES this refusal — a line cannot carry both its
    // own book's period and another book's batch. `payroll_employee_line_batch_fk`
    // is the floor under it and refuses the same row on its own terms; either
    // way nothing is written.
    await expect(
      createPayrollLineRow(
        world.organizationId,
        foreignBatch,
        world.periodId,
        world.employeeId,
      ),
    ).rejects.toThrow(/must equal its batch period/)
  })

  it("refuses a line whose batch and period both belong to another book", async () => {
    const other = await createOrganization()
    const otherPeriod = await createMonthPeriod(other.organizationId)
    const foreignBatch = await createImportBatchRow(
      other.organizationId,
      otherPeriod,
      { dataset: "payroll", status: "draft" },
    )
    // Now the trigger is satisfied and the composite, tenancy-carrying FKs are
    // the only thing left — which is the point: they, not the trigger, are what
    // makes a cross-book payload row unrepresentable.
    await expect(
      createPayrollLineRow(
        world.organizationId,
        foreignBatch,
        otherPeriod,
        world.employeeId,
      ),
    ).rejects.toThrow(/payroll_employee_line_(batch|period)_fk/)
  })
})

describe("document.payslip_employee_id — the FK migration 0004 deferred", () => {
  it("accepts a payslip stamped with an employee of the same book", async () => {
    const periodId = await createMonthPeriod(world.organizationId)
    await expect(
      createDocumentRow(world.organizationId, {
        docType: "payslip",
        payslipEmployeeId: world.employeeId,
        payslipPeriodId: periodId,
      }),
    ).resolves.toBeTypeOf("string")
  })

  it("refuses a payslip stamped with another organization's employee", async () => {
    const other = await createOrganization()
    const foreignEmployee = await createPayrollEmployeeRow(other.organizationId)
    await expect(
      createDocumentRow(world.organizationId, {
        docType: "payslip",
        payslipEmployeeId: foreignEmployee,
      }),
    ).rejects.toThrow(/document_payslip_employee_fk/)
  })

  it("refuses to delete an employee a payslip is stamped with — the leaver keeps it", async () => {
    const { organizationId } = await createOrganization()
    const employeeId = await createPayrollEmployeeRow(organizationId)
    await createDocumentRow(organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
    })
    await expect(
      sql`DELETE FROM payroll_employee WHERE id = ${employeeId}`,
    ).rejects.toThrow(/document_payslip_employee_fk/)
  })

  it("refuses to delete an employee that has payroll lines", async () => {
    const { organizationId } = await createOrganization()
    const periodId = await createMonthPeriod(organizationId)
    const employeeId = await createPayrollEmployeeRow(organizationId)
    await publishPayrollFixture(organizationId, periodId, {
      lines: [{ employeeId, gross: "60000.00" }],
    })
    await expect(
      sql`DELETE FROM payroll_employee WHERE id = ${employeeId}`,
    ).rejects.toThrow(/payroll_employee_line_employee_fk/)
  })

  it("still allows a NON-payslip document to be stamped to an employee (Podklady)", async () => {
    // Spec §2.6 Podklady has docházka and nástupní dotazníky stamped to a person
    // and a month. Those are not payslips, and no CHECK ties the two columns to
    // `doc_type = 'payslip'` — asserted so a later "tidy-up" migration cannot add
    // one without this failing.
    const periodId = await createMonthPeriod(world.organizationId)
    await expect(
      createDocumentRow(world.organizationId, {
        docType: "attendance",
        payslipEmployeeId: world.employeeId,
        payslipPeriodId: periodId,
      }),
    ).resolves.toBeTypeOf("string")
  })
})

describe("deleting the organization takes the whole payroll with it", () => {
  it("cascades employees, summaries and lines", async () => {
    const { organizationId } = await createOrganization()
    const periodId = await createMonthPeriod(organizationId)
    const employeeId = await createPayrollEmployeeRow(organizationId)
    await publishPayrollFixture(organizationId, periodId, {
      lines: [{ employeeId, gross: "60000.00" }],
    })

    // Spec §2.10's danger zone deletes a book outright. RESTRICT on
    // `payroll_employee_line_employee_fk` must not stand in the way of that:
    // both sides cascade from `organization`, and NO ACTION-style end-of-
    // statement checking is what makes the pair removable together.
    await sql`DELETE FROM organization WHERE id = ${organizationId}`

    const [counts] = await sql<{ employees: number; lines: number }[]>`
      SELECT
        (SELECT count(*) FROM payroll_employee WHERE organization_id = ${organizationId})::int AS employees,
        (SELECT count(*) FROM payroll_employee_line WHERE organization_id = ${organizationId})::int AS lines
    `
    expect(counts).toEqual({ employees: 0, lines: 0 })
  })
})
