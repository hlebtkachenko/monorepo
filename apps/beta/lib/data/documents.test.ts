/**
 * The document data layer against a real Postgres.
 *
 * What is worth asserting here — and what is deliberately NOT asserted in a
 * unit test with a stubbed database — is everything that only exists because
 * the database exists: the quota arithmetic under a row lock, the partial
 * unique index behind the duplicate soft-detect, the CHECK constraints, and the
 * four filters that make one organization's documents invisible to another.
 *
 * The S3 side is an in-memory fake (`tests/memory-document-store.ts`), which
 * enforces the same prefix containment the real store does. That is the point
 * of the seam: the tenancy properties are testable without a bucket.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import postgres from "postgres"

import {
  createMemoryDocumentStore,
  HEIC_BYTES,
  JPEG_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  ZIP_BYTES,
  type MemoryDocumentStore,
} from "../../tests/memory-document-store"
import { REAL_HEIC_BYTES } from "../../tests/heic-fixture"
import {
  createDocumentRow,
  createPartnerRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

import {
  EMPTY_DOCUMENT_LIST_FILTERS,
  type DocumentListFilters,
} from "./document-filters"

const CZECH_FILENAME = "Faktura Nováková 03-2026.pdf"

/**
 * The request headers the seam reads, mocked exactly as `scope.test.ts` mocks
 * them: `vi.hoisted` because a `vi.mock` factory is lifted above the imports.
 * Nothing else is faked — the sessions, the memberships and the constraints are
 * all real.
 */
const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

let store: MemoryDocumentStore
let sql: postgres.Sql

type DocumentsModule = typeof import("./documents")
type ScopeModule = typeof import("./scope")

let documents: DocumentsModule
let scopeModule: ScopeModule
let setDocumentStoreForTests: (store: unknown) => void

/**
 * A scope handle for one of `org`'s seeded members.
 *
 * Obtained through `resolveOrgScope` — the real door — rather than asserted
 * into existence: `lib/data/scope-brand-fence.boundary.test.ts` fails the build
 * on `{} as OrgScope`, deliberately including test files, so a fixture cannot
 * hand a data function a handle the application would never produce.
 *
 * The shared header holder means scopes must be resolved SEQUENTIALLY; the
 * concurrency tests below resolve theirs once and then race the uploads.
 */
async function scopeFor(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  request.headers = org.members[role].headers
  const scope = await scopeModule.resolveOrgScope(org.slug)
  if (!scope) throw new Error(`fixture: no scope for ${role} in ${org.slug}`)
  return scope
}

async function upload(
  scope: Awaited<ReturnType<typeof scopeFor>>,
  bytes: Buffer,
  options: {
    filename?: string
    docType?: "invoice_in" | "other" | "receipt"
    siteRef?: string
  } = {},
) {
  async function* source(): AsyncGenerator<Uint8Array> {
    yield bytes
  }
  return documents.uploadDocument(scope, {
    filename: options.filename ?? CZECH_FILENAME,
    docType: options.docType ?? "other",
    siteRef: options.siteRef ?? null,
    source: source(),
  })
}

beforeAll(async () => {
  sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })
  documents = await import("./documents")
  scopeModule = await import("./scope")
  const storeModule = await import("@/lib/storage/store")
  setDocumentStoreForTests = storeModule.setDocumentStoreForTests as (
    store: unknown,
  ) => void
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
 * The row an upload carried, or a loud failure.
 *
 * `document` is nullable on the duplicate branch — that is the point of
 * `duplicateTwinVisibleTo`, and the null case has its own describe block below.
 * Everywhere else a missing row is a bug in the code under test, so this
 * asserts rather than optional-chains: `result.document?.id` would silently
 * compare `undefined` to `undefined` and pass.
 */
function rowOf(
  result: Awaited<ReturnType<typeof upload>>,
): NonNullable<Extract<typeof result, { ok: true }>["document"]> {
  if (!result.ok) throw new Error(`upload refused: ${result.reason}`)
  if (!result.document) throw new Error("upload carried no document row")
  return result.document
}

/**
 * Just the rows of a page.
 *
 * `listDocuments` answers with a page envelope (rows + total + page + count)
 * since PR 12, and most of the cases below are about WHICH rows come back
 * rather than about paging. The paging contract has its own describe block.
 */
async function listed(
  scope: Awaited<ReturnType<typeof scopeFor>>,
  options?: Parameters<DocumentsModule["listDocuments"]>[1],
): Promise<Awaited<ReturnType<DocumentsModule["listDocuments"]>>["documents"]> {
  return (await documents.listDocuments(scope, options)).documents
}

describe("uploadDocument — the happy path", () => {
  it("stores the bytes, records the row, and answers with a projection", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, PDF_BYTES)
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(result.status).toBe("stored")
    expect(rowOf(result).filename).toBe(CZECH_FILENAME)
    expect(rowOf(result).contentType).toBe("application/pdf")
    expect(rowOf(result).byteSize).toBe(PDF_BYTES.length)
    expect(fake.keys()).toHaveLength(1)
    expect(fake.bytesOf(fake.keys()[0]!)).toEqual(PDF_BYTES)
  })

  it("records the sniffed type, not the filename's claim", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    // A PNG that says it is a PDF. The row must describe the bytes.
    const result = await upload(scope, PNG_BYTES, { filename: "faktura.pdf" })
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(rowOf(result).contentType).toBe("image/png")
    const [row] = await sql<{ extension: string; storage_key: string }[]>`
      SELECT extension, storage_key FROM document WHERE id = ${rowOf(result).id}
    `
    expect(row!.extension).toBe("png")
    expect(row!.storage_key).toMatch(/\.png$/)
  })

  it("mints an opaque key that carries no part of the filename", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, HEIC_BYTES, {
      filename: "Stavba Vinohrady 2026.heic",
    })
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    const [row] = await sql<{ storage_key: string }[]>`
      SELECT storage_key FROM document WHERE id = ${rowOf(result).id}
    `
    const key = row!.storage_key
    expect(key.startsWith(`org/${scope.organizationId}/`)).toBe(true)
    for (const word of ["stavba", "vinohrady", "2026", "faktura"]) {
      expect(key.toLowerCase()).not.toContain(word)
    }
  })

  it("records the uploader", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "admin")

    const result = await upload(scope, JPEG_BYTES)
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    const [row] = await sql<{ uploaded_by_user_id: string }[]>`
      SELECT uploaded_by_user_id FROM document WHERE id = ${rowOf(result).id}
    `
    expect(row!.uploaded_by_user_id).toBe(org.members.admin.userId)
  })
})

describe("uploadDocument — refusals", () => {
  it("refuses a guest: view and download, never write (spec §5)", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "guest")

    expect(await upload(scope, PDF_BYTES)).toEqual({
      ok: false,
      reason: "forbidden",
    })
    // Nothing was streamed anywhere: the role check runs before the body is
    // touched, so a guest cannot even make the task read 25 MiB.
    expect(fake.keys()).toEqual([])
  })

  it.each(["owner", "admin", "member"] as const)(
    "allows %s to upload",
    async (role) => {
      useStore()
      const org = await seedOrganization()
      const result = await upload(await scopeFor(org, role), PDF_BYTES)
      expect(result.ok).toBe(true)
    },
  )

  it("refuses bytes outside the allowlist and stores nothing", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    expect(await upload(scope, ZIP_BYTES, { filename: "faktura.pdf" })).toEqual(
      { ok: false, reason: "unsupported_type" },
    )
    expect(fake.keys()).toEqual([])
  })

  it("refuses an empty body", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    expect(await upload(scope, Buffer.alloc(0))).toEqual({
      ok: false,
      reason: "empty_body",
    })
  })

  it.each([
    ["an empty name", ""],
    ["only whitespace", "   "],
    ["only a path", "../../"],
    ["a control character", "faktura .pdf"],
    ["a name past 255 characters", `${"a".repeat(256)}.pdf`],
  ])("refuses %s", async (_label, filename) => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    expect(await upload(scope, PDF_BYTES, { filename })).toEqual({
      ok: false,
      reason: "invalid_filename",
    })
  })

  it("strips a path from an otherwise valid filename", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, PDF_BYTES, {
      filename: "../../etc/faktura.pdf",
    })
    if (!result.ok) throw new Error(`refused: ${result.reason}`)
    expect(rowOf(result).filename).toBe("faktura.pdf")
  })
})

describe("uploadDocument — duplicate soft-detect (spec §2.2)", () => {
  it("answers `duplicate` with the ORIGINAL row and stores no second object", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const first = await upload(scope, PDF_BYTES, { filename: "prvni.pdf" })
    if (!first.ok) throw new Error("first upload refused")

    const second = await upload(scope, PDF_BYTES, { filename: "druhy.pdf" })
    if (!second.ok) throw new Error("second upload refused")

    expect(second.status).toBe("duplicate")
    // The row handed back is the one already on the book — that is what lets
    // the dialog say "už jste nahráli DD.MM.YYYY — otevřít".
    expect(rowOf(second).id).toBe(rowOf(first).id)
    expect(rowOf(second).filename).toBe("prvni.pdf")

    // Exactly one object survives; the second copy was compensated away.
    expect(fake.keys()).toHaveLength(1)
    expect(fake.deleteCount()).toBe(1)

    const rows =
      await sql`SELECT id FROM document WHERE organization_id = ${scope.organizationId}`
    expect(rows).toHaveLength(1)
  })

  it("is NOT a hard reject — the same file on two books is two documents", async () => {
    useStore()
    const a = await seedOrganization()
    const b = await seedOrganization()

    const first = await upload(await scopeFor(a, "member"), PDF_BYTES)
    const second = await upload(await scopeFor(b, "member"), PDF_BYTES)
    if (!first.ok || !second.ok) throw new Error("refused")

    expect(first.status).toBe("stored")
    expect(second.status).toBe("stored")
  })

  it("lets a soft-deleted file be uploaded again", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")

    const first = await upload(owner, PDF_BYTES)
    if (!first.ok) throw new Error("first upload refused")
    expect(await documents.softDeleteDocument(owner, rowOf(first).id)).toBe(
      true,
    )

    const again = await upload(owner, PDF_BYTES)
    if (!again.ok) throw new Error("re-upload refused")
    expect(again.status).toBe("stored")
    expect(rowOf(again).id).not.toBe(rowOf(first).id)
  })

  it("answers duplicate for two uploads racing the same bytes", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const [a, b] = await Promise.all([
      upload(scope, PDF_BYTES, { filename: "a.pdf" }),
      upload(scope, PDF_BYTES, { filename: "b.pdf" }),
    ])
    if (!a.ok || !b.ok) throw new Error("a racing upload was refused")

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual(["duplicate", "stored"])
    expect(rowOf(a).id).toBe(rowOf(b).id)
    expect(fake.keys()).toHaveLength(1)

    const rows =
      await sql`SELECT id FROM document WHERE organization_id = ${scope.organizationId}`
    expect(rows).toHaveLength(1)
  })
})

/**
 * The duplicate lookup is the one query that cannot put the visibility filters
 * in its WHERE clause (the unique index is unconditional, so a filtered SELECT
 * would let the INSERT behind it hit 23505). It applies them to the answer
 * instead — and these are the cases that prove it, because getting this wrong
 * turns "I uploaded a file" into a read of a row the office hid.
 *
 * The leak is genuinely reachable without any privilege: a client re-uploading
 * the same PDF they sent last month is the NORMAL case, and if the office has
 * since hidden that row, the naive implementation hands its filename, status,
 * office message, amount, date and site back to them.
 */
describe("uploadDocument — a duplicate never reads a row the caller cannot", () => {
  /** Upload once as owner, then reshape the stored row with raw SQL. */
  async function seedTwin(
    org: TestOrganization,
    bytes: Buffer,
    patch: (id: string) => Promise<unknown>,
  ): Promise<string> {
    const owner = await scopeFor(org, "owner")
    const first = await upload(owner, bytes, { filename: "tajne-cislo-42.pdf" })
    if (!first.ok || !first.document) throw new Error("seed upload refused")
    await patch(rowOf(first).id)
    return rowOf(first).id
  }

  /** No field of the hidden row may appear anywhere in the answer. */
  function expectNoLeak(result: unknown, twinId: string): void {
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(twinId)
    expect(serialized).not.toContain("tajne-cislo-42")
    expect(serialized).not.toContain("Interni poznamka")
    expect(serialized).not.toContain("1234.56")
  }

  it.each(["admin", "member"] as const)(
    "answers %s `duplicate` with NO row when the twin is hidden",
    async (role) => {
      const fake = useStore()
      const org = await seedOrganization()
      const bytes = Buffer.concat([PDF_BYTES, Buffer.from(role)])

      const twinId = await seedTwin(
        org,
        bytes,
        (id) =>
          sql`
          UPDATE document
             SET visible_to_client = false,
                 office_message = 'Interni poznamka',
                 amount = 1234.56
           WHERE id = ${id}
        `,
      )

      const result = await upload(await scopeFor(org, role), bytes, {
        filename: "muj-soubor.pdf",
      })
      if (!result.ok) throw new Error(`refused: ${result.reason}`)

      // Still a duplicate — nothing new was stored, and the caller is told so.
      expect(result.status).toBe("duplicate")
      expect(result.document).toBeNull()
      expectNoLeak(result, twinId)

      // And the twin is still the only object + the only row.
      expect(fake.keys()).toHaveLength(1)
      const rows =
        await sql`SELECT id FROM document WHERE organization_id = ${org.organizationId}`
      expect(rows).toHaveLength(1)
    },
  )

  it("answers `duplicate` with NO row when the twin is a payslip — even for the owner", async () => {
    useStore()
    const org = await seedOrganization()
    const bytes = Buffer.concat([PDF_BYTES, Buffer.from("payslip")])

    // Relabelled the way PR 31's Výplatnice upload will. Payslips leave
    // Dokumenty entirely (spec §2.2), so nothing here may surface one — and
    // after PR 32 the uploader could be the employee seat of a colleague.
    const twinId = await seedTwin(
      org,
      bytes,
      (id) =>
        sql`UPDATE document SET doc_type = 'payslip', amount = 1234.56 WHERE id = ${id}`,
    )

    for (const role of ["owner", "admin", "member"] as const) {
      const result = await upload(await scopeFor(org, role), bytes)
      if (!result.ok) throw new Error(`refused: ${result.reason}`)
      expect(result.status, role).toBe("duplicate")
      expect(result.document, role).toBeNull()
      expectNoLeak(result, twinId)
    }
  })

  it("still hands the OWNER a hidden twin's row — the gate is role-aware", async () => {
    useStore()
    const org = await seedOrganization()
    const bytes = Buffer.concat([PDF_BYTES, Buffer.from("owner-control")])

    const twinId = await seedTwin(
      org,
      bytes,
      (id) =>
        sql`UPDATE document SET visible_to_client = false WHERE id = ${id}`,
    )

    // owner IS the accountant: the hidden layer is theirs, so the "otevřít"
    // link must still work for them. A blanket null would be over-correction.
    const result = await upload(await scopeFor(org, "owner"), bytes)
    if (!result.ok) throw new Error(`refused: ${result.reason}`)
    expect(result.status).toBe("duplicate")
    expect(result.document?.id).toBe(twinId)
  })

  it("hands back the row normally when the twin is plainly visible", async () => {
    useStore()
    const org = await seedOrganization()
    const bytes = Buffer.concat([PDF_BYTES, Buffer.from("visible")])
    const twinId = await seedTwin(org, bytes, () => Promise.resolve())

    const result = await upload(await scopeFor(org, "member"), bytes)
    if (!result.ok) throw new Error(`refused: ${result.reason}`)
    expect(result.status).toBe("duplicate")
    expect(result.document?.id).toBe(twinId)
    expect(result.document?.filename).toBe("tajne-cislo-42.pdf")
  })
})

describe("uploadDocument — the per-organization quota", () => {
  /**
   * Fill an organization until exactly `remaining` bytes are left.
   *
   * Real rows, not a fake counter: the quota is a SUM over `document`, so the
   * only way to test it is to make that SUM true. Each row is capped at 25 MiB
   * by `document_byte_size_range`, which is why this is a `generate_series`
   * rather than one enormous row — a helper that could sidestep the CHECK would
   * be testing a schema the application cannot produce.
   */
  const MAX_ROW_BYTES = 25 * 1024 * 1024

  async function fillTo(organizationId: string, remaining: number) {
    const target = documents.ORGANIZATION_QUOTA_BYTES - remaining
    const wholeRows = Math.floor(target / MAX_ROW_BYTES)
    const rest = target - wholeRows * MAX_ROW_BYTES

    if (wholeRows > 0) {
      await sql`
        INSERT INTO document (
          organization_id, original_filename, storage_key, content_type,
          extension, byte_size, sha256
        )
        SELECT
          ${organizationId}, 'seed.pdf',
          'org/' || ${organizationId} || '/' || gen_random_uuid() || '.pdf',
          'application/pdf', 'pdf', ${MAX_ROW_BYTES},
          md5(g::text) || md5((g + 1000000)::text)
        FROM generate_series(1, ${wholeRows}) AS g
      `
    }
    if (rest > 0) {
      await sql`
        INSERT INTO document (
          organization_id, original_filename, storage_key, content_type,
          extension, byte_size, sha256
        ) VALUES (
          ${organizationId}, 'seed.pdf',
          ${`org/${organizationId}/${crypto.randomUUID()}.pdf`},
          'application/pdf', 'pdf', ${rest},
          ${"a".repeat(64)}
        )
      `
    }

    const [row] = await sql<{ total: string }[]>`
      SELECT coalesce(sum(byte_size), 0)::text AS total FROM document
       WHERE organization_id = ${organizationId} AND deleted_at IS NULL
    `
    expect(Number(row!.total)).toBe(target)
  }

  it("reports usage that ignores soft-deleted rows", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")

    const first = await upload(owner, PDF_BYTES)
    if (!first.ok) throw new Error("refused")
    expect((await documents.organizationStorageUsage(owner)).usedBytes).toBe(
      PDF_BYTES.length,
    )

    await documents.softDeleteDocument(owner, rowOf(first).id)
    expect((await documents.organizationStorageUsage(owner)).usedBytes).toBe(0)
  })

  it("refuses an upload that would cross the quota, and stores nothing", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await fillTo(scope.organizationId, PDF_BYTES.length - 1)

    expect(await upload(scope, PDF_BYTES)).toEqual({
      ok: false,
      reason: "quota_exceeded",
    })
    // The bytes reached S3 before the transaction could refuse them — the
    // digest is only known at the last byte — so the compensating delete is
    // what has to have run.
    expect(fake.keys()).toEqual([])
    expect(fake.deleteCount()).toBe(1)
  })

  it("accepts an upload that exactly fills the quota", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await fillTo(scope.organizationId, PDF_BYTES.length)

    const result = await upload(scope, PDF_BYTES)
    expect(result.ok).toBe(true)
  })

  it("refuses before streaming when the book is already full", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await fillTo(scope.organizationId, 0)

    expect(await upload(scope, PDF_BYTES)).toEqual({
      ok: false,
      reason: "quota_exceeded",
    })
    // Nothing was written at all this time: the cheap pre-check caught it.
    expect(fake.deleteCount()).toBe(0)
  })

  it("lets exactly one of two concurrent uploads through the last slot", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    // Room for ONE of the two files, not both.
    await fillTo(scope.organizationId, PDF_BYTES.length + PNG_BYTES.length - 1)

    const [a, b] = await Promise.all([
      upload(scope, PDF_BYTES),
      upload(scope, PNG_BYTES),
    ])

    const outcomes = [a, b]
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1)
    expect(
      outcomes.filter((r) => !r.ok && r.reason === "quota_exceeded"),
    ).toHaveLength(1)

    // The winner's object stays, the loser's is compensated away — the whole
    // point of the row lock is that this cannot be "both stored".
    expect(fake.keys()).toHaveLength(1)

    const [row] = await sql<{ total: string }[]>`
      SELECT coalesce(sum(byte_size), 0)::text AS total FROM document
       WHERE organization_id = ${scope.organizationId} AND deleted_at IS NULL
    `
    expect(Number(row!.total)).toBeLessThanOrEqual(
      documents.ORGANIZATION_QUOTA_BYTES,
    )
  })
})

describe("reads — the four filters", () => {
  it("never returns another organization's document", async () => {
    useStore()
    const a = await seedOrganization()
    const b = await seedOrganization()

    const mine = await upload(await scopeFor(a, "member"), PDF_BYTES)
    if (!mine.ok) throw new Error("refused")

    const intruder = await scopeFor(b, "owner")
    expect(
      await documents.documentForScope(intruder, rowOf(mine).id),
    ).toBeNull()
    expect(
      await documents.openDocumentFile(intruder, rowOf(mine).id),
    ).toBeNull()
    expect(await listed(intruder)).toEqual([])
    expect(await documents.listDocumentSites(intruder)).toEqual([])
  })

  it("answers null for a malformed id rather than raising", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    for (const id of ["not-a-uuid", "' OR 1=1 --", "", "../../etc/passwd"]) {
      expect(await documents.documentForScope(scope, id)).toBeNull()
      expect(await documents.openDocumentFile(scope, id)).toBeNull()
    }
  })

  it("hides a soft-deleted document from every read", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")

    const result = await upload(owner, PDF_BYTES)
    if (!result.ok) throw new Error("refused")
    await documents.softDeleteDocument(owner, rowOf(result).id)

    expect(await documents.documentForScope(owner, rowOf(result).id)).toBeNull()
    expect(await documents.openDocumentFile(owner, rowOf(result).id)).toBeNull()
    expect(await listed(owner)).toEqual([])
  })

  it("only the owner may soft-delete", async () => {
    useStore()
    const org = await seedOrganization()
    const member = await scopeFor(org, "member")

    const result = await upload(member, PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    expect(await documents.softDeleteDocument(member, rowOf(result).id)).toBe(
      false,
    )
    expect(
      await documents.softDeleteDocument(
        await scopeFor(org, "guest"),
        rowOf(result).id,
      ),
    ).toBe(false)
    expect(
      await documents.softDeleteDocument(
        await scopeFor(org, "owner"),
        rowOf(result).id,
      ),
    ).toBe(true)
  })

  it("excludes payslips from every view, server-side (spec §2.2)", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")

    const result = await upload(owner, PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    // Relabelled the way PR 31's Výplatnice upload will. Even the owner — the
    // accountant, who sees everything else — loses it from Dokumenty; it is
    // reachable only under the payroll scope that PR 32 introduces.
    await sql`UPDATE document SET doc_type = 'payslip' WHERE id = ${rowOf(result).id}`

    expect(await listed(owner)).toEqual([])
    expect(await documents.documentForScope(owner, rowOf(result).id)).toBeNull()
    expect(await documents.openDocumentFile(owner, rowOf(result).id)).toBeNull()
  })

  it("hides a not-client-visible document from everyone but the owner", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")

    const result = await upload(owner, PDF_BYTES)
    if (!result.ok) throw new Error("refused")
    await sql`UPDATE document SET visible_to_client = false WHERE id = ${rowOf(result).id}`

    expect(await listed(owner)).toHaveLength(1)
    for (const role of ["admin", "member", "guest"] as const) {
      const scope = await scopeFor(org, role)
      expect(await listed(scope)).toEqual([])
      expect(
        await documents.documentForScope(scope, rowOf(result).id),
      ).toBeNull()
      expect(
        await documents.openDocumentFile(scope, rowOf(result).id),
      ).toBeNull()
    }
  })

  it("lists newest first", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const first = await upload(scope, PDF_BYTES)
    const second = await upload(scope, PNG_BYTES)
    if (!first.ok || !second.ok) throw new Error("refused")

    expect((await listed(scope)).map((d) => d.id)).toEqual([
      rowOf(second).id,
      rowOf(first).id,
    ])
  })
})

/**
 * The Dokumenty filters (spec §2.2), against real rows.
 *
 * WHY THIS IS A DATABASE TEST AND NOT A UNIT TEST. Every one of these filters
 * is a WHERE clause, and the three things that can go wrong with a WHERE clause
 * only exist against a real Postgres: a date range that is off by a timezone, a
 * LIKE pattern whose metacharacters were not escaped, and a filter that quietly
 * loses the visibility conditions it was ANDed onto. The last one is the reason
 * every case below also asserts that a filter cannot reach a hidden row.
 */
describe("listDocuments — filters (spec §2.2)", () => {
  /**
   * Rows with chosen columns, inserted directly.
   *
   * The upload path cannot produce a `processed` document, an `invoice_in` with
   * an amount, or a row created last March — those are all office edits and
   * clock facts. What matters here is the read, so the rows are written as the
   * office (and time) would have left them.
   */
  async function seedRow(
    organizationId: string,
    row: {
      filename: string
      status?: string
      docType?: string
      siteRef?: string | null
      amount?: string | null
      createdAt?: string
      visible?: boolean
    },
  ): Promise<string> {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256, status, doc_type, site_ref, amount,
        created_at, visible_to_client, office_message
      ) VALUES (
        ${organizationId}, ${row.filename},
        ${`org/${organizationId}/${crypto.randomUUID()}.pdf`},
        'application/pdf', 'pdf', 1024, ${crypto.randomUUID().replace(/-/g, "").padEnd(64, "0")},
        ${row.status ?? "received"}::beta_document_status,
        ${row.docType ?? "other"}::beta_document_type,
        ${row.siteRef ?? null}, ${row.amount ?? null},
        ${row.createdAt ?? "2026-03-15T09:00:00+01:00"},
        ${row.visible ?? true},
        ${row.status === "returned" ? "Chybí druhá strana" : null}
      )
      RETURNING id
    `
    return inserted!.id
  }

  async function filteredNames(
    scope: Awaited<ReturnType<typeof scopeFor>>,
    filters: Partial<DocumentListFilters>,
  ): Promise<string[]> {
    const rows = await listed(scope, {
      filters: { ...EMPTY_DOCUMENT_LIST_FILTERS, ...filters },
    })
    return rows.map((row) => row.filename).sort()
  }

  it("filters by status", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, { filename: "a.pdf", status: "received" })
    await seedRow(org.organizationId, {
      filename: "b.pdf",
      status: "processed",
    })
    await seedRow(org.organizationId, {
      filename: "c.pdf",
      status: "returned",
    })

    expect(await filteredNames(scope, { status: "processed" })).toEqual([
      "b.pdf",
    ])
    expect(await filteredNames(scope, { status: "returned" })).toEqual([
      "c.pdf",
    ])
    expect(await filteredNames(scope, {})).toEqual(["a.pdf", "b.pdf", "c.pdf"])
  })

  it("filters by document type", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "prijata.pdf",
      docType: "invoice_in",
    })
    await seedRow(org.organizationId, {
      filename: "vydana.pdf",
      docType: "invoice_out",
    })

    expect(await filteredNames(scope, { docType: "invoice_in" })).toEqual([
      "prijata.pdf",
    ])
  })

  it("filters by stavba", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "vinohrady.pdf",
      siteRef: "Vinohrady",
    })
    await seedRow(org.organizationId, {
      filename: "smichov.pdf",
      siteRef: "Smíchov",
    })
    await seedRow(org.organizationId, { filename: "bez-stavby.pdf" })

    expect(await filteredNames(scope, { siteRef: "Vinohrady" })).toEqual([
      "vinohrady.pdf",
    ])
    // Diacritics are data, not a normalisation problem: the value came out of
    // the same column the filter compares against.
    expect(await filteredNames(scope, { siteRef: "Smíchov" })).toEqual([
      "smichov.pdf",
    ])
  })

  it("filters by an inclusive Prague day range", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    // 00:30 Prague on 2 March is 23:30 UTC on 1 March — the row a naive UTC
    // range drops out of "od 2. 3.".
    await seedRow(org.organizationId, {
      filename: "brzy-rano.pdf",
      createdAt: "2026-03-02T00:30:00+01:00",
    })
    // 23:30 Prague on 3 March is 22:30 UTC — the row a naive UTC range drops
    // out of "do 3. 3." at the other end.
    await seedRow(org.organizationId, {
      filename: "pozde-vecer.pdf",
      createdAt: "2026-03-03T23:30:00+01:00",
    })
    await seedRow(org.organizationId, {
      filename: "mimo.pdf",
      createdAt: "2026-03-05T12:00:00+01:00",
    })

    expect(
      await filteredNames(scope, { from: "2026-03-02", to: "2026-03-03" }),
    ).toEqual(["brzy-rano.pdf", "pozde-vecer.pdf"])

    // A single day is a range of one, and it contains that whole day.
    expect(
      await filteredNames(scope, { from: "2026-03-02", to: "2026-03-02" }),
    ).toEqual(["brzy-rano.pdf"])

    expect(await filteredNames(scope, { from: "2026-03-04" })).toEqual([
      "mimo.pdf",
    ])
    expect(await filteredNames(scope, { to: "2026-03-02" })).toEqual([
      "brzy-rano.pdf",
    ])
  })

  it("searches the filename case-insensitively", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, { filename: "Faktura Nováková.pdf" })
    await seedRow(org.organizationId, { filename: "Účtenka OBI.pdf" })

    expect(await filteredNames(scope, { search: "faktura" })).toEqual([
      "Faktura Nováková.pdf",
    ])
    expect(await filteredNames(scope, { search: "NOVÁKOVÁ" })).toEqual([
      "Faktura Nováková.pdf",
    ])
    expect(await filteredNames(scope, { search: "obi" })).toEqual([
      "Účtenka OBI.pdf",
    ])
    expect(await filteredNames(scope, { search: "nic takového" })).toEqual([])
  })

  it("treats LIKE metacharacters as text, not as wildcards", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, { filename: "faktura-03.pdf" })
    await seedRow(org.organizationId, { filename: "faktura_03.pdf" })
    await seedRow(org.organizationId, { filename: "sleva 50%.pdf" })

    // `_` is the single-character wildcard. Unescaped, this returns both.
    expect(await filteredNames(scope, { search: "faktura_03" })).toEqual([
      "faktura_03.pdf",
    ])
    // `%` is the any-run wildcard. Unescaped it returns all three; escaped it
    // means the character, and exactly one filename contains it.
    expect(await filteredNames(scope, { search: "%" })).toEqual([
      "sleva 50%.pdf",
    ])
    expect(await filteredNames(scope, { search: "50%" })).toEqual([
      "sleva 50%.pdf",
    ])
    // A backslash is the escape character itself; it must survive as text
    // rather than swallowing the character behind it.
    expect(await filteredNames(scope, { search: "\\" })).toEqual([])
  })

  it("ANDs several filters rather than widening", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "hit.pdf",
      status: "processed",
      docType: "invoice_in",
      siteRef: "Vinohrady",
      createdAt: "2026-03-10T10:00:00+01:00",
    })
    await seedRow(org.organizationId, {
      filename: "spatny-stav.pdf",
      status: "received",
      docType: "invoice_in",
      siteRef: "Vinohrady",
      createdAt: "2026-03-10T10:00:00+01:00",
    })
    await seedRow(org.organizationId, {
      filename: "spatna-stavba.pdf",
      status: "processed",
      docType: "invoice_in",
      siteRef: "Smíchov",
      createdAt: "2026-03-10T10:00:00+01:00",
    })
    await seedRow(org.organizationId, {
      filename: "spatne-datum.pdf",
      status: "processed",
      docType: "invoice_in",
      siteRef: "Vinohrady",
      createdAt: "2026-01-10T10:00:00+01:00",
    })

    expect(
      await filteredNames(scope, {
        status: "processed",
        docType: "invoice_in",
        siteRef: "Vinohrady",
        from: "2026-03-01",
        to: "2026-03-31",
        search: "hit",
      }),
    ).toEqual(["hit.pdf"])
  })

  it("never lets a filter reach a hidden row, a payslip or another book", async () => {
    const org = await seedOrganization()
    const other = await seedOrganization()
    const member = await scopeFor(org, "member")

    await seedRow(org.organizationId, {
      filename: "skryty.pdf",
      status: "processed",
      siteRef: "Vinohrady",
      visible: false,
    })
    await seedRow(org.organizationId, {
      filename: "vyplatnice.pdf",
      status: "processed",
      docType: "payslip",
      siteRef: "Vinohrady",
    })
    await seedRow(other.organizationId, {
      filename: "cizi.pdf",
      status: "processed",
      siteRef: "Vinohrady",
    })

    // Every filter that would have SELECTED those rows, one at a time.
    for (const filters of [
      {},
      { status: "processed" as const },
      { siteRef: "Vinohrady" },
      { search: "y" },
      { from: "2020-01-01", to: "2030-01-01" },
    ]) {
      expect(await filteredNames(member, filters)).toEqual([])
    }

    // The site filter's options do not leak them either: a stavba that only
    // occurs on a hidden row must not be offered, because picking it and
    // getting nothing back confirms the row exists.
    expect(await documents.listDocumentSites(member)).toEqual([])
    // The owner is the accountant and does see the hidden one — the gate is
    // role-aware, not a blanket blindfold. The payslip stays gone even there.
    expect(
      await documents.listDocumentSites(await scopeFor(org, "owner")),
    ).toEqual(["Vinohrady"])
    expect(await filteredNames(await scopeFor(org, "owner"), {})).toEqual([
      "skryty.pdf",
    ])
  })

  it("lists the distinct stavby of this book, sorted, without nulls", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, { filename: "a.pdf", siteRef: "Zličín" })
    await seedRow(org.organizationId, { filename: "b.pdf", siteRef: "Anděl" })
    await seedRow(org.organizationId, { filename: "c.pdf", siteRef: "Anděl" })
    await seedRow(org.organizationId, { filename: "d.pdf" })

    expect(await documents.listDocumentSites(scope)).toEqual([
      "Anděl",
      "Zličín",
    ])
  })
})

/**
 * "Doklady firmy" (spec §2.2, PR 13). `listCompanyDocuments` is `listDocuments`
 * narrowed to `COMPANY_DOCUMENT_TYPES` — its own suite above already proves the
 * shared filter machinery (status/období/search, the pagination contract, the
 * four visibility filters); what is worth proving HERE is the one thing that
 * differs: the type narrowing itself, and that it composes with — rather than
 * bypasses — those same visibility filters.
 */
describe("listCompanyDocuments — Doklady firmy (spec §2.2, PR 13)", () => {
  async function seedRow(
    organizationId: string,
    row: { filename: string; docType: string; visible?: boolean },
  ): Promise<string> {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256, doc_type, visible_to_client
      ) VALUES (
        ${organizationId}, ${row.filename},
        ${`org/${organizationId}/${crypto.randomUUID()}.pdf`},
        'application/pdf', 'pdf', 1024,
        ${crypto.randomUUID().replace(/-/g, "").padEnd(64, "0")},
        ${row.docType}::beta_document_type,
        ${row.visible ?? true}
      )
      RETURNING id
    `
    return inserted!.id
  }

  it("narrows to contract and other, excluding every other client type", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "smlouva.pdf",
      docType: "contract",
    })
    await seedRow(org.organizationId, {
      filename: "ostatni.pdf",
      docType: "other",
    })
    await seedRow(org.organizationId, {
      filename: "faktura.pdf",
      docType: "invoice_in",
    })
    await seedRow(org.organizationId, {
      filename: "vypis.pdf",
      docType: "bank_statement",
    })

    const page = await documents.listCompanyDocuments(scope)
    expect(page.documents.map((d) => d.filename).sort()).toEqual([
      "ostatni.pdf",
      "smlouva.pdf",
    ])
  })

  it("still applies the four visibility filters — hidden, soft-deleted, cross-org", async () => {
    const org = await seedOrganization()
    const other = await seedOrganization()
    const scope = await scopeFor(org, "member")
    const owner = await scopeFor(org, "owner")

    await seedRow(org.organizationId, {
      filename: "hidden.pdf",
      docType: "contract",
      visible: false,
    })
    await seedRow(other.organizationId, {
      filename: "cizi.pdf",
      docType: "contract",
    })
    const softDeletedId = await seedRow(org.organizationId, {
      filename: "smazana.pdf",
      docType: "other",
    })
    await documents.softDeleteDocument(owner, softDeletedId)

    expect(await documents.listCompanyDocuments(scope)).toMatchObject({
      documents: [],
      total: 0,
    })

    // owner IS the accountant and sees the hidden one — never the soft-deleted
    // row, never the other book's row.
    const ownerPage = await documents.listCompanyDocuments(owner)
    expect(ownerPage.documents.map((d) => d.filename)).toEqual(["hidden.pdf"])
  })

  it("never widens past the company set for a hand-edited ?type=", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "smlouva.pdf",
      docType: "contract",
    })

    // The two conditions are ANDed, not OR'd — a caller cannot escape the
    // company-doc restriction by supplying a `docType` outside it.
    const page = await documents.listCompanyDocuments(scope, {
      filters: { ...EMPTY_DOCUMENT_LIST_FILTERS, docType: "invoice_in" },
    })
    expect(page.documents).toEqual([])
  })

  it("still applies the caller's own search narrowing on top of the type restriction", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "Smlouva o dilo.pdf",
      docType: "contract",
    })
    await seedRow(org.organizationId, {
      filename: "Plna moc.pdf",
      docType: "other",
    })

    const page = await documents.listCompanyDocuments(scope, {
      filters: { ...EMPTY_DOCUMENT_LIST_FILTERS, search: "dilo" },
    })
    expect(page.documents.map((d) => d.filename)).toEqual([
      "Smlouva o dilo.pdf",
    ])
  })
})

/**
 * Mzdy › Podklady (spec §2.6, PR 31) — the same `listCompanyDocuments`
 * contract, narrowed to `attendance` + `hr` instead of `contract` + `other`.
 * The visibility-filter and AND-not-OR cases above already prove those
 * properties belong to `listConditions`/`paginatedDocumentList`, shared by
 * both readers, so this block only proves the one thing that differs: which
 * doc types are IN the narrowed set.
 */
describe("listPayrollSupportingDocuments — Podklady (spec §2.6, PR 31)", () => {
  async function seedRow(
    organizationId: string,
    row: { filename: string; docType: string; visible?: boolean },
  ): Promise<string> {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256, doc_type, visible_to_client
      ) VALUES (
        ${organizationId}, ${row.filename},
        ${`org/${organizationId}/${crypto.randomUUID()}.pdf`},
        'application/pdf', 'pdf', 1024,
        ${crypto.randomUUID().replace(/-/g, "").padEnd(64, "0")},
        ${row.docType}::beta_document_type,
        ${row.visible ?? true}
      )
      RETURNING id
    `
    return inserted!.id
  }

  it("narrows to attendance and hr, excluding every other client type", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "dochazka-07.pdf",
      docType: "attendance",
    })
    await seedRow(org.organizationId, {
      filename: "dotaznik.pdf",
      docType: "hr",
    })
    await seedRow(org.organizationId, {
      filename: "smlouva.pdf",
      docType: "contract",
    })
    await seedRow(org.organizationId, {
      filename: "faktura.pdf",
      docType: "invoice_in",
    })

    const page = await documents.listPayrollSupportingDocuments(scope)
    expect(page.documents.map((d) => d.filename).sort()).toEqual([
      "dochazka-07.pdf",
      "dotaznik.pdf",
    ])
  })

  it("never widens past the payroll set for a hand-edited ?type=", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "dochazka-07.pdf",
      docType: "attendance",
    })

    const page = await documents.listPayrollSupportingDocuments(scope, {
      filters: { ...EMPTY_DOCUMENT_LIST_FILTERS, docType: "invoice_in" },
    })
    expect(page.documents).toEqual([])
  })

  it("still applies the four visibility filters — hidden, soft-deleted, cross-org", async () => {
    const org = await seedOrganization()
    const other = await seedOrganization()
    const scope = await scopeFor(org, "member")
    const owner = await scopeFor(org, "owner")

    await seedRow(org.organizationId, {
      filename: "hidden.pdf",
      docType: "hr",
      visible: false,
    })
    await seedRow(other.organizationId, {
      filename: "cizi.pdf",
      docType: "attendance",
    })
    const softDeletedId = await seedRow(org.organizationId, {
      filename: "smazana.pdf",
      docType: "attendance",
    })
    await documents.softDeleteDocument(owner, softDeletedId)

    expect(await documents.listPayrollSupportingDocuments(scope)).toMatchObject(
      { documents: [], total: 0 },
    )

    const ownerPage = await documents.listPayrollSupportingDocuments(owner)
    expect(ownerPage.documents.map((d) => d.filename)).toEqual(["hidden.pdf"])
  })
})

/**
 * "Stavby" (spec §2.2, PR 13): the per-site grouping. `listDocumentSiteSummaries`
 * reuses `visibleDocuments` exactly as every other read in this module does, so
 * the cases below focus on what is NEW — the grouping, the SQL-side sum, the
 * null bucket, and the ordering — while still proving the visibility filters
 * were not accidentally left off the one query that groups instead of lists.
 */
describe("listDocumentSiteSummaries — Stavby (spec §2.2, PR 13)", () => {
  async function seedRow(
    organizationId: string,
    row: {
      filename: string
      siteRef?: string | null
      amount?: string | null
      docType?: string
      visible?: boolean
    },
  ): Promise<string> {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256, site_ref, amount, doc_type,
        visible_to_client
      ) VALUES (
        ${organizationId}, ${row.filename},
        ${`org/${organizationId}/${crypto.randomUUID()}.pdf`},
        'application/pdf', 'pdf', 1024,
        ${crypto.randomUUID().replace(/-/g, "").padEnd(64, "0")},
        ${row.siteRef ?? null}, ${row.amount ?? null},
        ${row.docType ?? "other"}::beta_document_type,
        ${row.visible ?? true}
      )
      RETURNING id
    `
    return inserted!.id
  }

  it("groups by site, counting and SQL-summing each group", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, {
      filename: "a.pdf",
      siteRef: "Vinohrady",
      amount: "1000.50",
    })
    await seedRow(org.organizationId, {
      filename: "b.pdf",
      siteRef: "Vinohrady",
      amount: "250.25",
    })
    await seedRow(org.organizationId, {
      filename: "c.pdf",
      siteRef: "Smíchov",
      amount: "99.99",
    })

    const rows = await documents.listDocumentSiteSummaries(scope)
    expect(rows.find((r) => r.siteRef === "Vinohrady")).toEqual({
      siteRef: "Vinohrady",
      documentCount: 2,
      amountTotal: "1250.75",
    })
    expect(rows.find((r) => r.siteRef === "Smíchov")).toEqual({
      siteRef: "Smíchov",
      documentCount: 1,
      amountTotal: "99.99",
    })
  })

  it("sums money exactly in SQL — no JavaScript float rounding", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    // The classic 0.1 + 0.2 !== 0.3 float trap: `Number("0.10") +
    // Number("0.20") === 0.30000000000000004` in JavaScript. This sum must
    // never touch that path.
    await seedRow(org.organizationId, {
      filename: "a.pdf",
      siteRef: "Zličín",
      amount: "0.10",
    })
    await seedRow(org.organizationId, {
      filename: "b.pdf",
      siteRef: "Zličín",
      amount: "0.20",
    })

    const rows = await documents.listDocumentSiteSummaries(scope)
    expect(rows.find((r) => r.siteRef === "Zličín")?.amountTotal).toBe("0.30")
  })

  it("groups every document with no site into one null bucket, treating an unstated amount as zero", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, { filename: "a.pdf", siteRef: null })
    await seedRow(org.organizationId, {
      filename: "b.pdf",
      siteRef: null,
      amount: "50.00",
    })

    const rows = await documents.listDocumentSiteSummaries(scope)
    expect(rows).toEqual([
      { siteRef: null, documentCount: 2, amountTotal: "50.00" },
    ])
  })

  it("excludes hidden, payslip and soft-deleted rows from every group's count and sum", async () => {
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")
    const member = await scopeFor(org, "member")

    await seedRow(org.organizationId, {
      filename: "visible.pdf",
      siteRef: "Vinohrady",
      amount: "100.00",
    })
    await seedRow(org.organizationId, {
      filename: "hidden.pdf",
      siteRef: "Vinohrady",
      amount: "999.00",
      visible: false,
    })
    await seedRow(org.organizationId, {
      filename: "vyplatnice.pdf",
      siteRef: "Vinohrady",
      amount: "999.00",
      docType: "payslip",
    })
    const softDeletedId = await seedRow(org.organizationId, {
      filename: "smazana.pdf",
      siteRef: "Vinohrady",
      amount: "999.00",
    })
    await documents.softDeleteDocument(owner, softDeletedId)

    // member: only the plainly-visible row counts.
    expect(await documents.listDocumentSiteSummaries(member)).toEqual([
      { siteRef: "Vinohrady", documentCount: 1, amountTotal: "100.00" },
    ])

    // owner also sees the hidden row — never the payslip, never the
    // soft-deleted row; the gate is role-aware, not a blanket blindfold.
    expect(await documents.listDocumentSiteSummaries(owner)).toEqual([
      { siteRef: "Vinohrady", documentCount: 2, amountTotal: "1099.00" },
    ])
  })

  it("never sums another organization's documents into this book's totals", async () => {
    const org = await seedOrganization()
    const other = await seedOrganization()
    const scope = await scopeFor(org, "member")

    await seedRow(org.organizationId, {
      filename: "mine.pdf",
      siteRef: "Anděl",
      amount: "10.00",
    })
    await seedRow(other.organizationId, {
      filename: "cizi.pdf",
      siteRef: "Anděl",
      amount: "999999.00",
    })

    const rows = await documents.listDocumentSiteSummaries(scope)
    expect(rows).toEqual([
      { siteRef: "Anděl", documentCount: 1, amountTotal: "10.00" },
    ])
  })

  it("reports an empty book as no groups at all — the Stavby empty state", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    expect(await documents.listDocumentSiteSummaries(scope)).toEqual([])
  })

  it("orders named sites alphabetically with the unassigned bucket last", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedRow(org.organizationId, { filename: "a.pdf", siteRef: null })
    await seedRow(org.organizationId, { filename: "b.pdf", siteRef: "Zličín" })
    await seedRow(org.organizationId, { filename: "c.pdf", siteRef: "Anděl" })

    const rows = await documents.listDocumentSiteSummaries(scope)
    expect(rows.map((r) => r.siteRef)).toEqual(["Anděl", "Zličín", null])
  })
})

describe("listDocuments — the pagination contract", () => {
  /** `count` rows on one book, each one second apart so the order is total. */
  async function seedMany(
    organizationId: string,
    count: number,
  ): Promise<void> {
    await sql`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256, created_at
      )
      SELECT
        ${organizationId},
        'doklad-' || lpad(g::text, 3, '0') || '.pdf',
        'org/' || ${organizationId} || '/' || gen_random_uuid() || '.pdf',
        'application/pdf', 'pdf', 512,
        md5(g::text) || md5((g + 7000000)::text),
        timestamptz '2026-03-01 08:00:00+01' + (g || ' seconds')::interval
      FROM generate_series(1, ${count}) AS g
    `
  }

  it("serves whole pages, newest first, with no row seen twice", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedMany(org.organizationId, 60)

    const first = await documents.listDocuments(scope, { page: 1 })
    expect(first.pageSize).toBe(25)
    expect(first.documents).toHaveLength(25)
    expect(first.total).toBe(60)
    expect(first.page).toBe(1)
    expect(first.pageCount).toBe(3)
    // Newest first: the last row seeded is `doklad-060.pdf`.
    expect(first.documents[0]?.filename).toBe("doklad-060.pdf")

    const second = await documents.listDocuments(scope, { page: 2 })
    const third = await documents.listDocuments(scope, { page: 3 })
    expect(second.documents).toHaveLength(25)
    expect(third.documents).toHaveLength(10)
    expect(third.documents.at(-1)?.filename).toBe("doklad-001.pdf")

    // Every row exactly once across the three pages — the property an unstable
    // sort silently breaks.
    const seen = [...first.documents, ...second.documents, ...third.documents]
    expect(new Set(seen.map((row) => row.id)).size).toBe(60)
  })

  it("counts the FILTERED total, not the book", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedMany(org.organizationId, 30)
    await sql`
      UPDATE document SET status = 'processed'
       WHERE organization_id = ${org.organizationId}
         AND original_filename <= 'doklad-004.pdf'
    `

    const page = await documents.listDocuments(scope, {
      filters: {
        status: "processed",
        docType: null,
        from: null,
        to: null,
        siteRef: null,
        search: null,
      },
    })
    expect(page.total).toBe(4)
    expect(page.pageCount).toBe(1)
    expect(page.documents).toHaveLength(4)
  })

  it("answers an empty page past the end rather than raising", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    await seedMany(org.organizationId, 3)

    const page = await documents.listDocuments(scope, { page: 9 })
    expect(page.documents).toEqual([])
    // `total` comes from the rows, and there are none — the pager falls back to
    // its floor rather than reporting a page count it cannot know.
    expect(page.total).toBe(0)
    expect(page.pageCount).toBe(1)
  })

  it("clamps a hostile page number instead of scanning the whole index", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    expect((await documents.listDocuments(scope, { page: 0 })).page).toBe(1)
    expect((await documents.listDocuments(scope, { page: -5 })).page).toBe(1)
    expect(
      (await documents.listDocuments(scope, { page: 999_999_999 })).page,
    ).toBe(10_000)
  })

  it("reports an empty book as one empty page", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    const page = await documents.listDocuments(scope)
    expect(page).toEqual({
      documents: [],
      total: 0,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    })
  })
})

describe("openDocumentFile", () => {
  it("streams back exactly the stored bytes", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, JPEG_BYTES)
    if (!result.ok) throw new Error("refused")

    const handle = await documents.openDocumentFile(scope, rowOf(result).id)
    if (!handle) throw new Error("no handle")

    const parts: Buffer[] = []
    for await (const chunk of handle.body) parts.push(Buffer.from(chunk))
    expect(Buffer.concat(parts)).toEqual(JPEG_BYTES)
    expect(handle.inlineAllowed).toBe(true)
  })

  // `inlineAllowed` governs the bare `<img>` in the sheet; `previewAllowed`
  // governs the sandboxed frame. They differ by exactly one type — PDF — and
  // that single difference is the whole PR 12 preview design, so it is asserted
  // rather than assumed.
  it.each([
    ["PDF", PDF_BYTES, false, true],
    ["HEIC", HEIC_BYTES, false, false],
    ["PNG", PNG_BYTES, true, true],
    ["JPEG", JPEG_BYTES, true, true],
  ] as const)(
    "marks %s inline-allowed = %s, preview-allowed = %s",
    async (_label, bytes, inlineAllowed, previewAllowed) => {
      useStore()
      const org = await seedOrganization()
      const scope = await scopeFor(org, "member")

      const result = await upload(scope, Buffer.from(bytes))
      if (!result.ok) throw new Error("refused")

      const handle = await documents.openDocumentFile(scope, rowOf(result).id)
      expect(handle?.inlineAllowed).toBe(inlineAllowed)
      expect(handle?.previewAllowed).toBe(previewAllowed)
    },
  )
})

describe("database constraints", () => {
  it("refuses a storage key that is not two uuids under the owning org", async () => {
    const org = await seedOrganization()
    const insert = (key: string) => sql`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256
      ) VALUES (
        ${org.organizationId}, 'x.pdf', ${key}, 'application/pdf', 'pdf', 10,
        ${"b".repeat(64)}
      )
    `

    await expect(
      insert(`org/${org.organizationId}/Faktura-Novakova.pdf`),
    ).rejects.toThrow()
    await expect(
      insert(`org/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`),
    ).rejects.toThrow()
    await expect(insert(`${crypto.randomUUID()}.pdf`)).rejects.toThrow()
  })

  it("refuses a content type outside the allowlist", async () => {
    const org = await seedOrganization()
    await expect(sql`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256
      ) VALUES (
        ${org.organizationId}, 'x.html',
        ${`org/${org.organizationId}/${crypto.randomUUID()}.html`},
        'text/html', 'html', 10, ${"c".repeat(64)}
      )
    `).rejects.toThrow()
  })

  it("refuses a document larger than the 25 MiB cap", async () => {
    const org = await seedOrganization()
    await expect(sql`
      INSERT INTO document (
        organization_id, original_filename, storage_key, content_type,
        extension, byte_size, sha256
      ) VALUES (
        ${org.organizationId}, 'x.pdf',
        ${`org/${org.organizationId}/${crypto.randomUUID()}.pdf`},
        'application/pdf', 'pdf', 26214401, ${"d".repeat(64)}
      )
    `).rejects.toThrow()
  })

  it("refuses `returned` without an office message (spec §2.2)", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")
    const result = await upload(owner, PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    await expect(
      sql`UPDATE document SET status = 'returned' WHERE id = ${rowOf(result).id}`,
    ).rejects.toThrow()

    await expect(sql`
      UPDATE document SET status = 'returned', office_message = 'Chybí druhá strana'
       WHERE id = ${rowOf(result).id}
    `).resolves.toBeDefined()
  })

  it("refuses moving a document between organizations", async () => {
    useStore()
    const a = await seedOrganization()
    const b = await seedOrganization()
    const result = await upload(await scopeFor(a, "owner"), PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    await expect(sql`
      UPDATE document SET organization_id = ${b.organizationId}
       WHERE id = ${rowOf(result).id}
    `).rejects.toThrow(/cannot change organization/)
  })

  it("refuses repointing a document at other bytes", async () => {
    useStore()
    const org = await seedOrganization()
    const result = await upload(await scopeFor(org, "owner"), PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    await expect(sql`
      UPDATE document
         SET storage_key = ${`org/${org.organizationId}/${crypto.randomUUID()}.pdf`}
       WHERE id = ${rowOf(result).id}
    `).rejects.toThrow(/cannot change its stored object/)

    await expect(sql`
      UPDATE document SET sha256 = ${"e".repeat(64)} WHERE id = ${rowOf(result).id}
    `).rejects.toThrow(/cannot change its stored object/)
  })

  it("keeps the document when its uploader's account is deleted", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    const result = await upload(scope, PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    await sql`DELETE FROM app_user WHERE id = ${org.members.member.userId}`

    const [row] = await sql<{ uploaded_by_user_id: string | null }[]>`
      SELECT uploaded_by_user_id FROM document WHERE id = ${rowOf(result).id}
    `
    expect(row!.uploaded_by_user_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The HEIC preview derivative (PR 11, spec §2.2 / §0.4 fix F22)
// ---------------------------------------------------------------------------

/**
 * The derivative is generated after the upload transaction commits, from the
 * object that is already in the store. So the properties worth asserting are:
 * that a real HEIC gets one, that nothing else does, that the ORIGINAL is
 * untouched either way, and — the one that keeps a thumbnail from ever costing
 * a client a document — that an undecodable HEIC still uploads successfully.
 */
describe("uploadDocument — the HEIC JPEG derivative", () => {
  it("stores a second object and flags the row when the HEIC really decodes", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, REAL_HEIC_BYTES, {
      filename: "IMG_0421.heic",
    })
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(result.status).toBe("stored")
    expect(rowOf(result).contentType).toBe("image/heic")
    expect(rowOf(result).hasPreview).toBe(true)

    // Two objects: the original and the derivative, both under this org's own
    // prefix (the store's containment check would have thrown otherwise).
    expect(fake.keys()).toHaveLength(2)
    const [originalKey, previewKey] = fake.keys()
    expect(originalKey).toMatch(/\.heic$/)
    expect(previewKey).toMatch(/\.jpg$/)
    expect(previewKey!.startsWith(`org/${org.organizationId}/`)).toBe(true)

    // The ORIGINAL is byte-for-byte what was uploaded. The derivative is a real
    // JPEG, and the row's recorded size describes the derivative's bytes.
    expect(fake.bytesOf(originalKey!)).toEqual(REAL_HEIC_BYTES)
    expect(fake.contentTypeOf(previewKey!)).toBe("image/jpeg")
    expect([...fake.bytesOf(previewKey!)!.subarray(0, 3)]).toEqual([
      0xff, 0xd8, 0xff,
    ])

    const [row] = await sql<
      { preview_storage_key: string; preview_byte_size: string }[]
    >`
      SELECT preview_storage_key, preview_byte_size
        FROM document WHERE id = ${rowOf(result).id}
    `
    expect(row!.preview_storage_key).toBe(previewKey)
    expect(Number(row!.preview_byte_size)).toBe(
      fake.bytesOf(previewKey!)!.byteLength,
    )
  })

  it("STILL UPLOADS a HEIC the decoder cannot open — the derivative is a convenience", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    // `HEIC_BYTES` is a hand-built `ftyp` box: enough to pass the magic-byte
    // allowlist, nothing behind it to decode. This is the shape of every
    // real-world failure — a truncated transfer, an exotic codec — and the
    // client must not lose their document over it.
    const result = await upload(scope, HEIC_BYTES, { filename: "foto.heic" })
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(result.status).toBe("stored")
    expect(rowOf(result).hasPreview).toBe(false)
    expect(fake.keys()).toHaveLength(1)

    const [row] = await sql<{ preview_storage_key: string | null }[]>`
      SELECT preview_storage_key FROM document WHERE id = ${rowOf(result).id}
    `
    expect(row!.preview_storage_key).toBeNull()
  })

  it.each([
    ["a PDF", () => PDF_BYTES],
    ["a PNG", () => PNG_BYTES],
    ["a JPEG", () => JPEG_BYTES],
  ])("never derives anything for %s", async (_label, bytes) => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, bytes())
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(rowOf(result).hasPreview).toBe(false)
    expect(fake.keys()).toHaveLength(1)
  })

  it("does not derive a second time for a duplicate", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    await upload(scope, REAL_HEIC_BYTES, { filename: "prvni.heic" })
    expect(fake.keys()).toHaveLength(2)

    const second = await upload(scope, REAL_HEIC_BYTES, {
      filename: "druhy.heic",
    })
    if (!second.ok) throw new Error("refused")
    expect(second.status).toBe("duplicate")
    // The duplicate branch discards the object it wrote; nothing new is derived
    // from it, and the twin keeps the derivative it was born with.
    expect(fake.keys()).toHaveLength(2)
  })

  it("refuses to move a derivative once it exists (migration 0010)", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    const result = await upload(scope, REAL_HEIC_BYTES, {
      filename: "IMG_0999.heic",
    })
    if (!result.ok) throw new Error("refused")

    const other = `org/${org.organizationId}/00000000-0000-7000-8000-000000000001.jpg`
    await expect(sql`
      UPDATE document SET preview_storage_key = ${other}
       WHERE id = ${rowOf(result).id}
    `).rejects.toThrow(/cannot replace its preview derivative/)

    // Clearing it IS allowed — that is the shape PR 37's retention purge needs.
    await sql`
      UPDATE document SET preview_storage_key = NULL, preview_byte_size = NULL
       WHERE id = ${rowOf(result).id}
    `
  })

  it("refuses a derivative on a row that is not a HEIC, and a half-set pair", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")
    const pdf = await upload(scope, PDF_BYTES)
    if (!pdf.ok) throw new Error("refused")

    const key = `org/${org.organizationId}/00000000-0000-7000-8000-000000000002.jpg`
    await expect(sql`
      UPDATE document SET preview_storage_key = ${key}, preview_byte_size = 10
       WHERE id = ${rowOf(pdf).id}
    `).rejects.toThrow(/document_preview_only_for_heic/)

    const heic = await upload(scope, REAL_HEIC_BYTES, { filename: "x.heic" })
    if (!heic.ok) throw new Error("refused")
    await expect(sql`
      UPDATE document SET preview_byte_size = NULL
       WHERE id = ${rowOf(heic).id}
    `).rejects.toThrow(/document_preview_pair_complete/)
  })
})

describe("uploadDocument — the client downscale changes nothing about the server", () => {
  it("accepts the JPEG a browser canvas would have produced", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    // A genuine JPEG, produced by re-encoding the HEIC fixture — the same shape
    // of bytes `prepareUpload` hands the request after a canvas re-encode.
    const { heicJpegPreview } = await import("@/lib/storage/heic-preview")
    const encoded = await heicJpegPreview(REAL_HEIC_BYTES)
    expect(encoded).not.toBeNull()

    const result = await upload(scope, encoded!.bytes, {
      filename: "IMG_0421.jpg",
    })
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(rowOf(result).contentType).toBe("image/jpeg")
    expect(rowOf(result).byteSize).toBe(encoded!.bytes.byteLength)
    // A downscaled photo is an ordinary JPEG: no derivative, one object.
    expect(rowOf(result).hasPreview).toBe(false)
    expect(fake.keys()).toHaveLength(1)
  })

  it("still refuses a spoofed upload — the browser's opinion is not an input", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    // A ZIP named like a downscaled photo. The client-side pipeline would have
    // called this an image; the server reads the bytes.
    const result = await upload(scope, ZIP_BYTES, { filename: "IMG_0421.jpg" })
    expect(result).toEqual({ ok: false, reason: "unsupported_type" })
    expect(fake.keys()).toEqual([])
  })
})

/**
 * `documentsForPartner` — the Partneři detail's "linked documents" (spec §2.4,
 * PR 29). It reuses `visibleDocuments` whole, so the same four filters that
 * gate every other read here gate this one too; what is worth asserting is
 * only the fifth one this function adds — the `partner_id` match.
 */
describe("documentsForPartner", () => {
  it("returns only the documents linked to this partner", async () => {
    const org = await seedOrganization()
    const partnerA = await createPartnerRow(org.organizationId, {
      name: "Partner A",
    })
    const partnerB = await createPartnerRow(org.organizationId, {
      name: "Partner B",
    })
    await createDocumentRow(org.organizationId, { partnerId: partnerA })
    await createDocumentRow(org.organizationId, { partnerId: partnerB })
    await createDocumentRow(org.organizationId) // no partner at all

    const scope = await scopeFor(org, "admin")
    const rows = await documents.documentsForPartner(scope, partnerA)
    expect(rows).toHaveLength(1)
  })

  it("respects visible_to_client — a hidden document is invisible to a client here too", async () => {
    const org = await seedOrganization()
    const partner = await createPartnerRow(org.organizationId)
    await createDocumentRow(org.organizationId, {
      partnerId: partner,
      visibleToClient: false,
    })

    const ownerRows = await documents.documentsForPartner(
      await scopeFor(org, "owner"),
      partner,
    )
    expect(ownerRows).toHaveLength(1)

    const memberRows = await documents.documentsForPartner(
      await scopeFor(org, "member"),
      partner,
    )
    expect(memberRows).toHaveLength(0)
  })

  it("excludes a soft-deleted document", async () => {
    const org = await seedOrganization()
    const partner = await createPartnerRow(org.organizationId)
    await createDocumentRow(org.organizationId, {
      partnerId: partner,
      deleted: true,
    })

    const rows = await documents.documentsForPartner(
      await scopeFor(org, "admin"),
      partner,
    )
    expect(rows).toHaveLength(0)
  })

  it("never crosses into another organization's documents", async () => {
    const foreign = await seedOrganization()
    const foreignPartner = await createPartnerRow(foreign.organizationId)
    await createDocumentRow(foreign.organizationId, {
      partnerId: foreignPartner,
    })

    const target = await seedOrganization()
    const rows = await documents.documentsForPartner(
      await scopeFor(target, "admin"),
      foreignPartner,
    )
    expect(rows).toHaveLength(0)
  })
})
