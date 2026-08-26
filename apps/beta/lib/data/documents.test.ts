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
import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

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

describe("uploadDocument — the happy path", () => {
  it("stores the bytes, records the row, and answers with a projection", async () => {
    const fake = useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, PDF_BYTES)
    if (!result.ok) throw new Error(`refused: ${result.reason}`)

    expect(result.status).toBe("stored")
    expect(result.document.filename).toBe(CZECH_FILENAME)
    expect(result.document.contentType).toBe("application/pdf")
    expect(result.document.byteSize).toBe(PDF_BYTES.length)
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

    expect(result.document.contentType).toBe("image/png")
    const [row] = await sql<{ extension: string; storage_key: string }[]>`
      SELECT extension, storage_key FROM document WHERE id = ${result.document.id}
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
      SELECT storage_key FROM document WHERE id = ${result.document.id}
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
      SELECT uploaded_by_user_id FROM document WHERE id = ${result.document.id}
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
    expect(result.document.filename).toBe("faktura.pdf")
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
    expect(second.document.id).toBe(first.document.id)
    expect(second.document.filename).toBe("prvni.pdf")

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
    expect(await documents.softDeleteDocument(owner, first.document.id)).toBe(
      true,
    )

    const again = await upload(owner, PDF_BYTES)
    if (!again.ok) throw new Error("re-upload refused")
    expect(again.status).toBe("stored")
    expect(again.document.id).not.toBe(first.document.id)
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
    expect(a.document.id).toBe(b.document.id)
    expect(fake.keys()).toHaveLength(1)

    const rows =
      await sql`SELECT id FROM document WHERE organization_id = ${scope.organizationId}`
    expect(rows).toHaveLength(1)
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

    await documents.softDeleteDocument(owner, first.document.id)
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
      await documents.documentForScope(intruder, mine.document.id),
    ).toBeNull()
    expect(
      await documents.openDocumentFile(intruder, mine.document.id),
    ).toBeNull()
    expect(await documents.listDocuments(intruder)).toEqual([])
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
    await documents.softDeleteDocument(owner, result.document.id)

    expect(
      await documents.documentForScope(owner, result.document.id),
    ).toBeNull()
    expect(
      await documents.openDocumentFile(owner, result.document.id),
    ).toBeNull()
    expect(await documents.listDocuments(owner)).toEqual([])
  })

  it("only the owner may soft-delete", async () => {
    useStore()
    const org = await seedOrganization()
    const member = await scopeFor(org, "member")

    const result = await upload(member, PDF_BYTES)
    if (!result.ok) throw new Error("refused")

    expect(await documents.softDeleteDocument(member, result.document.id)).toBe(
      false,
    )
    expect(
      await documents.softDeleteDocument(
        await scopeFor(org, "guest"),
        result.document.id,
      ),
    ).toBe(false)
    expect(
      await documents.softDeleteDocument(
        await scopeFor(org, "owner"),
        result.document.id,
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
    await sql`UPDATE document SET doc_type = 'payslip' WHERE id = ${result.document.id}`

    expect(await documents.listDocuments(owner)).toEqual([])
    expect(
      await documents.documentForScope(owner, result.document.id),
    ).toBeNull()
    expect(
      await documents.openDocumentFile(owner, result.document.id),
    ).toBeNull()
  })

  it("hides a not-client-visible document from everyone but the owner", async () => {
    useStore()
    const org = await seedOrganization()
    const owner = await scopeFor(org, "owner")

    const result = await upload(owner, PDF_BYTES)
    if (!result.ok) throw new Error("refused")
    await sql`UPDATE document SET visible_to_client = false WHERE id = ${result.document.id}`

    expect(await documents.listDocuments(owner)).toHaveLength(1)
    for (const role of ["admin", "member", "guest"] as const) {
      const scope = await scopeFor(org, role)
      expect(await documents.listDocuments(scope)).toEqual([])
      expect(
        await documents.documentForScope(scope, result.document.id),
      ).toBeNull()
      expect(
        await documents.openDocumentFile(scope, result.document.id),
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

    expect((await documents.listDocuments(scope)).map((d) => d.id)).toEqual([
      second.document.id,
      first.document.id,
    ])
  })
})

describe("openDocumentFile", () => {
  it("streams back exactly the stored bytes", async () => {
    useStore()
    const org = await seedOrganization()
    const scope = await scopeFor(org, "member")

    const result = await upload(scope, JPEG_BYTES)
    if (!result.ok) throw new Error("refused")

    const handle = await documents.openDocumentFile(scope, result.document.id)
    if (!handle) throw new Error("no handle")

    const parts: Buffer[] = []
    for await (const chunk of handle.body) parts.push(Buffer.from(chunk))
    expect(Buffer.concat(parts)).toEqual(JPEG_BYTES)
    expect(handle.inlineAllowed).toBe(true)
  })

  it.each([
    ["PDF", PDF_BYTES, false],
    ["HEIC", HEIC_BYTES, false],
    ["PNG", PNG_BYTES, true],
    ["JPEG", JPEG_BYTES, true],
  ] as const)(
    "marks %s inline-allowed = %s",
    async (_label, bytes, allowed) => {
      useStore()
      const org = await seedOrganization()
      const scope = await scopeFor(org, "member")

      const result = await upload(scope, Buffer.from(bytes))
      if (!result.ok) throw new Error("refused")

      const handle = await documents.openDocumentFile(scope, result.document.id)
      expect(handle?.inlineAllowed).toBe(allowed)
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
      sql`UPDATE document SET status = 'returned' WHERE id = ${result.document.id}`,
    ).rejects.toThrow()

    await expect(sql`
      UPDATE document SET status = 'returned', office_message = 'Chybí druhá strana'
       WHERE id = ${result.document.id}
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
       WHERE id = ${result.document.id}
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
       WHERE id = ${result.document.id}
    `).rejects.toThrow(/cannot change its stored object/)

    await expect(sql`
      UPDATE document SET sha256 = ${"e".repeat(64)} WHERE id = ${result.document.id}
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
      SELECT uploaded_by_user_id FROM document WHERE id = ${result.document.id}
    `
    expect(row!.uploaded_by_user_id).toBeNull()
  })
})
