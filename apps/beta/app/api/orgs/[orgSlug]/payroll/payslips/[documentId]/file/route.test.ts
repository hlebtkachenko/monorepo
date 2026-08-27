/**
 * The payslip download endpoint.
 *
 * What only this layer proves: the bytes come back byte-identical through a
 * streamed Response, the disposition is always `attachment`, and a payslip id
 * from another organization — or an ordinary (non-payslip) document's id —
 * answers the same 404 an invented id gets.
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
  type MemoryDocumentStore,
} from "../../../../../../../../tests/memory-document-store"
import {
  createDocumentRow,
  createMonthPeriod,
  createPayrollEmployeeRow,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestOrganization,
} from "../../../../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const ORIGIN = "http://localhost:3200"

let route: typeof import("./route")
let uploadPayslipDocument: typeof import("@/lib/data/payslips").uploadPayslipDocument
let requireOwner: typeof import("@/lib/data/scope").requireOwner
let requireScope: typeof import("@/lib/data/scope").requireScope
let setDocumentStoreForTests: (store: unknown) => void

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  process.env["BETTER_AUTH_URL"] ??= ORIGIN
  route = await import("./route")
  const payslips = await import("@/lib/data/payslips")
  uploadPayslipDocument = payslips.uploadPayslipDocument
  const scope = await import("@/lib/data/scope")
  requireOwner = scope.requireOwner
  requireScope = scope.requireScope
  const storeModule = await import("@/lib/storage/store")
  setDocumentStoreForTests = storeModule.setDocumentStoreForTests as (
    store: unknown,
  ) => void
  ;[orgA, orgB] = [await seedOrganization(), await seedOrganization()]
})

afterEach(() => {
  setDocumentStoreForTests(undefined)
})

afterAll(async () => {
  await endFixtures()
})

function useStore(): MemoryDocumentStore {
  const store = createMemoryDocumentStore()
  setDocumentStoreForTests(store)
  return store
}

async function get(
  as: Headers,
  slug: string,
  documentId: string,
): Promise<Response> {
  request.headers = as
  return route.GET(new Request(`${ORIGIN}/x`), {
    params: Promise.resolve({ orgSlug: slug, documentId }),
  })
}

/**
 * A real, store-backed payslip — the read path this route exercises.
 *
 * The bytes carry a random tail so a THIRD call in this file (there are
 * three `seedPayslip(orgA)` calls) is genuinely new content rather than the
 * org-wide `(organization_id, sha256)` unique index's idea of the same
 * upload again — `uploadPayslipDocument` would otherwise answer `duplicate`
 * for the second and third calls instead of `stored`.
 */
async function seedPayslip(org: TestOrganization): Promise<{
  documentId: string
  bytes: Buffer
}> {
  const periodId = await createMonthPeriod(org.organizationId)
  const employeeId = await createPayrollEmployeeRow(org.organizationId)
  await publishPayrollFixture(org.organizationId, periodId)

  request.headers = org.members.owner.headers
  const owner = requireOwner(await requireScope(org.slug))

  const bytes = Buffer.concat([PDF_BYTES, Buffer.from(randomUUID())])
  async function* chunks() {
    yield new Uint8Array(bytes)
  }

  const result = await uploadPayslipDocument(owner, {
    filename: "vyplatnice.pdf",
    employeeId,
    periodId,
    source: chunks(),
  })
  if (!result.ok || result.status !== "stored") {
    throw new Error("fixture upload did not store")
  }
  return { documentId: result.documentId, bytes }
}

describe("GET /api/orgs/[orgSlug]/payroll/payslips/[documentId]/file", () => {
  it("streams the exact bytes, as an attachment, for a management seat", async () => {
    useStore()
    const { documentId, bytes } = await seedPayslip(orgA)

    const response = await get(
      orgA.members.admin.headers,
      orgA.slug,
      documentId,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain("attachment")
    expect(response.headers.get("content-type")).toBe("application/pdf")
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.equals(bytes)).toBe(true)
  })

  it("answers 404 for a guest", async () => {
    useStore()
    const { documentId } = await seedPayslip(orgA)
    const response = await get(
      orgA.members.guest.headers,
      orgA.slug,
      documentId,
    )
    expect(response.status).toBe(404)
  })

  it("answers 404 for another organization's payslip id", async () => {
    useStore()
    const { documentId } = await seedPayslip(orgA)
    const response = await get(
      orgB.members.owner.headers,
      orgB.slug,
      documentId,
    )
    expect(response.status).toBe(404)
  })

  it("answers 404 for an ordinary (non-payslip) document id", async () => {
    useStore()
    const documentId = await createDocumentRow(orgA.organizationId, {
      docType: "other",
    })
    const response = await get(
      orgA.members.owner.headers,
      orgA.slug,
      documentId,
    )
    expect(response.status).toBe(404)
  })
})
