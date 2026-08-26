/**
 * The filing registry through the seam (spec §2.3).
 *
 * Extends the contract `scope.test.ts` establishes: every org-scoped surface
 * this app grows reaches its data through `requireScope`, so a new module's
 * cross-org case costs a fixture and an `expect404` rather than a fresh suite.
 * The sessions are genuine Better Auth sessions; only `next/headers` is mocked,
 * because there is no HTTP request in a test runner.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  attachDocumentToFiling,
  createDocumentRow,
  createFilingRow,
  createMonthPeriod,
  createReportingPeriod,
  endFixtures,
  hardDeleteDocument,
  seedOrganization,
  softDeleteDocument,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope } = await import("./scope")
const {
  filingsForScope,
  visibleFilingFamiliesForScope,
  createFiling,
  updateFiling,
  deleteFilings,
} = await import("./filings")
const { ensureReportingPeriod, reportingPeriodsForScope } =
  await import("./reporting-periods")
const { forbiddenClientKeys } = await import("./projections")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

async function expect404(
  run: () => Promise<unknown> | unknown,
  because: string,
): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest, because).toBe(NOT_FOUND_DIGEST)
}

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * Assert that a database constraint refused the write, by NAME.
 *
 * Drizzle raises a `DrizzleQueryError` whose own message is the failing SQL and
 * hangs the driver error off `cause` (the same wrapping `lib/pg-error.ts` walks
 * for its SQLSTATE checks), so a plain `.rejects.toThrow(/constraint_name/)`
 * matches the query text instead of the refusal and passes for the wrong reason
 * — or, here, fails while the guard is working.
 */
async function expectConstraintRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let messages = "<no throw>"
  try {
    await run()
  } catch (error) {
    const chain: string[] = []
    let current: unknown = error
    for (let depth = 0; current && depth < 5; depth++) {
      chain.push(String((current as { message?: unknown }).message ?? current))
      current = (current as { cause?: unknown }).cause
    }
    messages = chain.join("\n")
  }
  expect(messages).toMatch(constraint)
}

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  ;[orgA, orgB] = await Promise.all([seedOrganization(), seedOrganization()])
})

afterAll(async () => {
  await endFixtures()
})

describe("filingsForScope — a scoped read", () => {
  it("returns only the scope's own filings", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()

    const periodId = await createMonthPeriod(org.organizationId)
    const foreignPeriodId = await createMonthPeriod(foreign.organizationId)
    const mine = await createFilingRow(org.organizationId, periodId)
    await createFilingRow(foreign.organizationId, foreignPeriodId)

    as(org.members.admin.headers)
    const rows = await filingsForScope(await requireScope(org.slug))

    expect(rows.map((row) => row.id)).toEqual([mine])
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    const periodId = await createMonthPeriod(orgB.organizationId)
    await createFilingRow(orgB.organizationId, periodId)

    // There is no organization id in the signature. Reading A's filings here
    // would require holding a scope for A, which requires a membership in A.
    as(orgA.members.member.headers)
    await expect404(
      () => requireScope(orgB.slug),
      "A's member must not resolve B",
    )
  })

  it("is readable by every role, guest included", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId)

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const rows = await filingsForScope(await requireScope(org.slug))
      // §5: guest is an external VIEWER of client-visible data, not a blinded
      // one. The role restrictions bite at the write surfaces.
      expect(rows, `${role} reads the registry`).toHaveLength(1)
    }
  })

  it("orders by deadline and carries the derived family, period and overdue flag", async () => {
    const org = await seedOrganization()
    const monthId = await createMonthPeriod(org.organizationId)
    const yearId = await createReportingPeriod(org.organizationId, {
      kind: "year",
      year: 2026,
    })

    await createFilingRow(org.organizationId, yearId, {
      kind: "dppo_priznani",
      dueOn: "2026-07-01",
    })
    await createFilingRow(org.organizationId, monthId, {
      kind: "dph_kontrolni_hlaseni",
      dueOn: "2026-02-25",
    })

    as(org.members.admin.headers)
    const rows = await filingsForScope(await requireScope(org.slug))

    expect(rows.map((row) => row.kind)).toEqual([
      "dph_kontrolni_hlaseni",
      "dppo_priznani",
    ])
    // The family is not a column — it is `beta_filing_family(kind)` read back
    // off the row, so there is no second copy of the mapping in TypeScript.
    expect(rows.map((row) => row.family)).toEqual(["dph", "dan_z_prijmu"])
    // Both deadlines are in the past relative to any run after 2026-07-01, and
    // both are unpaid — but what matters here is that the flag is present and
    // boolean, not stored.
    expect(rows.every((row) => typeof row.overdue === "boolean")).toBe(true)
    // The period comes across with its DERIVED boundaries, computed once, in
    // the database.
    expect(rows[1]!.period).toMatchObject({
      kind: "year",
      year: 2026,
      month: null,
      quarter: null,
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
    })
  })

  it("never reports a paid filing as overdue, however late the payment was", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      dueInDays: -400,
      amountDue: "10000.00",
      paidAt: new Date(),
    })

    as(org.members.admin.headers)
    const [row] = await filingsForScope(await requireScope(org.slug))
    expect(row!.overdue).toBe(false)
  })

  it("filters by family — the five §2.3 sidebar entries over one table", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)

    await createFilingRow(org.organizationId, periodId, {
      kind: "dph_priznani",
    })
    await createFilingRow(org.organizationId, periodId, {
      kind: "prehled_cssz",
    })
    await createFilingRow(org.organizationId, periodId, {
      kind: "silnicni_dan",
    })

    as(org.members.admin.headers)
    const scope = await requireScope(org.slug)

    expect(await filingsForScope(scope)).toHaveLength(3)
    expect(
      (await filingsForScope(scope, { family: "dph" })).map((r) => r.kind),
    ).toEqual(["dph_priznani"])
    expect(
      (await filingsForScope(scope, { family: "mzdove_odvody" })).map(
        (r) => r.kind,
      ),
    ).toEqual(["prehled_cssz"])
    expect(
      (await filingsForScope(scope, { family: "dan_z_prijmu" })).map(
        (r) => r.kind,
      ),
    ).toEqual([])
  })

  it("returns money as a string, at full scale and sign", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      dueOn: "2026-02-25",
      amountDue: "18450.50",
    })
    await createFilingRow(org.organizationId, periodId, {
      dueOn: "2026-03-25",
      // Nadměrný odpočet — the FÚ owes the client.
      amountDue: "-2400.00",
    })
    await createFilingRow(org.organizationId, periodId, {
      dueOn: "2026-04-25",
      amountDue: null,
    })

    as(org.members.guest.headers)
    const rows = await filingsForScope(await requireScope(org.slug))

    expect(rows.map((row) => row.amountDue)).toEqual([
      "18450.50",
      "-2400.00",
      // NULL is "the office has not stated an amount", which is not zero (§0.4).
      null,
    ])
    expect(typeof rows[0]!.amountDue).toBe("string")
  })

  it("returns a projection that carries no office-internal column", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      noteClient: "Zaplaťte prosím do 25.",
      noteInternal: "Klient neposlal podklady, urgovat 20.",
    })

    as(org.members.guest.headers)
    const [row] = await filingsForScope(await requireScope(org.slug))

    expect(row!.noteClient).toBe("Zaplaťte prosím do 25.")
    expect(forbiddenClientKeys(row)).toEqual([])
    expect(JSON.stringify(row)).not.toContain("urgovat")
    // The attachment is reported as a boolean, never as an id the reader could
    // try elsewhere.
    expect(row!.hasAttachment).toBe(false)
    expect(row).not.toHaveProperty("documentId")
    expect(row).not.toHaveProperty("organizationId")
  })
})

/**
 * `hasAttachment` is not `document_id !== null`.
 *
 * A document is SOFT-deleted in normal operation and the office can mark one
 * hidden, so a filing can hold a perfectly valid id for a row
 * `lib/data/documents.ts` refuses to serve. Reporting `true` off the raw column
 * would put a paperclip in the UI whose only possible outcome is a 404 — the
 * "confidently wrong" failure spec §0.4 is written against. Every filter
 * `visibleDocuments()` applies is mirrored here, and this is the suite that
 * fails if the two drift.
 */
describe("hasAttachment — the four document filters, mirrored", () => {
  async function filingWithDocument(
    org: TestOrganization,
    documentOptions: Parameters<typeof createDocumentRow>[1] = {},
  ): Promise<void> {
    const periodId = await createMonthPeriod(org.organizationId)
    const filingId = await createFilingRow(org.organizationId, periodId)
    const documentId = await createDocumentRow(
      org.organizationId,
      documentOptions,
    )
    await attachDocumentToFiling(filingId, documentId)
  }

  async function hasAttachmentFor(
    org: TestOrganization,
    role: "owner" | "admin" | "member" | "guest",
  ): Promise<boolean> {
    as(org.members[role].headers)
    const [row] = await filingsForScope(await requireScope(org.slug))
    return row!.hasAttachment
  }

  it("is true for a live, client-visible attachment", async () => {
    const org = await seedOrganization()
    await filingWithDocument(org)

    expect(await hasAttachmentFor(org, "guest")).toBe(true)
    expect(await hasAttachmentFor(org, "owner")).toBe(true)
  })

  it("is false once the document is soft-deleted", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const filingId = await createFilingRow(org.organizationId, periodId)
    const documentId = await createDocumentRow(org.organizationId)
    await attachDocumentToFiling(filingId, documentId)

    expect(await hasAttachmentFor(org, "admin")).toBe(true)

    await softDeleteDocument(documentId)

    // "A soft-deleted row is never listed, never served" (migration 0004). The
    // link column is untouched — only the answer changes.
    expect(await hasAttachmentFor(org, "admin")).toBe(false)
    // Including for the owner: soft delete is not the hidden class.
    expect(await hasAttachmentFor(org, "owner")).toBe(false)
  })

  it("hides an office-hidden attachment from everyone but the owner", async () => {
    const org = await seedOrganization()
    await filingWithDocument(org, { visibleToClient: false })

    // owner IS the accountant and sees the whole book.
    expect(await hasAttachmentFor(org, "owner")).toBe(true)
    for (const role of ["admin", "member", "guest"] as const) {
      expect(await hasAttachmentFor(org, role), role).toBe(false)
    }
  })

  it("reads a payslip attachment as absent for every role — fail closed", async () => {
    const org = await seedOrganization()
    await filingWithDocument(org, { docType: "payslip" })

    // §2.2 excludes payslips from every non-payroll surface SERVER-SIDE, and a
    // filing is not a payroll surface. owner included: the exclusion is about
    // the surface, not the reader.
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      expect(await hasAttachmentFor(org, role), role).toBe(false)
    }
  })

  it("survives a hard delete of the document, with the link cleared", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const filingId = await createFilingRow(org.organizationId, periodId, {
      amountDue: "1000.00",
    })
    const documentId = await createDocumentRow(org.organizationId)
    await attachDocumentToFiling(filingId, documentId)

    await hardDeleteDocument(documentId)

    as(org.members.admin.headers)
    const [row] = await filingsForScope(await requireScope(org.slug))
    // `ON DELETE SET NULL (document_id)`: the filing is the record that
    // outlives its scan.
    expect(row!.id).toBe(filingId)
    expect(row!.hasAttachment).toBe(false)
    expect(row!.amountDue).toBe("1000.00")
  })

  it("never reports another organization's document as an attachment", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const filingId = await createFilingRow(org.organizationId, periodId)
    const foreignDocument = await createDocumentRow(foreign.organizationId)

    // The composite FK refuses the write outright, so the read can never be
    // asked the question — which is the stronger guarantee.
    await expect(
      attachDocumentToFiling(filingId, foreignDocument),
    ).rejects.toThrow(/filing_document_fk/)

    expect(await hasAttachmentFor(org, "owner")).toBe(false)
  })
})

describe("visibleFilingFamiliesForScope — the §2.3 DPH gate", () => {
  it("hides DPH from a neplátce with no DPH history", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    as(org.members.admin.headers)

    expect(
      await visibleFilingFamiliesForScope(await requireScope(org.slug)),
    ).toEqual(["dan_z_prijmu", "mzdove_odvody", "ostatni"])
  })

  it("shows DPH to a plátce with no filings yet", async () => {
    const org = await seedOrganization({ vatRegime: "platce" })
    as(org.members.admin.headers)

    // An empty family renders "zatím nebylo nahráno" (§0.4). Hiding it would be
    // wrong: a plátce HAS the obligation, they just have no rows yet.
    expect(
      await visibleFilingFamiliesForScope(await requireScope(org.slug)),
    ).toContain("dph")
  })

  it("keeps DPH visible for a neplátce that has DPH history — the load-bearing half", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      kind: "dph_priznani",
    })

    as(org.members.admin.headers)
    // The company deregistered from VAT; `vat_regime` now says neplatce. The
    // přiznání it filed while it was a plátce must stay reachable.
    expect(
      await visibleFilingFamiliesForScope(await requireScope(org.slug)),
    ).toContain("dph")
  })

  it("is not fooled by a non-DPH filing, or by another organization's DPH history", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      kind: "prehled_cssz",
    })

    const foreign = await seedOrganization({ vatRegime: "platce" })
    const foreignPeriodId = await createMonthPeriod(foreign.organizationId)
    await createFilingRow(foreign.organizationId, foreignPeriodId, {
      kind: "dph_priznani",
    })

    as(org.members.admin.headers)
    expect(
      await visibleFilingFamiliesForScope(await requireScope(org.slug)),
    ).not.toContain("dph")
  })
})

describe("reporting periods", () => {
  it("is idempotent — the same shape twice is the same row", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)

    const first = await ensureReportingPeriod(scope, {
      kind: "month",
      year: 2026,
      month: 7,
    })
    const second = await ensureReportingPeriod(scope, {
      kind: "month",
      year: 2026,
      month: 7,
    })
    expect(second.id).toBe(first.id)
    expect(first).toMatchObject({
      kind: "month",
      year: 2026,
      month: 7,
      quarter: null,
      startsOn: "2026-07-01",
      endsOn: "2026-07-31",
    })
  })

  it("resolves the year-period conflict, where every coordinate is NULL", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)

    // The fallback read has to use IS NOT DISTINCT FROM: `month = NULL` matches
    // nothing, so an `eq` here would turn every repeat call into a throw.
    const first = await ensureReportingPeriod(scope, {
      kind: "year",
      year: 2026,
    })
    const second = await ensureReportingPeriod(scope, {
      kind: "year",
      year: 2026,
    })
    expect(second.id).toBe(first.id)
  })

  it("drops the coordinate that does not belong to the kind", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)

    // A form that remembers the last month while the user switches to
    // "quarter" would otherwise write a row carrying a stale month.
    const period = await ensureReportingPeriod(scope, {
      kind: "quarter",
      year: 2026,
      quarter: 2,
      month: 11,
    })
    expect(period.month).toBeNull()
    expect(period.quarter).toBe(2)
    expect(period.endsOn).toBe("2026-06-30")
  })

  it("lists newest first, interleaving the three shapes by end date", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)

    await ensureReportingPeriod(scope, { kind: "month", year: 2026, month: 1 })
    await ensureReportingPeriod(scope, { kind: "year", year: 2026 })
    await ensureReportingPeriod(scope, {
      kind: "quarter",
      year: 2026,
      quarter: 2,
    })

    const periods = await reportingPeriodsForScope(scope)
    expect(periods.map((p) => p.endsOn)).toEqual([
      "2026-12-31",
      "2026-06-30",
      "2026-01-31",
    ])
    expect(
      (await reportingPeriodsForScope(scope, { kind: "month" })).map(
        (p) => p.kind,
      ),
    ).toEqual(["month"])
  })

  it("belongs to one organization only", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()

    as(org.members.owner.headers)
    await ensureReportingPeriod(await requireScope(org.slug), {
      kind: "year",
      year: 2026,
    })

    as(foreign.members.owner.headers)
    expect(
      await reportingPeriodsForScope(await requireScope(foreign.slug)),
    ).toEqual([])
  })

  it("404s every role but owner — client pages are read-only (§3.3)", async () => {
    const org = await seedOrganization()
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await requireScope(org.slug)
      await expect404(
        () => ensureReportingPeriod(scope, { kind: "year", year: 2027 }),
        `${role} may not create a period`,
      )
    }
  })
})

describe("office writes", () => {
  it("creates, edits and deletes a filing", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)
    const period = await ensureReportingPeriod(scope, {
      kind: "month",
      year: 2026,
      month: 3,
    })

    const { id } = await createFiling(scope, {
      kind: "dph_priznani",
      periodId: period.id,
      dueOn: "2026-04-27",
      amountDue: "31200.00",
      variableSymbol: "12345678",
      noteInternal: "Interní poznámka",
    })

    const [created] = await filingsForScope(scope)
    expect(created).toMatchObject({
      id,
      kind: "dph_priznani",
      family: "dph",
      status: "planned",
      dueOn: "2026-04-27",
      amountDue: "31200.00",
      variableSymbol: "12345678",
      filedOn: null,
      paidAt: null,
    })
    // The internal note went in and did not come back out.
    expect(forbiddenClientKeys(created)).toEqual([])
    expect(JSON.stringify(created)).not.toContain("Interní")

    expect(
      await updateFiling(scope, id, {
        status: "filed",
        filedOn: "2026-04-25",
        paidAt: new Date("2026-04-26T09:00:00Z"),
      }),
    ).toBe(true)

    const [edited] = await filingsForScope(scope)
    expect(edited!.status).toBe("filed")
    expect(edited!.filedOn).toBe("2026-04-25")
    expect(edited!.paidAt).toBe("2026-04-26T09:00:00.000Z")

    expect(await deleteFilings(scope, [id])).toBe(1)
    expect(await filingsForScope(scope)).toEqual([])
  })

  it("404s every role but owner", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const ownerScope = await requireScope(org.slug)
    const period = await ensureReportingPeriod(ownerScope, {
      kind: "year",
      year: 2026,
    })
    const { id } = await createFiling(ownerScope, {
      kind: "dppo_priznani",
      periodId: period.id,
      dueOn: "2027-07-01",
    })

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await requireScope(org.slug)

      await expect404(
        () =>
          createFiling(scope, {
            kind: "ostatni",
            periodId: period.id,
            dueOn: "2027-01-01",
          }),
        `${role} may not create a filing`,
      )
      await expect404(
        () => updateFiling(scope, id, { amountDue: "1.00" }),
        `${role} may not edit a filing`,
      )
      await expect404(
        () => deleteFilings(scope, [id]),
        `${role} may not delete a filing`,
      )
    }

    as(org.members.owner.headers)
    expect(await filingsForScope(await requireScope(org.slug))).toHaveLength(1)
  })

  it("refuses a period belonging to another organization", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()

    as(foreign.members.owner.headers)
    const foreignPeriod = await ensureReportingPeriod(
      await requireScope(foreign.slug),
      { kind: "year", year: 2026 },
    )

    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)

    // The composite FK carries organization_id, so this is a database refusal
    // rather than a silently-wrong row stamped with a foreign period.
    await expectConstraintRefusal(
      () =>
        createFiling(scope, {
          kind: "ostatni",
          periodId: foreignPeriod.id,
          dueOn: "2026-12-31",
        }),
      /filing_period_fk/,
    )
  })

  it("cannot edit or delete another organization's filing, id in hand", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const foreignPeriodId = await createMonthPeriod(foreign.organizationId)
    const foreignFilingId = await createFilingRow(
      foreign.organizationId,
      foreignPeriodId,
      { amountDue: "999.00" },
    )

    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)

    // The WHERE clause carries organization_id even though `id` is a primary
    // key. Without it a leaked id would be enough — this database has no RLS
    // behind the seam to catch it.
    expect(
      await updateFiling(scope, foreignFilingId, { amountDue: "0.00" }),
    ).toBe(false)
    expect(await deleteFilings(scope, [foreignFilingId])).toBe(0)

    as(foreign.members.guest.headers)
    const [untouched] = await filingsForScope(await requireScope(foreign.slug))
    expect(untouched!.amountDue).toBe("999.00")
  })

  it("refuses an incoherent status/filed_on pair at the database", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)
    const period = await ensureReportingPeriod(scope, {
      kind: "year",
      year: 2026,
    })

    await expectConstraintRefusal(
      () =>
        createFiling(scope, {
          kind: "dppo_priznani",
          periodId: period.id,
          dueOn: "2027-07-01",
          status: "filed",
        }),
      /filing_filed_coherence/,
    )
  })

  it("treats an empty patch as a no-op rather than a wipe", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)
    const period = await ensureReportingPeriod(scope, {
      kind: "year",
      year: 2026,
    })
    const { id } = await createFiling(scope, {
      kind: "ostatni",
      periodId: period.id,
      dueOn: "2026-12-31",
      amountDue: "500.00",
    })

    expect(await updateFiling(scope, id, {})).toBe(true)
    const [row] = await filingsForScope(scope)
    expect(row!.amountDue).toBe("500.00")
  })

  it("distinguishes an omitted field from an explicit null", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const scope = await requireScope(org.slug)
    const period = await ensureReportingPeriod(scope, {
      kind: "year",
      year: 2026,
    })
    const { id } = await createFiling(scope, {
      kind: "ostatni",
      periodId: period.id,
      dueOn: "2026-12-31",
      amountDue: "500.00",
      variableSymbol: "77",
    })

    // Patching one field must not null the others.
    await updateFiling(scope, id, { variableSymbol: "88" })
    let [row] = await filingsForScope(scope)
    expect(row!.amountDue).toBe("500.00")
    expect(row!.variableSymbol).toBe("88")

    // And an explicit null clears exactly the field it names.
    await updateFiling(scope, id, { variableSymbol: null })
    ;[row] = await filingsForScope(scope)
    expect(row!.variableSymbol).toBeNull()
    expect(row!.amountDue).toBe("500.00")
  })
})
