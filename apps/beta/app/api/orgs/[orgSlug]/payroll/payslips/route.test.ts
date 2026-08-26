/**
 * The payslip upload endpoint, driven as HTTP.
 *
 * The data layer's own suite (`lib/data/payslips.test.ts`) owns the storage
 * and matching rules; this file owns what only a Response can express — the
 * status code a client branches on, the owner-only write gate (spec §5), and
 * the cross-site guard `documents/route.test.ts` already proves for its twin.
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
} from "../../../../../../tests/memory-document-store"
import {
  anonymousHeaders,
  createMonthPeriod,
  createPayrollEmployeeRow,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestOrganization,
} from "../../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const ORIGIN = "http://localhost:3200"

let route: typeof import("./route")
let setDocumentStoreForTests: (store: unknown) => void
let store: MemoryDocumentStore

let orgA: TestOrganization
let orgB: TestOrganization
let periodId: string
let employeeId: string

beforeAll(async () => {
  process.env["BETTER_AUTH_URL"] ??= ORIGIN
  route = await import("./route")
  const storeModule = await import("@/lib/storage/store")
  setDocumentStoreForTests = storeModule.setDocumentStoreForTests as (
    store: unknown,
  ) => void
  ;[orgA, orgB] = [await seedOrganization(), await seedOrganization()]
  periodId = await createMonthPeriod(orgA.organizationId)
  employeeId = await createPayrollEmployeeRow(orgA.organizationId)
  await publishPayrollFixture(orgA.organizationId, periodId)
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

function fresh(bytes: Buffer): Buffer {
  return Buffer.concat([bytes, Buffer.from(randomUUID())])
}

async function post(
  as: Headers,
  slug: string,
  bytes: Buffer,
  query: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  request.headers = as

  const url = new URL(`${ORIGIN}/api/orgs/${slug}/payroll/payslips`)
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.length > 0) controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })

  return route.POST(
    new Request(url, {
      method: "POST",
      body,
      duplex: "half",
      headers: {
        "sec-fetch-site": "same-origin",
        origin: ORIGIN,
        ...extraHeaders,
      },
    } as RequestInit & { duplex: "half" }),
    { params: Promise.resolve({ orgSlug: slug }) },
  )
}

describe("POST /api/orgs/[orgSlug]/payroll/payslips", () => {
  it("answers 201 with the new document id, for the owner", async () => {
    useStore()
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      fresh(PDF_BYTES),
      { filename: "vyplatnice.pdf", employeeId, periodId },
    )

    expect(response.status).toBe(201)
    const payload = (await response.json()) as {
      status: string
      documentId: string
    }
    expect(payload.status).toBe("stored")
    expect(typeof payload.documentId).toBe("string")
  })

  it("refuses admin and member — payroll writes are owner-only (spec §5)", async () => {
    useStore()
    for (const role of ["admin", "member"] as const) {
      const response = await post(
        orgA.members[role].headers,
        orgA.slug,
        fresh(PDF_BYTES),
        { filename: "vyplatnice.pdf", employeeId, periodId },
      )
      expect(response.status, role).toBe(403)
    }
  })

  it("answers 404 for a signed-out visitor — the membership-oracle floor", async () => {
    useStore()
    const response = await post(
      anonymousHeaders(),
      orgA.slug,
      fresh(PDF_BYTES),
      { filename: "vyplatnice.pdf", employeeId, periodId },
    )
    expect(response.status).toBe(404)
  })

  it("refuses an employee id from another organization", async () => {
    useStore()
    const foreignEmployeeId = await createPayrollEmployeeRow(
      orgB.organizationId,
    )
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      fresh(PDF_BYTES),
      { filename: "vyplatnice.pdf", employeeId: foreignEmployeeId, periodId },
    )
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe(
      "unknown_employee",
    )
  })

  it("refuses a type outside the storage allowlist", async () => {
    useStore()
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      fresh(ZIP_BYTES),
      { filename: "vyplatnice.pdf", employeeId, periodId },
    )
    expect(response.status).toBe(415)
  })

  it("refuses a cross-site request", async () => {
    useStore()
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      fresh(PDF_BYTES),
      { filename: "vyplatnice.pdf", employeeId, periodId },
      { "sec-fetch-site": "cross-site" },
    )
    expect(response.status).toBe(403)
  })
})
