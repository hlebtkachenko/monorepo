/**
 * The download endpoint.
 *
 * Three things only this layer can be tested for: that the bytes come back
 * byte-identical through a streamed Response, that the header set is the one
 * the spec requires (RFC 5987 filename, `nosniff`, attachment-by-default,
 * inline only for raster images), and that a document id from another
 * organization is a 404 and not a file.
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
  HEIC_BYTES,
  JPEG_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  type MemoryDocumentStore,
} from "../../../../../../../tests/memory-document-store"
import {
  anonymousHeaders,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const ORIGIN = "http://localhost:3200"
const CZECH_FILENAME = "Příjmový doklad č. 12.pdf"

let route: typeof import("./route")
let uploadDocument: typeof import("@/lib/data/documents").uploadDocument
let resolveOrgScope: typeof import("@/lib/data/scope").resolveOrgScope
let setDocumentStoreForTests: (store: unknown) => void
let store: MemoryDocumentStore

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  process.env["BETTER_AUTH_URL"] ??= ORIGIN
  route = await import("./route")
  ;({ uploadDocument } = await import("@/lib/data/documents"))
  ;({ resolveOrgScope } = await import("@/lib/data/scope"))
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
  store = createMemoryDocumentStore()
  setDocumentStoreForTests(store)
  return store
}

/**
 * Seed one document on `org` and return its id.
 *
 * The bytes are SALTED with a random tail so every seeded document is a
 * genuinely new file. Without it the duplicate soft-detect would hand back an
 * earlier test's row, whose object lives in an earlier test's store — the
 * fixture would be testing the fixture.
 */
async function seedDocument(
  org: TestOrganization,
  bytes: Buffer,
  filename = CZECH_FILENAME,
): Promise<string> {
  request.headers = org.members.owner.headers
  const scope = await resolveOrgScope(org.slug)
  if (!scope) throw new Error("fixture: no scope")

  const salted = Buffer.concat([bytes, Buffer.from(randomUUID())])
  async function* source(): AsyncGenerator<Uint8Array> {
    yield new Uint8Array(salted)
  }
  const result = await uploadDocument(scope, {
    filename,
    docType: "other",
    siteRef: null,
    source: source(),
  })
  if (!result.ok) throw new Error(`fixture upload refused: ${result.reason}`)
  // The salt guarantees this is a new file, so it is never a duplicate and the
  // row is always present. A missing one is a broken fixture, not a null case.
  if (!result.document) throw new Error("fixture upload carried no row")
  return result.document.id
}

async function get(
  as: Headers,
  slug: string,
  documentId: string,
  query = "",
): Promise<Response> {
  request.headers = as
  const url = `${ORIGIN}/api/orgs/${slug}/documents/${documentId}/file${query}`
  return route.GET(new Request(url), {
    params: Promise.resolve({ orgSlug: slug, documentId }),
  })
}

describe("GET .../file — the bytes", () => {
  it("streams back exactly what was uploaded", async () => {
    useStore()
    const id = await seedDocument(orgA, PDF_BYTES)
    const response = await get(orgA.members.member.headers, orgA.slug, id)

    expect(response.status).toBe(200)
    const body = Buffer.from(await response.arrayBuffer())
    // Byte-identical to what the store holds, prefix included.
    expect(body.subarray(0, PDF_BYTES.length)).toEqual(PDF_BYTES)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-length")).toBe(String(body.length))
  })

  it("serves a guest, who may download but not write (spec §5)", async () => {
    useStore()
    const id = await seedDocument(orgA, PNG_BYTES, "stavba.png")
    const response = await get(orgA.members.guest.headers, orgA.slug, id)
    expect(response.status).toBe(200)
  })
})

describe("GET .../file — the header set", () => {
  it("encodes a Czech filename per RFC 5987 and keeps an ASCII fallback", async () => {
    useStore()
    const id = await seedDocument(orgA, PDF_BYTES)
    const response = await get(orgA.members.owner.headers, orgA.slug, id)

    const disposition = response.headers.get("content-disposition") ?? ""
    expect(disposition).toBe(
      'attachment; filename="P__jmov__doklad__._12.pdf"; ' +
        "filename*=UTF-8''P%C5%99%C3%ADjmov%C3%BD%20doklad%20%C4%8D.%2012.pdf",
    )
    expect(disposition).not.toMatch(/[\r\n]/)
  })

  it("sets nosniff, a locked-down CSP, CORP and no-store", async () => {
    useStore()
    const id = await seedDocument(orgA, PDF_BYTES)
    const response = await get(orgA.members.owner.headers, orgA.slug, id)

    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    // The handler's own copy. It is NOT what a browser receives — the
    // site-wide `headers()` entry in next.config.mjs replaces this key on a
    // real server — so the policy that actually reaches the wire is asserted
    // over real HTTP in `document-file-headers.test.ts`. Both are needed: this
    // one keeps the fallback honest, that one keeps the product correct.
    expect(response.headers.get("content-security-policy")).toBe(
      route.DOCUMENT_FILE_CSP,
    )
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    )
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    )
  })
})

describe("GET .../file — attachment vs inline", () => {
  it("is an attachment by default even for an image", async () => {
    useStore()
    const id = await seedDocument(orgA, PNG_BYTES, "stavba.png")
    const response = await get(orgA.members.owner.headers, orgA.slug, id)
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/)
  })

  it.each([
    ["PNG", PNG_BYTES, "stavba.png", "inline"],
    ["JPEG", JPEG_BYTES, "stavba.jpg", "inline"],
    // A PDF served inline is a plugin-rendered document on this origin; the
    // preview is a sandboxed iframe (PR 12), not this route.
    ["PDF", PDF_BYTES, "faktura.pdf", "attachment"],
    // No non-Apple browser renders HEIC; PR 11 makes a JPEG derivative.
    ["HEIC", HEIC_BYTES, "foto.heic", "attachment"],
  ] as const)(
    "answers ?disposition=inline for %s with %s",
    async (_label, bytes, filename, expected) => {
      useStore()
      const id = await seedDocument(orgA, Buffer.from(bytes), filename)
      const response = await get(
        orgA.members.owner.headers,
        orgA.slug,
        id,
        "?disposition=inline",
      )
      expect(response.headers.get("content-disposition")).toMatch(
        new RegExp(`^${expected};`),
      )
    },
  )

  it("ignores a junk disposition value", async () => {
    useStore()
    const id = await seedDocument(orgA, PNG_BYTES, "stavba.png")
    const response = await get(
      orgA.members.owner.headers,
      orgA.slug,
      id,
      "?disposition=%22%3E%3Cscript%3E",
    )
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/)
  })
})

describe("GET .../file — refusals", () => {
  it("answers 404 for a document id belonging to ANOTHER organization", async () => {
    useStore()
    const foreign = await seedDocument(orgB, PDF_BYTES, "cizi.pdf")

    // A real id, a real member — of the wrong book. Both spellings of the
    // attempt: through the victim's slug and through the attacker's own.
    expect(
      (await get(orgA.members.owner.headers, orgA.slug, foreign)).status,
    ).toBe(404)
    expect(
      (await get(orgA.members.owner.headers, orgB.slug, foreign)).status,
    ).toBe(404)
  })

  it("answers 404 for a signed-out visitor", async () => {
    useStore()
    const id = await seedDocument(orgA, PDF_BYTES)
    expect((await get(anonymousHeaders(), orgA.slug, id)).status).toBe(404)
  })

  it.each([
    ["a malformed id", "not-a-uuid"],
    ["an injection attempt", "' OR 1=1 --"],
    ["a traversal", "../../../etc/passwd"],
    ["an unknown but well-formed id", "018f0000-0000-7000-8000-000000000000"],
  ])("answers 404 for %s", async (_label, documentId) => {
    useStore()
    const response = await get(
      orgA.members.owner.headers,
      orgA.slug,
      documentId,
    )
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")
  })

  it("answers 404 for a soft-deleted document", async () => {
    useStore()
    const id = await seedDocument(orgA, PDF_BYTES)
    const { softDeleteDocument } = await import("@/lib/data/documents")

    request.headers = orgA.members.owner.headers
    const scope = await resolveOrgScope(orgA.slug)
    if (!scope) throw new Error("no scope")
    expect(await softDeleteDocument(scope, id)).toBe(true)

    expect((await get(orgA.members.owner.headers, orgA.slug, id)).status).toBe(
      404,
    )
  })
})
