/**
 * Mzdy › Výplatnice's data layer, against a real Postgres 18.
 *
 * THREE PROPERTIES THIS FILE EXISTS TO PROVE, mirroring `payroll.test.ts`'s
 * own three:
 *
 *   1. VISIBILITY. `payrollScope()` gates every read here exactly as it gates
 *      `payroll.ts` — an unlinked guest sees NO payslip, a management seat
 *      sees every one, and a payslip from another organization is unreachable
 *      regardless of role.
 *   2. THE UPLOAD NEVER ATTACHES A FILE TO SOMEONE OUTSIDE THIS BOOK.
 *      `uploadPayslipDocument` re-validates `employeeId` and `periodId`
 *      against the caller's OWN organization rather than trusting the
 *      client-proposed match.
 *   3. THE STORAGE INVARIANTS `documents.ts` PROVES ALSO HOLD HERE — the
 *      quota and the organization-wide duplicate detection — because both
 *      write paths share the same table and the same bucket.
 */
import { randomUUID } from "node:crypto"

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  createMemoryDocumentStore,
  PDF_BYTES,
  ZIP_BYTES,
  type MemoryDocumentStore,
} from "../../tests/memory-document-store"
import {
  createDocumentRow,
  createMonthPeriod,
  createPayrollEmployeeRow,
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
const { payslipDocumentsForScope, openPayslipFile, uploadPayslipDocument } =
  await import("./payslips")
const { setDocumentStoreForTests } = await import("@/lib/storage/store")

type Role = "owner" | "admin" | "member" | "guest"
const MANAGEMENT: readonly Role[] = ["owner", "admin", "member"]

let orgA: TestOrganization
let orgB: TestOrganization
let store: MemoryDocumentStore

beforeAll(async () => {
  ;[orgA, orgB] = [await seedOrganization(), await seedOrganization()]
})

afterEach(() => {
  setDocumentStoreForTests(undefined)
})

afterAll(async () => {
  await endFixtures()
})

function useStore(): MemoryDocumentStore {
  store = createMemoryDocumentStore()
  setDocumentStoreForTests(store)
  return store
}

async function scopeAs(org: TestOrganization, role: Role) {
  request.headers = org.members[role].headers
  return requireScope(org.slug)
}

async function ownerScopeOf(org: TestOrganization) {
  return requireOwner(await scopeAs(org, "owner"))
}

async function chunksOf(bytes: Buffer): Promise<AsyncIterable<Uint8Array>> {
  async function* iter() {
    yield new Uint8Array(bytes)
  }
  return iter()
}

/**
 * The same bytes with a random tail — the org-wide `(organization_id,
 * sha256)` unique index means every test that wants "stored", not
 * "duplicate", needs genuinely new bytes; `orgA` is shared across this whole
 * file. Sniffing reads only the head, so a tail never changes the type.
 */
function fresh(bytes: Buffer): Buffer {
  return Buffer.concat([bytes, Buffer.from(randomUUID())])
}

/**
 * `createMonthPeriod`'s own default year (2026) plus its file-wide,
 * cross-organization month counter means two organizations sharing a file —
 * exactly `orgA`/`orgB` here — can walk the counter past 12 calls and revisit
 * a month `orgA` (or `orgB`) already holds, which
 * `reporting_period_identity_unique` then refuses as a genuine duplicate.
 * Every period this file creates is given its OWN year instead, so no two
 * calls can ever collide regardless of call count or interleaving.
 */
let nextTestYear = 2000
function freshYear(): number {
  nextTestYear += 1
  return nextTestYear
}

async function seedPayrollWorld(org: TestOrganization) {
  const periodId = await createMonthPeriod(org.organizationId, freshYear())
  const employeeId = await createPayrollEmployeeRow(org.organizationId)
  await publishPayrollFixture(org.organizationId, periodId)
  return { periodId, employeeId }
}

describe("payslipDocumentsForScope — visibility (spec §2.6.1)", () => {
  it("answers [] for a guest — no employee link exists yet", async () => {
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    await createDocumentRow(orgA.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
    })

    const guest = await scopeAs(orgA, "guest")
    expect(await payslipDocumentsForScope(guest)).toEqual([])
  })

  it("returns every payslip for every management seat", async () => {
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    const documentId = await createDocumentRow(orgA.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
    })

    for (const role of MANAGEMENT) {
      const scope = await scopeAs(orgA, role)
      const rows = await payslipDocumentsForScope(scope)
      expect(
        rows.map((row) => row.id),
        role,
      ).toContain(documentId)
    }
  })

  it("never crosses organizations", async () => {
    // Two BRAND NEW organizations, local to this test: `orgA`/`orgB` are
    // shared across the whole file, so asserting "sees []" against either
    // of them would also be asserting about every OTHER test's rows.
    const withPayslip = await seedOrganization()
    const withoutPayslip = await seedOrganization()
    const { periodId, employeeId } = await seedPayrollWorld(withPayslip)
    await createDocumentRow(withPayslip.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
    })

    const otherOwner = await scopeAs(withoutPayslip, "owner")
    const rows = await payslipDocumentsForScope(otherOwner)
    expect(rows).toEqual([])
  })

  it("narrows to the requested period", async () => {
    const org = orgA
    const employeeId = await createPayrollEmployeeRow(org.organizationId)
    const periodOne = await createMonthPeriod(org.organizationId, freshYear())
    const periodTwo = await createMonthPeriod(org.organizationId, freshYear())
    await publishPayrollFixture(org.organizationId, periodOne)
    await publishPayrollFixture(org.organizationId, periodTwo)
    const docOne = await createDocumentRow(org.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodOne,
    })
    await createDocumentRow(org.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodTwo,
    })

    const owner = await scopeAs(org, "owner")
    const rows = await payslipDocumentsForScope(owner, { periodId: periodOne })
    expect(rows.map((row) => row.id)).toEqual([docOne])
  })
})

describe("openPayslipFile — visibility and tenancy", () => {
  it("answers null for a guest", async () => {
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    const documentId = await createDocumentRow(orgA.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
    })

    const guest = await scopeAs(orgA, "guest")
    expect(await openPayslipFile(guest, documentId)).toBeNull()
  })

  it("answers null for another organization's payslip id", async () => {
    const { periodId, employeeId } = await seedPayrollWorld(orgB)
    const documentId = await createDocumentRow(orgB.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
    })

    const ownerA = await scopeAs(orgA, "owner")
    expect(await openPayslipFile(ownerA, documentId)).toBeNull()
  })

  it("answers null for an ordinary (non-payslip) document id", async () => {
    const documentId = await createDocumentRow(orgA.organizationId, {
      docType: "other",
    })
    const owner = await scopeAs(orgA, "owner")
    expect(await openPayslipFile(owner, documentId)).toBeNull()
  })
})

describe("uploadPayslipDocument — writes (spec §2.6 Výplatnice)", () => {
  it("stores a valid PDF against the named employee and period", async () => {
    useStore()
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    const owner = await ownerScopeOf(orgA)

    const result = await uploadPayslipDocument(owner, {
      filename: "vyplatnice.pdf",
      employeeId,
      periodId,
      source: await chunksOf(fresh(PDF_BYTES)),
    })

    expect(result).toEqual({
      ok: true,
      status: "stored",
      documentId: expect.any(String),
    })

    // Filtered to THIS test's own fresh period — `orgA` is shared across the
    // whole file, so an unfiltered read would also see every other test's
    // rows for this organization.
    const rows = await payslipDocumentsForScope(await scopeAs(orgA, "owner"), {
      periodId,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.employeeId).toBe(employeeId)
    expect(rows[0]?.periodId).toBe(periodId)
  })

  it("refuses an employee id from another organization", async () => {
    useStore()
    const { periodId } = await seedPayrollWorld(orgA)
    const { employeeId: foreignEmployeeId } = await seedPayrollWorld(orgB)
    const owner = await ownerScopeOf(orgA)

    const result = await uploadPayslipDocument(owner, {
      filename: "vyplatnice.pdf",
      employeeId: foreignEmployeeId,
      periodId,
      source: await chunksOf(PDF_BYTES),
    })

    expect(result).toEqual({ ok: false, reason: "unknown_employee" })
  })

  it("refuses a period with no published payroll batch", async () => {
    useStore()
    const { employeeId } = await seedPayrollWorld(orgA)
    // A real period, but never fed through `publishPayrollFixture` — no
    // published `payroll` batch exists for it.
    const unpublishedPeriodId = await createMonthPeriod(
      orgA.organizationId,
      freshYear(),
    )
    const owner = await ownerScopeOf(orgA)

    const result = await uploadPayslipDocument(owner, {
      filename: "vyplatnice.pdf",
      employeeId,
      periodId: unpublishedPeriodId,
      source: await chunksOf(PDF_BYTES),
    })

    expect(result).toEqual({ ok: false, reason: "unknown_period" })
  })

  it("refuses a type outside the storage allowlist", async () => {
    useStore()
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    const owner = await ownerScopeOf(orgA)

    const result = await uploadPayslipDocument(owner, {
      filename: "vyplatnice.pdf",
      employeeId,
      periodId,
      source: await chunksOf(ZIP_BYTES),
    })

    expect(result).toEqual({ ok: false, reason: "unsupported_type" })
  })

  it("answers duplicate — never an error — for bytes already on the book", async () => {
    useStore()
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    const owner = await ownerScopeOf(orgA)
    const bytes = fresh(PDF_BYTES)

    const first = await uploadPayslipDocument(owner, {
      filename: "prvni.pdf",
      employeeId,
      periodId,
      source: await chunksOf(bytes),
    })
    expect(first.ok && first.status).toBe("stored")

    const second = await uploadPayslipDocument(owner, {
      filename: "druhy.pdf",
      employeeId,
      periodId,
      source: await chunksOf(bytes),
    })
    expect(second).toEqual({ ok: true, status: "duplicate" })

    // The duplicate's bytes were discarded, not left orphaned in the bucket.
    expect(store.keys()).toHaveLength(1)
  })

  it("refuses once the organization's quota is exhausted", async () => {
    useStore()
    const { periodId, employeeId } = await seedPayrollWorld(orgA)
    const owner = await ownerScopeOf(orgA)

    // Push the organization's own usage over its quota via plain rows, then
    // confirm the next payslip upload is refused rather than silently stored.
    // `document_byte_size_range` caps a single row at 25 MiB (the same
    // number the upload stream itself aborts at), so exceeding the 5 GiB
    // quota takes many rows at that ceiling, not one — 205 of them, one over
    // `ceil(quota / 25 MiB)`, generated in a single statement.
    const postgres = (await import("postgres")).default
    const { sharedDatabaseUrl } = await import("../../tests/scratch-db")
    const client = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
    try {
      await client`
        INSERT INTO document (
          organization_id, doc_type, original_filename, storage_key,
          content_type, extension, byte_size, sha256
        )
        SELECT
          ${orgA.organizationId}, 'other', 'obri.pdf',
          'org/' || ${orgA.organizationId}::text || '/' || gen_random_uuid()::text || '.pdf',
          'application/pdf', 'pdf', 26214400, md5(random()::text) || md5(random()::text)
        FROM generate_series(1, 205)
      `

      const result = await uploadPayslipDocument(owner, {
        filename: "vyplatnice.pdf",
        employeeId,
        periodId,
        source: await chunksOf(PDF_BYTES),
      })

      expect(result).toEqual({ ok: false, reason: "quota_exceeded" })
    } finally {
      await client.end({ timeout: 5 })
    }
  })
})
