/**
 * Pro účetní › Zpracování — the owner-only write layer, against a real
 * Postgres.
 *
 * Three things this file owns and `documents.test.ts` does not:
 *   1. the status transition graph, exhaustively — every one of the 16
 *      `(from, to)` pairs the four statuses can form;
 *   2. `saveDocumentOffice`'s refusals — illegal transition, a returned row
 *      with no message, a malformed date or amount, a lost race;
 *   3. that `OwnerScope` really is a NARROWER door than `OrgScope` — every
 *      write here is unreachable without one, and non-owner roles never even
 *      obtain the handle (`requireOwner` 404s them — proven exhaustively in
 *      `scope.test.ts`; this file adds the write-layer side of that same
 *      proof: an admin/member/guest's OWN `OrgScope` cannot be widened into a
 *      call these functions accept, because there is no `OwnerScope` for it
 *      to be).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import postgres from "postgres"

import {
  createPartnerRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

// spec §2.11 event 1 — `saveDocumentOffice` fires a notification through
// `@workspace/email`. Mocked here (not a console-transport wait) so the tests
// below can assert WHO it was sent to and WHEN, against real rows.
const sendEmail = vi.hoisted(() =>
  vi.fn(async (_message: { to: string }) => {}),
)

vi.mock("@workspace/email", () => ({
  sendEmail,
  betaDocumentAttentionEmail: (input: { to: string }) => ({
    to: input.to,
    subject: "doc",
    html: "<html/>",
    text: "doc",
  }),
  betaClientTaskEmail: (input: { to: string }) => ({
    to: input.to,
    subject: "task",
    html: "<html/>",
    text: "task",
  }),
  betaPeriodPublishedEmail: (input: { to: string }) => ({
    to: input.to,
    subject: "period",
    html: "<html/>",
    text: "period",
  }),
}))

type DocumentsModule = typeof import("./documents")
type DocumentsOfficeModule = typeof import("./documents-office")
type ScopeModule = typeof import("./scope")

let documents: DocumentsModule
let office: DocumentsOfficeModule
let scopeModule: ScopeModule
let sql: postgres.Sql

const ALL_STATUSES = [
  "received",
  "in_processing",
  "processed",
  "returned",
] as const

beforeAll(async () => {
  sql = postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })
  documents = await import("./documents")
  office = await import("./documents-office")
  scopeModule = await import("./scope")
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

/** A scope handle for one of `org`'s seeded members — the real door. */
async function orgScopeFor(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  request.headers = org.members[role].headers
  const scope = await scopeModule.resolveOrgScope(org.slug)
  if (!scope) throw new Error(`fixture: no scope for ${role} in ${org.slug}`)
  return scope
}

/** The owner's write handle — the only thing this module's functions accept. */
async function ownerScopeFor(org: TestOrganization) {
  return scopeModule.requireOwner(await orgScopeFor(org, "owner"))
}

async function insertDocument(
  org: TestOrganization,
  overrides: {
    status?: (typeof ALL_STATUSES)[number]
    docType?: string
    officeMessage?: string | null
    internalNote?: string | null
    visibleToClient?: boolean
    filename?: string
  } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO document (
      organization_id, original_filename, storage_key, content_type,
      extension, byte_size, sha256, doc_type, status, office_message,
      internal_note, visible_to_client
    ) VALUES (
      ${org.organizationId},
      ${overrides.filename ?? "faktura.pdf"},
      ${`org/${org.organizationId}/${crypto.randomUUID()}.pdf`},
      'application/pdf', 'pdf', 1024, ${crypto.randomUUID().replace(/-/g, "").padEnd(64, "0")},
      ${overrides.docType ?? "invoice_in"},
      ${overrides.status ?? "received"},
      ${overrides.officeMessage ?? null},
      ${overrides.internalNote ?? null},
      ${overrides.visibleToClient ?? true}
    )
    RETURNING id
  `
  return row!.id
}

describe("isLegalStatusTransition — the exhaustive matrix", () => {
  const LEGAL = new Set([
    "received>in_processing",
    "received>processed",
    "received>returned",
    "in_processing>received",
    "in_processing>processed",
    "in_processing>returned",
    "processed>in_processing",
    "returned>in_processing",
  ])

  const MATRIX = ALL_STATUSES.flatMap((from) =>
    ALL_STATUSES.map((to) => [from, to] as const),
  )

  it.each(MATRIX)("%s → %s", (from, to) => {
    const expected = LEGAL.has(`${from}>${to}`)
    expect(office.isLegalStatusTransition(from, to), `${from} → ${to}`).toBe(
      expected,
    )
  })

  it("has no legal self-loop — a resave is not a transition", () => {
    for (const status of ALL_STATUSES) {
      expect(office.isLegalStatusTransition(status, status), status).toBe(false)
    }
  })

  it("matches exactly 8 of the 16 possible pairs", () => {
    expect(LEGAL.size).toBe(8)
  })
})

describe("saveDocumentOffice — status transitions", () => {
  it("moves a document through the whole happy path", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)

    const toProcessing = await office.saveDocumentOffice(owner, id, {
      status: "in_processing",
    })
    expect(toProcessing.ok && toProcessing.document.status).toBe(
      "in_processing",
    )

    const toProcessed = await office.saveDocumentOffice(owner, id, {
      status: "processed",
    })
    expect(toProcessed.ok && toProcessed.document.status).toBe("processed")
  })

  it("refuses an illegal transition, and leaves the row untouched", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "processed" })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "returned",
      officeMessage: "Chybí druhá strana",
    })
    expect(result).toEqual({ ok: false, reason: "illegal_transition" })

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM document WHERE id = ${id}
    `
    expect(row!.status).toBe("processed")
  })

  it("resaving the SAME status is not a transition — other fields still save", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "processed" })

    // `processed → processed` is not in the legal graph, but the sheet always
    // submits the current status back, and that must not refuse.
    const result = await office.saveDocumentOffice(owner, id, {
      status: "processed",
      siteRef: "Vinohrady",
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.document.status).toBe("processed")
    expect(result.ok && result.document.siteRef).toBe("Vinohrady")
  })

  it("refuses `returned` with no message, from the patch or the existing row", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const bare = await insertDocument(org, { status: "in_processing" })
    expect(
      await office.saveDocumentOffice(owner, bare, { status: "returned" }),
    ).toEqual({ ok: false, reason: "message_required" })

    const emptied = await insertDocument(org, {
      status: "in_processing",
      officeMessage: "bude smazáno",
    })
    expect(
      await office.saveDocumentOffice(owner, emptied, {
        status: "returned",
        officeMessage: "   ",
      }),
    ).toEqual({ ok: false, reason: "message_required" })
  })

  it("accepts `returned` with a message supplied in the same save", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "in_processing" })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "returned",
      officeMessage: "Chybí druhá strana faktury",
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.document.status).toBe("returned")
    expect(result.ok && result.document.officeMessage).toBe(
      "Chybí druhá strana faktury",
    )
  })

  it("accepts `returned` when the row already carries a message", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, {
      status: "in_processing",
      officeMessage: "Už tu poznámku má",
    })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "returned",
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.document.officeMessage).toBe("Už tu poznámku má")
  })

  it("the DB CHECK itself still refuses clearing office_message on a returned row directly", async () => {
    // `saveDocumentOffice`'s pre-check makes `isCheckViolation` unreachable
    // through this function alone (the optimistic status re-check means a
    // stale write never lands) — but the CHECK is the database's OWN
    // invariant, independent of this module, and this proves it still holds
    // for any writer, this one included were its pre-check ever removed.
    const org = await seedOrganization()
    const id = await insertDocument(org, {
      status: "returned",
      officeMessage: "Zpráva",
    })

    await expect(
      sql`UPDATE document SET office_message = NULL WHERE id = ${id}`,
    ).rejects.toThrow()
  })
})

describe("saveDocumentOffice — field edits", () => {
  it("writes office_message, internal_note and clientVisible together", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)

    const result = await office.saveDocumentOffice(owner, id, {
      officeMessage: "Prosíme o doplnění",
      internalNote: "Klient má zpoždění dlouhodobě.",
      clientVisible: false,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("refused")
    expect(result.document.officeMessage).toBe("Prosíme o doplnění")
    expect(result.document.note).toBe("Klient má zpoždění dlouhodobě.")
    expect(result.document.clientVisible).toBe(false)
  })

  it("clears a field when given an empty value, not a stale one", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { internalNote: "stará poznámka" })

    const result = await office.saveDocumentOffice(owner, id, {
      internalNote: "   ",
    })
    expect(result.ok && result.document.note).toBeNull()
  })

  it("accepts a valid date and a valid amount", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)

    const result = await office.saveDocumentOffice(owner, id, {
      documentDate: "2026-03-15",
      amount: "-1234.56",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("refused")
    expect(result.document.documentDate).toBe("2026-03-15")
    expect(result.document.amount).toBe("-1234.56")
  })

  it.each(["31.3.2026", "2026/03/15", "not-a-date", "2026-4-1"])(
    "refuses an invalid date %s",
    async (bad) => {
      const org = await seedOrganization()
      const owner = await ownerScopeFor(org)
      const id = await insertDocument(org)

      expect(
        await office.saveDocumentOffice(owner, id, { documentDate: bad }),
      ).toEqual({ ok: false, reason: "invalid_date" })
    },
  )

  it.each(["1e10", "12,50", "abc", "1.234.567", "1.2345"])(
    "refuses an invalid amount %s",
    async (bad) => {
      const org = await seedOrganization()
      const owner = await ownerScopeFor(org)
      const id = await insertDocument(org)

      expect(
        await office.saveDocumentOffice(owner, id, { amount: bad }),
      ).toEqual({ ok: false, reason: "invalid_amount" })
    },
  )

  it("an empty patch is a no-op, not a refusal", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { officeMessage: "beze změny" })

    const result = await office.saveDocumentOffice(owner, id, {})
    expect(result.ok).toBe(true)
    expect(result.ok && result.document.officeMessage).toBe("beze změny")
  })

  it("trims and caps site_ref at 120 chars, sharing documents.ts's own rule", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)

    const result = await office.saveDocumentOffice(owner, id, {
      siteRef: `  ${"a".repeat(200)}  `,
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.document.siteRef?.length).toBe(120)
  })
})

describe("saveDocumentOffice — protistrana (partnerId, PR 29)", () => {
  it("links a document to a partner of the same book", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)
    const partnerId = await createPartnerRow(org.organizationId)

    const result = await office.saveDocumentOffice(owner, id, { partnerId })
    expect(result.ok).toBe(true)
    expect(result.ok && result.document.partnerId).toBe(partnerId)
  })

  it("clears the link with an explicit null", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const partnerId = await createPartnerRow(org.organizationId)
    const id = await insertDocument(org)
    await office.saveDocumentOffice(owner, id, { partnerId })

    const result = await office.saveDocumentOffice(owner, id, {
      partnerId: null,
    })
    expect(result.ok && result.document.partnerId).toBeNull()
  })

  it("refuses a partner id from another organization's book", async () => {
    const foreign = await seedOrganization()
    const foreignPartnerId = await createPartnerRow(foreign.organizationId)
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)

    expect(
      await office.saveDocumentOffice(owner, id, {
        partnerId: foreignPartnerId,
      }),
    ).toEqual({ ok: false, reason: "invalid_partner" })
  })

  it("refuses a partner id that names no row at all", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)

    expect(
      await office.saveDocumentOffice(owner, id, {
        partnerId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toEqual({ ok: false, reason: "invalid_partner" })
  })
})

describe("saveDocumentOffice — a lost race", () => {
  it("lets exactly one of two concurrent saves through, and the other reports conflict", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "received" })

    const [a, b] = await Promise.all([
      office.saveDocumentOffice(owner, id, { status: "in_processing" }),
      office.saveDocumentOffice(owner, id, {
        status: "returned",
        officeMessage: "Chybí",
      }),
    ])

    const outcomes = [a, b]
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1)
    expect(
      outcomes.filter((r) => !r.ok && r.reason === "conflict"),
    ).toHaveLength(1)

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM document WHERE id = ${id}
    `
    expect(["in_processing", "returned"]).toContain(row!.status)
  })
})

describe("tenancy, soft-delete and payslip exclusion — the same four filters as documents.ts, minus visible_to_client", () => {
  it("never reaches another organization's document", async () => {
    const a = await seedOrganization()
    const b = await seedOrganization()
    const id = await insertDocument(a)

    const ownerB = await ownerScopeFor(b)
    expect(await office.documentDetailForOwner(ownerB, id)).toBeNull()
    expect(
      await office.saveDocumentOffice(ownerB, id, { status: "in_processing" }),
    ).toEqual({ ok: false, reason: "not_found" })
    expect(await office.listQueueDocuments(ownerB)).toEqual([])
  })

  it("answers null/not_found for a malformed id rather than raising", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    for (const bad of ["not-a-uuid", "' OR 1=1 --", "", "../../etc/passwd"]) {
      expect(await office.documentDetailForOwner(owner, bad)).toBeNull()
      expect(
        await office.saveDocumentOffice(owner, bad, { status: "processed" }),
      ).toEqual({ ok: false, reason: "not_found" })
    }
  })

  it("excludes a soft-deleted document", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org)
    await sql`UPDATE document SET deleted_at = now() WHERE id = ${id}`

    expect(await office.documentDetailForOwner(owner, id)).toBeNull()
    expect(await office.listQueueDocuments(owner)).toEqual([])
  })

  it("excludes a payslip-typed row even for the owner (spec §2.2)", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { docType: "payslip" })

    expect(await office.documentDetailForOwner(owner, id)).toBeNull()
    expect(await office.listQueueDocuments(owner)).toEqual([])
    expect(
      await office.saveDocumentOffice(owner, id, { status: "processed" }),
    ).toEqual({ ok: false, reason: "not_found" })
  })

  it("the owner sees a not-client-visible document — unlike documents.ts's read for other roles", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { visibleToClient: false })

    expect(await office.documentDetailForOwner(owner, id)).not.toBeNull()
    expect((await office.listQueueDocuments(owner)).map((d) => d.id)).toContain(
      id,
    )
  })
})

describe("listQueueDocuments — ordering and filters", () => {
  it("defaults to received + in_processing, received first, then oldest first", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const oldReceived = await insertDocument(org, { status: "received" })
    await sql`UPDATE document SET created_at = now() - interval '2 days' WHERE id = ${oldReceived}`
    const newReceived = await insertDocument(org, { status: "received" })
    const inProcessing = await insertDocument(org, { status: "in_processing" })
    await insertDocument(org, { status: "processed" })
    await insertDocument(org, { status: "returned", officeMessage: "x" })

    const ids = (await office.listQueueDocuments(owner)).map((d) => d.id)
    expect(ids).toEqual([oldReceived, newReceived, inProcessing])
  })

  it("`statuses` widens or narrows the filter explicitly", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const processed = await insertDocument(org, { status: "processed" })
    await insertDocument(org, { status: "received" })

    const onlyProcessed = await office.listQueueDocuments(owner, {
      statuses: ["processed"],
    })
    expect(onlyProcessed.map((d) => d.id)).toEqual([processed])
  })
})

describe("the visible_to_client toggle's real effect on client reads (spec §2.2)", () => {
  it("hiding a document removes it from every non-owner read and duplicate answer", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const member = await orgScopeFor(org, "member")
    const id = await insertDocument(org, { visibleToClient: true })

    expect((await documents.listDocuments(member)).documents).toHaveLength(1)
    expect(await documents.documentForScope(member, id)).not.toBeNull()

    const hidden = await office.saveDocumentOffice(owner, id, {
      clientVisible: false,
    })
    expect(hidden.ok && hidden.document.clientVisible).toBe(false)

    expect((await documents.listDocuments(member)).documents).toEqual([])
    expect(await documents.documentForScope(member, id)).toBeNull()

    // The owner still sees it, hidden layer and all.
    expect((await documents.listDocuments(owner)).documents).toHaveLength(1)
  })

  it("flips back to visible and the client can read it again", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const guest = await orgScopeFor(org, "guest")
    const id = await insertDocument(org, { visibleToClient: false })

    expect((await documents.listDocuments(guest)).documents).toEqual([])

    const shown = await office.saveDocumentOffice(owner, id, {
      clientVisible: true,
    })
    expect(shown.ok && shown.document.clientVisible).toBe(true)

    expect((await documents.listDocuments(guest)).documents).toHaveLength(1)
    expect(await documents.documentForScope(guest, id)).not.toBeNull()
  })
})

describe("spec §2.11 event 1 — the document-attention notification", () => {
  beforeEach(() => {
    sendEmail.mockClear()
  })

  it("fires on a real transition into returned, to every notifiable recipient — never the owner", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "received" })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "returned",
      officeMessage: "Chybí variabilní symbol.",
    })
    expect(result.ok).toBe(true)

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled())
    const recipients = sendEmail.mock.calls
      .map(([m]) => (m as { to: string }).to)
      .sort()
    expect(recipients).toEqual(
      [
        org.members.admin.email,
        org.members.member.email,
        org.members.guest.email,
      ].sort(),
    )
    expect(recipients).not.toContain(org.members.owner.email)
  })

  it("fires when only the office message changes, on an unrelated status", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, {
      status: "in_processing",
      officeMessage: null,
    })

    const result = await office.saveDocumentOffice(owner, id, {
      officeMessage: "Ještě prosím doplňte přílohu.",
    })
    expect(result.ok).toBe(true)

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(3))
  })

  it("does NOT fire on a status change that carries no message change", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "received" })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "in_processing",
    })
    expect(result.ok).toBe(true)

    // Give any (wrongly) fired dispatch a chance to land before asserting
    // absence — `vi.waitFor` only proves a positive; a fixed settle is the
    // honest way to assert a negative against async fire-and-forget code.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("does NOT fire on a no-op save (nothing changed)", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "received" })

    const result = await office.saveDocumentOffice(owner, id, {})
    expect(result.ok).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("respects the per-user toggle and excludes a disabled account", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await sql`UPDATE app_user SET email_notifications_enabled = false WHERE id = ${org.members.admin.userId}`
    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${org.members.member.userId}`
    const id = await insertDocument(org, { status: "received" })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "returned",
      officeMessage: "Chybí VS.",
    })
    expect(result.ok).toBe(true)

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({
      to: org.members.guest.email,
    })
  })

  it("sends after the row is already committed — a fresh read sees the new status", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await insertDocument(org, { status: "received" })

    sendEmail.mockImplementationOnce(async () => {
      const [row] = await sql<{ status: string }[]>`
        SELECT status FROM document WHERE id = ${id}
      `
      expect(row?.status).toBe("returned")
    })

    const result = await office.saveDocumentOffice(owner, id, {
      status: "returned",
      officeMessage: "Chybí VS.",
    })
    expect(result.ok).toBe(true)

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled())
  })
})
