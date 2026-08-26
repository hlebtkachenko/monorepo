/**
 * Mzdy — the payroll reads and the employee register, against a real
 * Postgres 18.
 *
 * THREE PROPERTIES THIS FILE EXISTS TO PROVE:
 *
 *   1. VISIBILITY. `payrollScope()` is the one gate (spec §2.6.1), management
 *      seats see everything and an unlinked guest sees NOTHING — asserted per
 *      role, on every read, because "salary" is the one dataset in this product
 *      where a leak is not recoverable by an apology.
 *   2. READ-AS-STORED. Every figure that comes out is the figure that went in.
 *      No total is footed, no net is derived, no headcount is counted — spec
 *      §0.2, asserted with numbers that would NOT foot if anything computed
 *      them.
 *   3. THE PUBLISHED BATCH IS THE PAYROLL. A draft is invisible to every role,
 *      including the owner, and a supersession changes what the period means in
 *      one step.
 *
 * Writes take an `OwnerScope`, so a non-owner cannot call them at all — that is
 * a compile error, and the runtime proof of the door itself lives in
 * `scope.test.ts`, as `assets.test.ts` documents.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createImportBatchRow,
  createMonthPeriod,
  createPayrollLineRow,
  createPayrollSummaryRow,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, requireOwner } = await import("./scope")
const {
  createPayrollEmployee,
  payrollEmployeeByExternalRef,
  payrollEmployeesForScope,
  payrollLinesForEmployee,
  payrollLinesForPeriod,
  payrollScope,
  payrollSummaryForPeriod,
  publishedPayrollPeriods,
  updatePayrollEmployee,
} = await import("./payroll")
const { forbiddenClientKeys } = await import("./projections")

type Role = "owner" | "admin" | "member" | "guest"

/** Spec §5's management seats — every one of them sees all payroll. */
const MANAGEMENT = ["owner", "admin", "member"] as const

function as(headers: Headers): void {
  request.headers = headers
}

async function orgScopeFor(org: TestOrganization, role: Role) {
  as(org.members[role].headers)
  return requireScope(org.slug)
}

async function ownerScopeFor(org: TestOrganization) {
  return requireOwner(await orgScopeFor(org, "owner"))
}

/**
 * Figures chosen so that nothing here foots. `employerCostTotal` is NOT
 * `grossTotal + employerSocial + employerHealth`, and `netPaidTotal` is NOT
 * `grossTotal − employeeWithholdingsTotal − incomeTaxAdvance`. If any read ever
 * starts deriving a number instead of reading it, these assertions break.
 */
const SUMMARY = {
  grossTotal: "420000.00",
  employerSocial: "104160.00",
  employerHealth: "37800.00",
  employerCostTotal: "999111.00",
  employeeWithholdingsTotal: "48720.00",
  incomeTaxAdvance: "63000.00",
  netPaidTotal: "111222.00",
  paymentDueDate: "2026-04-12",
  headcountHpp: 9,
  headcountDpc: 0,
  headcountDpp: 4,
  noteClient: "Mzdy za období",
} as const

/** Publish one payroll batch through the real spine, and return its id. */
async function publishPayroll(
  owner: Awaited<ReturnType<typeof ownerScopeFor>>,
  periodId: string,
  netPaidTotal: string,
): Promise<string> {
  const { createDraftBatch, publishBatch } = await import("./imports")
  const batch = await createDraftBatch(owner, {
    dataset: "payroll",
    periodId,
    source: "agent",
    payrollSummary: { netPaidTotal },
    payrollLines: [],
  })
  const published = await publishBatch(owner, batch.id)
  if (!published.ok)
    throw new Error(`fixture: publish refused (${published.reason})`)
  return batch.id
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("payrollScope — the one gate (spec §2.6.1, §5)", () => {
  it("answers `all` for every management seat", async () => {
    for (const role of MANAGEMENT) {
      const scope = await orgScopeFor(org, role)
      expect(payrollScope(scope), role).toEqual({ kind: "all" })
    }
  })

  it("answers `none` for an unlinked guest — fail closed", async () => {
    const scope = await orgScopeFor(org, "guest")
    expect(payrollScope(scope)).toEqual({ kind: "none" })
  })
})

describe("Přehled mezd — the period summary", () => {
  it("reads back exactly what the office stated, deriving nothing", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId, {
      summary: SUMMARY,
    })

    const summary = await payrollSummaryForPeriod(
      await orgScopeFor(book, "owner"),
      periodId,
    )

    expect(summary).toMatchObject({
      periodId,
      grossTotal: SUMMARY.grossTotal,
      employerSocial: SUMMARY.employerSocial,
      employerHealth: SUMMARY.employerHealth,
      // Deliberately not the sum of the three above — see SUMMARY's comment.
      employerCostTotal: SUMMARY.employerCostTotal,
      employeeWithholdingsTotal: SUMMARY.employeeWithholdingsTotal,
      incomeTaxAdvance: SUMMARY.incomeTaxAdvance,
      netPaidTotal: SUMMARY.netPaidTotal,
      paymentDueDate: SUMMARY.paymentDueDate,
      headcountHpp: 9,
      headcountDpc: 0,
      headcountDpp: 4,
      noteClient: SUMMARY.noteClient,
    })
  })

  it("keeps an unstated figure NULL — absent is not zero (§0.4)", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId, {
      summary: { grossTotal: "10000.00" },
    })

    const summary = await payrollSummaryForPeriod(
      await orgScopeFor(book, "owner"),
      periodId,
    )
    expect(summary?.grossTotal).toBe("10000.00")
    expect(summary?.netPaidTotal).toBeNull()
    expect(summary?.headcountHpp).toBeNull()
    expect(summary?.paymentDueDate).toBeNull()
  })

  it("is null for a period the office has published nothing for", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    expect(
      await payrollSummaryForPeriod(await orgScopeFor(book, "owner"), periodId),
    ).toBeNull()
  })

  it("is null for a DRAFT batch, for every role including the owner", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    const batchId = await createImportBatchRow(book.organizationId, periodId, {
      dataset: "payroll",
      status: "draft",
    })
    await createPayrollSummaryRow(book.organizationId, batchId, periodId, {
      netPaidTotal: "1.00",
    })

    for (const role of MANAGEMENT) {
      const scope = await orgScopeFor(book, role)
      expect(await payrollSummaryForPeriod(scope, periodId), role).toBeNull()
    }
  })

  it("is null for every unlinked guest, published or not", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId, {
      summary: SUMMARY,
    })

    expect(
      await payrollSummaryForPeriod(await orgScopeFor(book, "guest"), periodId),
    ).toBeNull()
  })

  it("reads it for every management seat", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId, {
      summary: SUMMARY,
    })

    for (const role of MANAGEMENT) {
      const scope = await orgScopeFor(book, role)
      const summary = await payrollSummaryForPeriod(scope, periodId)
      expect(summary?.netPaidTotal, role).toBe(SUMMARY.netPaidTotal)
    }
  })

  it("serves the newer batch after a supersession, through the real spine", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const periodId = await createMonthPeriod(book.organizationId)

    // The REAL publish path, not a fixture: payroll rides `import_batch`, so
    // this is the assertion that "supersede + publish, atomically" applies to
    // Mzdy with nothing added — the whole reason the summary is batch payload
    // rather than a per-period upsert.
    const first = await publishPayroll(owner, periodId, "100000.00")
    const second = await publishPayroll(owner, periodId, "200000.00")

    const summary = await payrollSummaryForPeriod(
      await orgScopeFor(book, "owner"),
      periodId,
    )
    expect(summary?.netPaidTotal).toBe("200000.00")

    const { readImportBatchRow } = await import("../../tests/fixtures")
    expect(await readImportBatchRow(first)).toMatchObject({
      status: "superseded",
      superseded_by_batch_id: second,
    })
  })

  it("has nothing to serve after the newest payroll batch is rolled back", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const periodId = await createMonthPeriod(book.organizationId)

    await publishPayroll(owner, periodId, "100000.00")
    await publishPayroll(owner, periodId, "200000.00")

    const { rollbackDataset } = await import("./imports")
    const rolledBack = await rollbackDataset(owner, {
      periodId,
      dataset: "payroll",
    })
    expect(rolledBack.ok).toBe(true)

    // THE POINT OF PUTTING PAYROLL ON THE SPINE. "Vrátit poslední import" (spec
    // §3.2) restores the previous figures for Mzdy exactly as it does for a
    // rozvaha — a per-period upsert would have left 200 000 on screen with the
    // batch history claiming it had been retracted.
    const summary = await payrollSummaryForPeriod(owner, periodId)
    expect(summary?.netPaidTotal).toBe("100000.00")
  })

  it("cannot be read across organizations", async () => {
    const book = await seedOrganization()
    const foreign = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId, {
      summary: SUMMARY,
    })

    // A leaked period id from another book answers `null`, not a row — the same
    // non-oracle answer `requireScope` gives, at the row level.
    expect(
      await payrollSummaryForPeriod(
        await orgScopeFor(foreign, "owner"),
        periodId,
      ),
    ).toBeNull()
  })

  it("ships no forbidden column to a client tier", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId, {
      summary: SUMMARY,
    })
    const summary = await payrollSummaryForPeriod(
      await orgScopeFor(book, "owner"),
      periodId,
    )
    expect(forbiddenClientKeys(summary)).toEqual([])
  })
})

describe("the published-period picker", () => {
  it("lists only periods with a PUBLISHED payroll batch, newest first", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)

    const january = await createMonthPeriod(book.organizationId)
    const february = await createMonthPeriod(book.organizationId)
    const empty = await createMonthPeriod(book.organizationId)

    await publishPayrollFixture(book.organizationId, january)
    await publishPayrollFixture(book.organizationId, february)
    // `empty` has a period row and no batch — a picker built from the
    // organization's period list would offer it and then answer "zatím nebylo
    // nahráno", which is §0.4's honest empty state used as a dead end.
    const ids = (await publishedPayrollPeriods(owner)).map((p) => p.id)

    expect(ids).toHaveLength(2)
    expect(ids).not.toContain(empty)
    expect(new Set(ids)).toEqual(new Set([january, february]))
  })

  it("is empty for an unlinked guest", async () => {
    const book = await seedOrganization()
    const periodId = await createMonthPeriod(book.organizationId)
    await publishPayrollFixture(book.organizationId, periodId)
    expect(
      await publishedPayrollPeriods(await orgScopeFor(book, "guest")),
    ).toEqual([])
  })
})

describe("Zaměstnanci — the register", () => {
  it("lists active people first, then leavers, and carries the ended_on warning data", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)

    await createPayrollEmployee(owner, {
      fullName: "Alena Dvořáková",
      contractType: "hpp",
      startedOn: "2024-01-15",
    })
    await createPayrollEmployee(owner, {
      fullName: "Bohumil Král",
      contractType: "dpp",
      startedOn: "2023-06-01",
      endedOn: "2026-02-28",
      // ENDED BUT STILL ACTIVE — spec §2.6.1's "Zaměstnanec ukončen, účet
      // aktivní" state. The register has to SHOW it, so it must not be filtered
      // out and both facts have to reach the view.
      active: true,
    })
    await createPayrollEmployee(owner, {
      fullName: "Cyril Němec",
      contractType: "dpc",
      endedOn: "2025-12-31",
      active: false,
    })

    const employees = await payrollEmployeesForScope(owner)
    expect(employees.map((e) => e.fullName)).toEqual([
      "Alena Dvořáková",
      "Bohumil Král",
      "Cyril Němec",
    ])
    expect(employees[1]).toMatchObject({
      endedOn: "2026-02-28",
      active: true,
      contractType: "dpp",
      hasPortalAccount: false,
    })
  })

  it("filters to active on request, and lists everyone by default", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    await createPayrollEmployee(owner, {
      fullName: "Aktivní",
      contractType: "hpp",
    })
    await createPayrollEmployee(owner, {
      fullName: "Neaktivní",
      contractType: "hpp",
      active: false,
    })

    expect(await payrollEmployeesForScope(owner)).toHaveLength(2)
    expect(
      await payrollEmployeesForScope(owner, { active: true }),
    ).toHaveLength(1)
  })

  it("is readable by every management seat and empty for an unlinked guest", async () => {
    const book = await seedOrganization()
    await createPayrollEmployee(await ownerScopeFor(book), {
      fullName: "Jan Novák",
      contractType: "hpp",
    })

    for (const role of MANAGEMENT) {
      const scope = await orgScopeFor(book, role)
      expect(await payrollEmployeesForScope(scope), role).toHaveLength(1)
    }
    expect(
      await payrollEmployeesForScope(await orgScopeFor(book, "guest")),
    ).toEqual([])
  })

  it("returns only the scope's own employees", async () => {
    const book = await seedOrganization()
    const foreign = await seedOrganization()
    await createPayrollEmployee(await ownerScopeFor(book), {
      fullName: "Moje",
      contractType: "hpp",
    })
    await createPayrollEmployee(await ownerScopeFor(foreign), {
      fullName: "Cizí",
      contractType: "hpp",
    })

    const mine = await payrollEmployeesForScope(await ownerScopeFor(book))
    expect(mine.map((e) => e.fullName)).toEqual(["Moje"])
  })

  it("ships no forbidden column, and no app_user_id, to a client tier", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "hpp",
      externalRef: "money-s3:employee:1",
    })

    const [employee] = await payrollEmployeesForScope(owner)
    expect(forbiddenClientKeys(employee)).toEqual([])
    // `external_ref` is on CLIENT_FORBIDDEN_COLUMNS, so the line above covers
    // it; `app_user_id` is not a forbidden NAME, it is simply never projected —
    // `hasPortalAccount` is the derived fact the register needs.
    expect(Object.keys(employee!)).not.toContain("appUserId")
    expect(employee).toMatchObject({ hasPortalAccount: false })
  })
})

describe("employee identity — matched on externalRef, never on a name", () => {
  it("finds the row its externalRef names, scoped to the book", async () => {
    const book = await seedOrganization()
    const foreign = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const foreignOwner = await ownerScopeFor(foreign)

    const created = await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "hpp",
      externalRef: "shared-ref",
    })
    await createPayrollEmployee(foreignOwner, {
      fullName: "Někdo jiný",
      contractType: "hpp",
      externalRef: "shared-ref",
    })

    expect(await payrollEmployeeByExternalRef(owner, "shared-ref")).toEqual({
      id: created.id,
    })
    expect(
      await payrollEmployeeByExternalRef(foreignOwner, "shared-ref"),
    ).not.toEqual({ id: created.id })
  })

  it("never matches a hand-typed row — those carry no externalRef", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    await createPayrollEmployee(owner, {
      fullName: "Ručně zadaný",
      contractType: "hpp",
    })
    expect(await payrollEmployeeByExternalRef(owner, "money-s3:1")).toBeNull()
  })

  it("patches the register fields, contract type included", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const { id } = await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "dpp",
    })

    // A DPP that becomes an HPP is the SAME person on a new contract — unlike a
    // filing's `kind`, this is not identity and is patched rather than refused.
    expect(
      await updatePayrollEmployee(owner, id, {
        contractType: "hpp",
        fullName: "Jan Nováček",
        endedOn: "2026-06-30",
      }),
    ).toBe(true)

    const [employee] = await payrollEmployeesForScope(owner)
    expect(employee).toMatchObject({
      contractType: "hpp",
      fullName: "Jan Nováček",
      endedOn: "2026-06-30",
      // Untouched: `active` is not derived from `ended_on` (spec §2.6.1).
      active: true,
    })
  })

  it("refuses to patch another book's employee", async () => {
    const book = await seedOrganization()
    const foreign = await seedOrganization()
    const { id } = await createPayrollEmployee(await ownerScopeFor(book), {
      fullName: "Jan Novák",
      contractType: "hpp",
    })
    expect(
      await updatePayrollEmployee(await ownerScopeFor(foreign), id, {
        fullName: "Přepsáno",
      }),
    ).toBe(false)
  })
})

describe("per-employee lines", () => {
  it("reads a period's lines with names attached, alphabetically", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const periodId = await createMonthPeriod(book.organizationId)

    const alena = await createPayrollEmployee(owner, {
      fullName: "Alena Dvořáková",
      contractType: "hpp",
    })
    const bohumil = await createPayrollEmployee(owner, {
      fullName: "Bohumil Král",
      contractType: "dpc",
    })

    await publishPayrollFixture(book.organizationId, periodId, {
      lines: [
        {
          employeeId: bohumil.id,
          gross: "18000.00",
          deductionsTotal: "1980.00",
          // NOT gross − deductions: read as stored.
          net: "12345.00",
          employerCost: "24120.00",
        },
        { employeeId: alena.id, gross: "60000.00" },
      ],
    })

    const lines = await payrollLinesForPeriod(owner, periodId)
    expect(lines.map((l) => l.employeeName)).toEqual([
      "Alena Dvořáková",
      "Bohumil Král",
    ])
    expect(lines[1]).toMatchObject({
      employeeId: bohumil.id,
      gross: "18000.00",
      deductionsTotal: "1980.00",
      net: "12345.00",
      employerCost: "24120.00",
    })
    // Alena's line stated only a gross — the rest stay NULL, not zero.
    expect(lines[0]).toMatchObject({
      gross: "60000.00",
      net: null,
      employerCost: null,
    })
  })

  it("hides a draft's lines from every management seat", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const periodId = await createMonthPeriod(book.organizationId)
    const employee = await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "hpp",
    })
    const batchId = await createImportBatchRow(book.organizationId, periodId, {
      dataset: "payroll",
      status: "draft",
    })
    await createPayrollLineRow(
      book.organizationId,
      batchId,
      periodId,
      employee.id,
      { gross: "60000.00" },
    )

    for (const role of MANAGEMENT) {
      const scope = await orgScopeFor(book, role)
      expect(await payrollLinesForPeriod(scope, periodId), role).toEqual([])
    }
  })

  it("is empty for an unlinked guest", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const periodId = await createMonthPeriod(book.organizationId)
    const employee = await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "hpp",
    })
    await publishPayrollFixture(book.organizationId, periodId, {
      lines: [{ employeeId: employee.id, gross: "60000.00" }],
    })

    const guest = await orgScopeFor(book, "guest")
    expect(await payrollLinesForPeriod(guest, periodId)).toEqual([])
    expect(await payrollLinesForEmployee(guest, employee.id)).toEqual([])
  })

  it("reads one person's history across published periods, newest first", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const employee = await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "hpp",
    })

    const older = await createMonthPeriod(book.organizationId, 2025)
    const newer = await createMonthPeriod(book.organizationId, 2026)
    await publishPayrollFixture(book.organizationId, older, {
      lines: [{ employeeId: employee.id, gross: "50000.00" }],
    })
    await publishPayrollFixture(book.organizationId, newer, {
      lines: [{ employeeId: employee.id, gross: "60000.00" }],
    })

    const history = await payrollLinesForEmployee(owner, employee.id)
    expect(history.map((l) => l.gross)).toEqual(["60000.00", "50000.00"])
    expect(history.map((l) => l.periodId)).toEqual([newer, older])
  })

  it("answers [] for an employee id from another book", async () => {
    const book = await seedOrganization()
    const foreign = await seedOrganization()
    const foreignEmployee = await createPayrollEmployee(
      await ownerScopeFor(foreign),
      { fullName: "Cizí", contractType: "hpp" },
    )
    const foreignPeriod = await createMonthPeriod(foreign.organizationId)
    await publishPayrollFixture(foreign.organizationId, foreignPeriod, {
      lines: [{ employeeId: foreignEmployee.id, gross: "60000.00" }],
    })

    expect(
      await payrollLinesForEmployee(
        await ownerScopeFor(book),
        foreignEmployee.id,
      ),
    ).toEqual([])
  })

  it("ships no forbidden column to a client tier", async () => {
    const book = await seedOrganization()
    const owner = await ownerScopeFor(book)
    const periodId = await createMonthPeriod(book.organizationId)
    const employee = await createPayrollEmployee(owner, {
      fullName: "Jan Novák",
      contractType: "hpp",
      externalRef: "money-s3:employee:7",
    })
    await publishPayrollFixture(book.organizationId, periodId, {
      lines: [{ employeeId: employee.id, gross: "60000.00" }],
    })

    expect(
      forbiddenClientKeys(await payrollLinesForPeriod(owner, periodId)),
    ).toEqual([])
  })
})
