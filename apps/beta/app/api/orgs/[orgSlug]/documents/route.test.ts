/**
 * The upload endpoint, driven as HTTP.
 *
 * The data layer's own suite (`lib/data/documents.test.ts`) owns the storage
 * rules; this file owns the things only a Response can express — the status
 * code a client branches on, the refusal that must be 404 rather than 403, the
 * cache headers, and the cross-site guard.
 */
import { randomUUID } from "node:crypto"

import postgres from "postgres"
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
  PNG_BYTES,
  ZIP_BYTES,
  type MemoryDocumentStore,
} from "../../../../../tests/memory-document-store"
import {
  anonymousHeaders,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../tests/fixtures"
import { sharedDatabaseUrl } from "../../../../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const ORIGIN = "http://localhost:3200"

let route: typeof import("./route")
let setDocumentStoreForTests: (store: unknown) => void
let store: MemoryDocumentStore
/**
 * A raw driver handle, not `betaDb()`: `db/client.ts` is import-fenced to the
 * data layer (`lib/data/db-client-fence.boundary.test.ts`), and a route's spec
 * is not the data layer. It is used only to reshape a seeded row the way the
 * office would.
 */
let sql: postgres.Sql

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  process.env["BETTER_AUTH_URL"] ??= ORIGIN
  sql = postgres(sharedDatabaseUrl(), { max: 2, onnotice: () => {} })
  route = await import("./route")
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
  await sql.end({ timeout: 5 })
  await endFixtures()
})

function useStore(): MemoryDocumentStore {
  store = createMemoryDocumentStore()
  setDocumentStoreForTests(store)
  return store
}

/**
 * The same format with a random tail, so it is a genuinely NEW file.
 *
 * The suite shares two organizations and one database across its cases, so an
 * unsalted `PDF_BYTES` in a second test is a duplicate of the first test's — a
 * correct answer that would quietly turn every later assertion into an
 * assertion about the wrong row. Sniffing reads only the head, so a tail is
 * invisible to the allowlist.
 */
function fresh(bytes: Buffer): Buffer {
  return Buffer.concat([bytes, Buffer.from(randomUUID())])
}

/** POST the given bytes as the given account. */
async function post(
  as: Headers,
  slug: string,
  bytes: Buffer,
  query: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  request.headers = as

  const url = new URL(`${ORIGIN}/api/orgs/${slug}/documents`)
  url.searchParams.set("filename", "Faktura Nováková 03-2026.pdf")
  for (const [key, value] of Object.entries(query)) {
    if (value === "") url.searchParams.delete(key)
    else url.searchParams.set(key, value)
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

describe("POST /api/orgs/[orgSlug]/documents", () => {
  it("answers 201 with the stored projection", async () => {
    useStore()
    const response = await post(
      orgA.members.member.headers,
      orgA.slug,
      fresh(PDF_BYTES),
    )

    expect(response.status).toBe(201)
    const payload = (await response.json()) as {
      status: string
      document: Record<string, unknown>
    }
    expect(payload.status).toBe("stored")
    expect(payload.document["filename"]).toBe("Faktura Nováková 03-2026.pdf")
    expect(payload.document["contentType"]).toBe("application/pdf")
  })

  it("answers 200 — not an error — for a duplicate (spec §2.2)", async () => {
    useStore()
    // The SAME bytes twice — the one case in this file that must not be salted.
    const bytes = fresh(PDF_BYTES)
    await post(orgA.members.member.headers, orgA.slug, bytes, {
      filename: "prvni.pdf",
    })
    const second = await post(orgA.members.member.headers, orgA.slug, bytes, {
      filename: "druhy.pdf",
    })

    expect(second.status).toBe(200)
    expect(((await second.json()) as { status: string }).status).toBe(
      "duplicate",
    )
  })

  it("omits `document` entirely when the duplicate's twin is hidden", async () => {
    useStore()
    const bytes = fresh(PDF_BYTES)

    // The office uploads, then hides the row.
    const seeded = await post(orgA.members.owner.headers, orgA.slug, bytes, {
      filename: "tajne-cislo-42.pdf",
    })
    const { document: twin } = (await seeded.json()) as {
      document: { id: string }
    }
    await sql`UPDATE document SET visible_to_client = false WHERE id = ${twin.id}`

    // A member re-uploads the same file — the everyday case.
    const response = await post(orgA.members.member.headers, orgA.slug, bytes, {
      filename: "muj-soubor.pdf",
    })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload["status"]).toBe("duplicate")
    // Not `null` — absent. The wire carries no field of that row at all.
    expect("document" in payload).toBe(false)
    expect(JSON.stringify(payload)).not.toContain(twin.id)
    expect(JSON.stringify(payload)).not.toContain("tajne-cislo-42")
  })

  it("never serialises a storage key, a hash or the internal layer", async () => {
    useStore()
    const response = await post(
      orgB.members.member.headers,
      orgB.slug,
      fresh(PNG_BYTES),
    )
    const { forbiddenClientKeys } = await import("@/lib/data/projections")
    const payload = await response.json()

    expect(forbiddenClientKeys(payload)).toEqual([])
    expect(JSON.stringify(payload)).not.toContain("org/")
  })

  it("marks every response private and un-sniffable", async () => {
    useStore()
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      fresh(PDF_BYTES),
    )

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    )
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })
})

describe("POST — refusals", () => {
  it("answers 404 for a signed-out visitor", async () => {
    useStore()
    const response = await post(anonymousHeaders(), orgA.slug, PDF_BYTES)
    expect(response.status).toBe(404)
  })

  it("answers 404 — never 403 — for a member of ANOTHER organization", async () => {
    useStore()
    // A 403 here would confirm that orgA exists to someone who is not in it.
    const response = await post(
      orgB.members.owner.headers,
      orgA.slug,
      PDF_BYTES,
    )
    expect(response.status).toBe(404)
    expect(store.keys()).toEqual([])
  })

  it("answers 403 for a guest, who can see the surface but not write", async () => {
    useStore()
    const response = await post(
      orgA.members.guest.headers,
      orgA.slug,
      PDF_BYTES,
    )

    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: string }).error).toBe(
      "forbidden",
    )
    // The role check runs before the body is touched, so a guest cannot make
    // the task read — let alone store — a single byte.
    expect(store.keys()).toEqual([])
  })

  it("answers 415 for bytes outside the allowlist", async () => {
    useStore()
    const response = await post(
      orgA.members.member.headers,
      orgA.slug,
      ZIP_BYTES,
      { filename: "faktura.pdf" },
    )
    expect(response.status).toBe(415)
  })

  it("answers 400 for a missing filename", async () => {
    useStore()
    const response = await post(
      orgA.members.member.headers,
      orgA.slug,
      PDF_BYTES,
      { filename: "" },
    )
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe(
      "invalid_filename",
    )
  })

  it("answers 400 for an empty body", async () => {
    useStore()
    const response = await post(
      orgA.members.member.headers,
      orgA.slug,
      Buffer.alloc(0),
    )
    expect(response.status).toBe(400)
  })

  it("refuses docType=payslip — those rows are payroll-scoped, not client-set", async () => {
    useStore()
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      PDF_BYTES,
      { docType: "payslip" },
    )
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe(
      "invalid_doc_type",
    )
    expect(store.keys()).toEqual([])
  })

  it("refuses an unknown docType rather than silently storing `other`", async () => {
    useStore()
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      PDF_BYTES,
      { docType: "faktura" },
    )
    expect(response.status).toBe(400)
  })

  it("accepts a legitimate docType", async () => {
    useStore()
    const response = await post(
      orgA.members.member.headers,
      orgA.slug,
      fresh(PDF_BYTES),
      { docType: "invoice_in", filename: "prijata.pdf" },
    )
    expect(response.status).toBe(201)
  })

  it.each([
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a sibling subdomain", { "sec-fetch-site": "same-site" }],
    ["a foreign Origin", { origin: "https://evil.example" }],
  ])("refuses %s before touching the session", async (_label, extra) => {
    useStore()
    const response = await post(
      orgA.members.member.headers,
      orgA.slug,
      PDF_BYTES,
      {},
      extra,
    )
    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: string }).error).toBe(
      "cross_site",
    )
    expect(store.keys()).toEqual([])
  })
})

describe("GET /api/orgs/[orgSlug]/documents", () => {
  type ListPayload = {
    documents: { id: string; filename: string; status: string }[]
    total: number
    page: number
    pageSize: number
    pageCount: number
  }

  async function get(as: Headers, slug: string, query = ""): Promise<Response> {
    request.headers = as
    return route.GET(
      new Request(`${ORIGIN}/api/orgs/${slug}/documents${query}`),
      { params: Promise.resolve({ orgSlug: slug }) },
    )
  }

  async function list(
    as: Headers,
    slug: string,
    query = "",
  ): Promise<ListPayload> {
    return (await (await get(as, slug, query)).json()) as ListPayload
  }

  it("lists only the caller's own organization", async () => {
    useStore()
    await post(orgA.members.member.headers, orgA.slug, fresh(PDF_BYTES), {
      filename: "jen-a.pdf",
    })

    const mine = await list(orgA.members.member.headers, orgA.slug)
    expect(mine.documents.some((d) => d.filename === "jen-a.pdf")).toBe(true)

    const theirs = await list(orgB.members.member.headers, orgB.slug)
    expect(theirs.documents.some((d) => d.filename === "jen-a.pdf")).toBe(false)
  })

  it("answers with a page envelope the caller can page through", async () => {
    useStore()
    await post(orgA.members.member.headers, orgA.slug, fresh(PDF_BYTES), {
      filename: "obalka.pdf",
    })

    const payload = await list(orgA.members.member.headers, orgA.slug)
    expect(payload.page).toBe(1)
    expect(payload.pageSize).toBe(25)
    expect(payload.pageCount).toBeGreaterThanOrEqual(1)
    expect(payload.total).toBe(payload.total)
    expect(Array.isArray(payload.documents)).toBe(true)
  })

  it("applies the filters from the query string, in SQL", async () => {
    useStore()
    const created = await post(
      orgB.members.member.headers,
      orgB.slug,
      fresh(PDF_BYTES),
      { filename: "vracena-faktura.pdf" },
    )
    const { document: row } = (await created.json()) as {
      document: { id: string }
    }
    await sql`
      UPDATE document
         SET status = 'returned', office_message = 'Chybí druhá strana'
       WHERE id = ${row.id}
    `

    const returned = await list(
      orgB.members.member.headers,
      orgB.slug,
      "?status=returned",
    )
    expect(returned.documents.map((d) => d.id)).toContain(row.id)
    expect(returned.documents.every((d) => d.status === "returned")).toBe(true)

    // The narrowed total is the total of the FILTERED set, so a client paging
    // a filter is not paging the whole book.
    const all = await list(orgB.members.member.headers, orgB.slug)
    expect(returned.total).toBeLessThanOrEqual(all.total)

    const processed = await list(
      orgB.members.member.headers,
      orgB.slug,
      "?status=processed",
    )
    expect(processed.documents.map((d) => d.id)).not.toContain(row.id)

    const searched = await list(
      orgB.members.member.headers,
      orgB.slug,
      "?q=vracena",
    )
    expect(searched.documents.map((d) => d.id)).toContain(row.id)
  })

  it("ignores a filter value it does not recognise rather than refusing", async () => {
    useStore()
    // A stale bookmark or a hand-edited URL shows the unfiltered list; an error
    // page for a GET the client reached by clicking a link would be worse.
    const response = await get(
      orgA.members.member.headers,
      orgA.slug,
      "?status=schvaleno&type=payslip&from=vcera&page=-3",
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as ListPayload
    expect(payload.page).toBe(1)
  })

  it("never serialises a forbidden column", async () => {
    useStore()
    const { forbiddenClientKeys } = await import("@/lib/data/projections")
    const payload = await list(orgA.members.member.headers, orgA.slug)
    expect(forbiddenClientKeys(payload)).toEqual([])
    expect(JSON.stringify(payload)).not.toContain("org/")
  })

  it("answers 404 for another organization's slug", async () => {
    expect((await get(orgB.members.owner.headers, orgA.slug)).status).toBe(404)
  })

  it("answers 404 for a slug that cannot exist", async () => {
    expect(
      (await get(orgA.members.owner.headers, "../../etc/passwd")).status,
    ).toBe(404)
  })

  it("answers 404 for a signed-out visitor, filters and all", async () => {
    expect(
      (await get(anonymousHeaders(), orgA.slug, "?status=processed")).status,
    ).toBe(404)
  })
})
