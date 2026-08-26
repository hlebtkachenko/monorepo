/**
 * THE EMPLOYEE SEAT'S READ ISOLATION, against a real Postgres 18 (spec §2.6.1).
 *
 * One question, asked from every direction: can an employee reach anything that
 * is not theirs? The answers this file has to establish are
 *
 *   CROSS-EMPLOYEE — Jan never sees Petra's line or Petra's payslip, and Petra
 *                    never sees Jan's. BOTH directions, because a filter keyed
 *                    on the wrong side of a join passes one of them.
 *   CROSS-ORG      — a seat in one book resolves no scope in another, and being
 *                    linked in book B does not narrow (or widen) anything in
 *                    book A.
 *   COMPANY-WIDE   — payroll totals, the published-period axis and every
 *                    company document answer nothing at all.
 *   NOT-A-NARROWING-OF-MANAGEMENT — a manager who is ALSO on the payroll still
 *                    sees everybody. This is the failure mode a naive
 *                    "link ⇒ narrow" would produce, and it is the one that
 *                    silently blinds a company owner to their own payroll.
 *
 * The issuance/consume half is `lib/auth/employee-seat-invite.test.ts`.
 *
 * SCOPES ARE MINTED THROUGH `requireScope`, never constructed: `OrgScope`
 * carries a module-private symbol precisely so a test cannot fake one, and a
 * suite asserting about a hand-built handle would be asserting about a world
 * the application never runs in (`scope-brand-fence.boundary.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createAccount,
  createDocumentRow,
  createMonthPeriod,
  createPayrollEmployeeRow,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestAccount,
  type TestOrganization,
} from "../../tests/fixtures"
import { createMemoryDocumentStore } from "../../tests/memory-document-store"
import { unique } from "../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, resolveOrgScope, isEmployeeSeat } =
  await import("./scope")
const {
  payrollEmployeesForScope,
  payrollLinesForEmployee,
  payrollLinesForPeriod,
  payrollScope,
  payrollSummaryForPeriod,
  publishedPayrollPeriods,
} = await import("./payroll")
const { openPayslipFile, payslipDocumentsForScope } = await import("./payslips")
const { canUploadDocuments, listDocuments, openDocumentFile, uploadDocument } =
  await import("./documents")

const { setDocumentStoreForTests } = await import("../storage/store")

/**
 * An in-memory bucket, so the POSITIVE half of every "may this caller read the
 * bytes" pair can actually be asserted.
 *
 * The NEGATIVE half needs no store at all — a refused read never reaches one,
 * which is itself worth noticing: the row is gone from the query, not merely
 * denied at the storage layer. (The two "refuses the BYTES of" cases below pass
 * with no bucket configured at all, which is the strongest form of that claim.)
 *
 * Rows seeded through `createDocumentRow` have no object behind their key, so
 * `get` answers any key with a couple of bytes. That is enough for assertions
 * about WHICH row resolved, which is all this file asks.
 */
setDocumentStoreForTests({
  ...createMemoryDocumentStore(),
  get: async () => {
    const { Readable } = await import("node:stream")
    return Readable.from([Buffer.from("%PDF-1.7\n")])
  },
})

function as(headers: Headers): void {
  request.headers = headers
}

async function scopeFor(org: TestOrganization, account: TestAccount) {
  as(account.headers)
  return requireScope(org.slug)
}

/**
 * A whole book with two employee seats, a month of published payroll and a
 * payslip each.
 *
 * The two employees are given DIFFERENT figures so a leak is visible as a wrong
 * number rather than only as a wrong row count.
 */
type SeatWorld = {
  org: TestOrganization
  periodId: string
  jan: { employeeId: string; account: TestAccount; payslipId: string }
  petra: { employeeId: string; account: TestAccount; payslipId: string }
}

async function seatWorld(): Promise<SeatWorld> {
  const org = await seedOrganization()
  const periodId = await createMonthPeriod(org.organizationId)

  const build = async (name: string, gross: string) => {
    const account = await createAccount()
    await addGuest(org, account)
    const employeeId = await createPayrollEmployeeRow(org.organizationId, {
      fullName: name,
      appUserId: account.userId,
    })
    const payslipId = await createDocumentRow(org.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
      originalFilename: `${name}.pdf`,
    })
    return { account, employeeId, payslipId, gross }
  }

  const jan = await build("Jan Novák", "40000.00")
  const petra = await build("Petra Nová", "51000.00")

  await publishPayrollFixture(org.organizationId, periodId, {
    summary: { grossTotal: "91000.00", netPaidTotal: "70000.00" },
    lines: [
      { employeeId: jan.employeeId, gross: jan.gross, net: "31000.00" },
      { employeeId: petra.employeeId, gross: petra.gross, net: "39000.00" },
    ],
  })

  return { org, periodId, jan, petra }
}

/** A `guest` membership for an account that `seedOrganization` did not create. */
async function addGuest(
  org: TestOrganization,
  account: TestAccount,
): Promise<void> {
  const { addMembership } = await import("../../tests/fixtures")
  await addMembership(org.organizationId, account.userId, "guest")
}

let world: SeatWorld

beforeAll(async () => {
  world = await seatWorld()
})

afterAll(async () => {
  setDocumentStoreForTests(undefined)
  await endFixtures()
})

describe("payrollScope — the employee arm (spec §2.6.1)", () => {
  it("answers `employee` with the seat's own id", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    expect(payrollScope(scope)).toEqual({
      kind: "employee",
      employeeId: world.jan.employeeId,
    })
    expect(isEmployeeSeat(scope)).toBe(true)
  })

  it("still answers `none` for a guest with no link", async () => {
    const scope = await scopeFor(world.org, world.org.members.guest)
    expect(payrollScope(scope)).toEqual({ kind: "none" })
    expect(isEmployeeSeat(scope)).toBe(false)
  })

  it("answers `all` for a MANAGER who is also on the payroll", async () => {
    // The failure mode a naive "has a link ⇒ narrow" would produce: a company
    // owner drawing a salary, blinded to their own company's payroll.
    const org = await seedOrganization()
    await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Ředitel Ředitelský",
      appUserId: org.members.admin.userId,
    })
    const scope = await scopeFor(org, org.members.admin)
    expect(payrollScope(scope)).toEqual({ kind: "all" })
    expect(isEmployeeSeat(scope)).toBe(false)
  })
})

describe("cross-employee isolation — payroll lines, BOTH directions", () => {
  it("shows Jan his own line and not Petra's", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    const lines = await payrollLinesForEmployee(scope, world.jan.employeeId)
    expect(lines.map((line) => line.gross)).toEqual(["40000.00"])
    expect(lines.map((line) => line.employeeId)).toEqual([world.jan.employeeId])
  })

  it("shows Petra her own line and not Jan's", async () => {
    const scope = await scopeFor(world.org, world.petra.account)
    const lines = await payrollLinesForEmployee(scope, world.petra.employeeId)
    expect(lines.map((line) => line.gross)).toEqual(["51000.00"])
  })

  it("answers NOTHING when Jan asks for Petra's id by hand", async () => {
    // The seat's own id is ANDed in regardless of the argument, so passing a
    // colleague's id yields an empty conjunction rather than her rows.
    const scope = await scopeFor(world.org, world.jan.account)
    expect(
      await payrollLinesForEmployee(scope, world.petra.employeeId),
    ).toEqual([])
  })

  it("answers NOTHING when Petra asks for Jan's id by hand", async () => {
    const scope = await scopeFor(world.org, world.petra.account)
    expect(await payrollLinesForEmployee(scope, world.jan.employeeId)).toEqual(
      [],
    )
  })

  it("narrows the per-period line list to the caller's own row", async () => {
    const janScope = await scopeFor(world.org, world.jan.account)
    const petraScope = await scopeFor(world.org, world.petra.account)
    const ownerScope = await scopeFor(world.org, world.org.members.owner)

    expect(
      (await payrollLinesForPeriod(janScope, world.periodId)).map((l) => l.net),
    ).toEqual(["31000.00"])
    expect(
      (await payrollLinesForPeriod(petraScope, world.periodId)).map(
        (l) => l.net,
      ),
    ).toEqual(["39000.00"])
    // And the manager still sees both — the narrowing is not a global one.
    expect(
      (await payrollLinesForPeriod(ownerScope, world.periodId)).length,
    ).toBe(2)
  })

  it("narrows the employee REGISTER to the caller's own row", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    const register = await payrollEmployeesForScope(scope)
    expect(register.map((row) => row.fullName)).toEqual(["Jan Novák"])
  })
})

describe("cross-employee isolation — payslips, BOTH directions", () => {
  it("lists only Jan's payslip for Jan", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    const payslips = await payslipDocumentsForScope(scope)
    expect(payslips.map((p) => p.employeeId)).toEqual([world.jan.employeeId])
  })

  it("lists only Petra's payslip for Petra", async () => {
    const scope = await scopeFor(world.org, world.petra.account)
    const payslips = await payslipDocumentsForScope(scope)
    expect(payslips.map((p) => p.employeeId)).toEqual([world.petra.employeeId])
  })

  it("refuses Jan the BYTES of Petra's payslip", async () => {
    // The sharpest case in this PR: a document id is guessable-adjacent (it is
    // in a colleague's URL), and `openPayslipFile` has no other refusal to fall
    // back on — it resolves one row and streams it.
    const scope = await scopeFor(world.org, world.jan.account)
    expect(await openPayslipFile(scope, world.petra.payslipId)).toBeNull()
  })

  it("refuses Petra the BYTES of Jan's payslip", async () => {
    const scope = await scopeFor(world.org, world.petra.account)
    expect(await openPayslipFile(scope, world.jan.payslipId)).toBeNull()
  })

  it("serves each seat its OWN payslip bytes", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    const handle = await openPayslipFile(scope, world.jan.payslipId)
    expect(handle?.filename).toBe("Jan Novák.pdf")
    handle?.body.destroy()
  })

  it("still serves every payslip to a management seat", async () => {
    const scope = await scopeFor(world.org, world.org.members.member)
    expect((await payslipDocumentsForScope(scope)).length).toBe(2)
  })
})

describe("company-wide payroll is refused, not narrowed", () => {
  it("answers null for the period summary", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    expect(await payrollSummaryForPeriod(scope, world.periodId)).toBeNull()
  })

  it("answers an empty published-period axis", async () => {
    const scope = await scopeFor(world.org, world.jan.account)
    expect(await publishedPayrollPeriods(scope)).toEqual([])
  })
})

describe("cross-org isolation", () => {
  it("resolves no scope in a book the seat has no membership in", async () => {
    const other = await seedOrganization()
    as(world.jan.account.headers)
    expect(await resolveOrgScope(other.slug)).toBeNull()
  })

  it("does not carry a link across books", async () => {
    // The same human, an employee in book A and an ordinary guest in book B.
    // The LEFT JOIN is tenancy-carrying, so book B's scope must see no link.
    const other = await seedOrganization()
    await addGuest(other, world.jan.account)

    const here = await scopeFor(world.org, world.jan.account)
    const there = await scopeFor(other, world.jan.account)

    expect(payrollScope(here).kind).toBe("employee")
    expect(payrollScope(there)).toEqual({ kind: "none" })
    expect(isEmployeeSeat(there)).toBe(false)
  })

  it("refuses a payslip id from another book", async () => {
    const other = await seatWorld()
    const scope = await scopeFor(world.org, world.jan.account)
    expect(await openPayslipFile(scope, other.jan.payslipId)).toBeNull()
  })
})

describe("Dokumenty — the seat's personal folder (spec §2.6.1)", () => {
  it("lists only what the seat uploaded itself", async () => {
    const org = await seedOrganization()
    const account = await createAccount()
    await addGuest(org, account)
    await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Jan Zedník",
      appUserId: account.userId,
    })

    const mine = await createDocumentRow(org.organizationId, {
      originalFilename: "moje-dochazka.pdf",
      uploadedByUserId: account.userId,
    })
    // A colleague's upload and an office-created row (no uploader at all).
    await createDocumentRow(org.organizationId, {
      originalFilename: "kolegova-faktura.pdf",
      uploadedByUserId: org.members.member.userId,
    })
    await createDocumentRow(org.organizationId, {
      originalFilename: "smlouva-od-ucetni.pdf",
    })

    const scope = await scopeFor(org, account)
    const page = await listDocuments(scope)
    expect(page.documents.map((doc) => doc.filename)).toEqual([
      "moje-dochazka.pdf",
    ])
    expect(page.total).toBe(1)

    // The owner still sees all three — again, not a global narrowing.
    const ownerScope = await scopeFor(org, org.members.owner)
    expect((await listDocuments(ownerScope)).total).toBe(3)

    // And the bytes of a colleague's file are refused, not merely hidden from
    // the list: `openDocumentFile` runs the same five filters.
    const colleague = (await listDocuments(ownerScope)).documents.find(
      (doc) => doc.filename === "kolegova-faktura.pdf",
    )
    expect(colleague).toBeDefined()
    expect(await openDocumentFile(scope, colleague!.id)).toBeNull()
    expect(await openDocumentFile(scope, mine)).not.toBeNull()
  })

  it("lets the seat upload, unlike an unlinked guest", async () => {
    const seat = await scopeFor(world.org, world.jan.account)
    const guest = await scopeFor(world.org, world.org.members.guest)
    expect(canUploadDocuments(seat)).toBe(true)
    expect(canUploadDocuments(guest)).toBe(false)
  })

  it("round-trips a real upload: the seat can read back what it wrote", async () => {
    // The widening and the narrowing landed in one change, and the failure
    // mode of getting them half right is a seat that uploads a file it can
    // then never see. The bytes go through `uploadDocument`, which is what
    // stamps `uploaded_by_user_id` — the input to filter 5.
    const org = await seedOrganization()
    const account = await createAccount()
    await addGuest(org, account)
    await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Jan Zedník",
      appUserId: account.userId,
    })
    const scope = await scopeFor(org, account)

    const filename = `${unique("dochazka")}.pdf`
    const result = await uploadDocument(scope, {
      filename,
      docType: "attendance",
      // Salted so the org+sha256 unique index sees a genuinely new file.
      source: (async function* () {
        yield new Uint8Array(Buffer.from(`%PDF-1.7\n${unique("salt")}`))
      })(),
    })
    expect(result.ok).toBe(true)

    const page = await listDocuments(scope)
    expect(page.documents.map((doc) => doc.filename)).toContain(filename)

    // AND THE OTHER DIRECTION IS DELIBERATELY *NOT* NARROWED. The seat's
    // upload is an ordinary client-visible document of the company's book, so
    // the office and every other client-tier viewer see it — spec §5 makes an
    // unlinked guest "an external VIEWER of all client-visible data", and §2.6.1
    // narrows what a SEAT may see, never what others may see of the seat's
    // uploads. A docházka sheet an employee hands to the accountant is the
    // company's document; hiding it from the company would break the workflow
    // the upload exists for.
    const otherGuest = await scopeFor(org, org.members.guest)
    const ownerScope = await scopeFor(org, org.members.owner)
    expect(
      (await listDocuments(ownerScope)).documents.map((doc) => doc.filename),
    ).toContain(filename)
    expect(
      (await listDocuments(otherGuest)).documents.map((doc) => doc.filename),
    ).toContain(filename)
  })
})

describe("the seat is refused every other org-tier surface", () => {
  it("throws the uniform 404 from assertNotEmployeeSeat", async () => {
    const { assertNotEmployeeSeat } = await import("./scope")
    const seat = await scopeFor(world.org, world.jan.account)
    const guest = await scopeFor(world.org, world.org.members.guest)
    const owner = await scopeFor(world.org, world.org.members.owner)

    expect(() => assertNotEmployeeSeat(seat)).toThrow()
    // An ordinary guest is NOT refused: they are an external viewer of
    // client-visible data (§5), and this gate is about the seat alone.
    expect(() => assertNotEmployeeSeat(guest)).not.toThrow()
    expect(() => assertNotEmployeeSeat(owner)).not.toThrow()
  })
})

describe("the scope never serialises the link", () => {
  it("keeps payroll_employee_id off every client projection", async () => {
    const { forbiddenClientKeys } = await import("./projections")
    const scope = await scopeFor(world.org, world.jan.account)

    for (const value of [
      await payrollEmployeesForScope(scope),
      await payrollLinesForEmployee(scope, world.jan.employeeId),
      await payslipDocumentsForScope(scope),
      (await listDocuments(scope)).documents,
    ]) {
      expect(forbiddenClientKeys(value)).toEqual([])
    }
  })

  it("has an id on the handle that a projection would have leaked", async () => {
    // Non-vacuity for the assertion above: the value IS present server-side,
    // so the empty `forbiddenClientKeys` results are the projections doing
    // their job rather than there being nothing to find.
    const scope = await scopeFor(world.org, world.jan.account)
    expect(scope.payrollEmployeeId).toBe(world.jan.employeeId)
    expect(unique("x")).toBeTruthy()
  })
})
