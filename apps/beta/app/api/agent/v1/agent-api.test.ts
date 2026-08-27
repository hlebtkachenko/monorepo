/**
 * The agent ingestion API, end to end against a real database (spec §3.2).
 *
 * WHAT THIS SUITE IS FOR. Every claim the API makes is a claim about a REFUSAL:
 * a revoked key answers 401, an org-scoped key cannot reach a second book, a
 * body naming a tenant is rejected before a transaction opens, a refused upsert
 * leaves no activity_log row. None of those mean anything against a mock — they
 * are properties of a live key row, a live membership and a live transaction, so
 * this file runs in the `db` project and drives the real route handlers.
 *
 * The routes are imported dynamically for the same reason every other db suite
 * does it: `DATABASE_URL` is set by globalSetup, and a static import would bind
 * the singleton before it exists.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { generateAgentKey } from "@/lib/agent/key"
import { resetRateLimitersForTests } from "@/lib/auth/rate-limit"
import {
  addMembership,
  archiveOrganization,
  createAccount,
  createAgentKeyRow,
  disableAccount,
  endFixtures,
  readActivityLog,
  seedOrganization,
  setStaff,
  type TestOrganization,
} from "@/tests/fixtures"

type Handler = (
  request: Request,
  context: { params: Promise<{ orgSlug: string }> },
) => Promise<Response>

const ROUTES: Record<string, () => Promise<{ POST: Handler }>> = {
  statements: () =>
    import("./orgs/[orgSlug]/publish/statements/route") as Promise<{
      POST: Handler
    }>,
  trialBalance: () =>
    import("./orgs/[orgSlug]/publish/trial-balance/route") as Promise<{
      POST: Handler
    }>,
  saldokonto: () =>
    import("./orgs/[orgSlug]/publish/saldokonto/route") as Promise<{
      POST: Handler
    }>,
  payroll: () =>
    import("./orgs/[orgSlug]/publish/payroll/route") as Promise<{
      POST: Handler
    }>,
  filings: () =>
    import("./orgs/[orgSlug]/filings/route") as Promise<{ POST: Handler }>,
  liabilities: () =>
    import("./orgs/[orgSlug]/liabilities/route") as Promise<{ POST: Handler }>,
  assets: () =>
    import("./orgs/[orgSlug]/assets/route") as Promise<{ POST: Handler }>,
  clientTasks: () =>
    import("./orgs/[orgSlug]/client-tasks/route") as Promise<{
      POST: Handler
    }>,
  accountBalanceMap: () =>
    import("./orgs/[orgSlug]/account-balance-map/route") as Promise<{
      POST: Handler
    }>,
  indicators: () =>
    import("./orgs/[orgSlug]/indicators/route") as Promise<{ POST: Handler }>,
}

const ENDPOINT = "https://beta.afframe.com/api/agent/v1"

type CallOptions = {
  secret?: string | null
  authorization?: string
  contentType?: string | null
  requestId?: string
  rawBody?: string
}

async function post(
  route: keyof typeof ROUTES,
  orgSlug: string,
  body: unknown,
  options: CallOptions = {},
): Promise<Response> {
  const { POST } = await ROUTES[route]!()
  const headers = new Headers()
  if (options.authorization !== undefined) {
    headers.set("authorization", options.authorization)
  } else if (options.secret) {
    headers.set("authorization", `Bearer ${options.secret}`)
  }
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json")
  }
  if (options.requestId) headers.set("idempotency-key", options.requestId)

  const request = new Request(`${ENDPOINT}/orgs/${orgSlug}/x`, {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  })
  return POST(request, { params: Promise.resolve({ orgSlug }) })
}

async function meta(secret: string | null): Promise<Response> {
  const { GET } = await import("./meta/route")
  const headers = new Headers()
  if (secret) headers.set("authorization", `Bearer ${secret}`)
  return GET(new Request(`${ENDPOINT}/meta`, { headers }))
}

/**
 * The owner handle an agent key resolves to, for reading a write back.
 *
 * Deliberately the API's OWN resolution rather than a hand-built scope: the
 * brands are module-private and cannot be asserted into existence (the boundary
 * fence enforces that in tests too), so a suite that wants to read a book reads
 * it exactly the way the route did.
 */
async function ownerScopeFor(secret: string, orgSlug: string) {
  const { resolveAgentOwnerScope, resolveAgentScope } =
    await import("@/lib/data/scope")
  const { hashAgentKey } = await import("@/lib/agent/key")
  const agent = await resolveAgentScope(hashAgentKey(secret))
  if (!agent) throw new Error("fixture: key did not resolve")
  const owner = await resolveAgentOwnerScope(agent, orgSlug)
  if (!owner) throw new Error(`fixture: key cannot reach ${orgSlug}`)
  return owner
}

const march = { kind: "month", year: 2026, month: 3 } as const

const rozvahaBody = {
  dataset: "rozvaha",
  period: march,
  lines: [
    {
      statementKind: "rozvaha_aktiva",
      ozn: "A.",
      rowCode: "001",
      rowLabel: "AKTIVA CELKEM",
      sortOrder: 1,
      brutto: "1000000.00",
      korekce: "200000.00",
      netto: "800000.00",
      minule: "750000.00",
    },
    {
      statementKind: "rozvaha_pasiva",
      rowCode: "078",
      rowLabel: "PASIVA CELKEM",
      sortOrder: 2,
      bezne: "800000.00",
      minule: "750000.00",
    },
  ],
}

const filingBody = (externalRef: string) => ({
  items: [
    {
      externalRef,
      kind: "dph_priznani",
      period: march,
      dueOn: "2026-04-25",
      amountDue: "45000.00",
      variableSymbol: "12345678",
    },
  ],
})

let acme: TestOrganization
let other: TestOrganization
/** An office-global key, acting as acme's účetní (who is also other's). */
let globalKey: { id: string; secret: string }
/** A key confined to acme. */
let scopedKey: { id: string; secret: string }

beforeAll(async () => {
  acme = await seedOrganization()
  other = await seedOrganization()

  // The same accountant is účetní of both books, so the ORG SCOPE of a key is
  // the only thing separating them in the cross-org cases below — exactly the
  // condition the confinement rule has to hold under.
  await addMembership(other.organizationId, acme.members.owner.userId, "owner")

  globalKey = await createAgentKeyRow({
    actingUserId: acme.members.owner.userId,
    label: "Kancelář",
  })
  scopedKey = await createAgentKeyRow({
    actingUserId: acme.members.owner.userId,
    organizationId: acme.organizationId,
    label: "Acme",
  })
})

afterAll(endFixtures)

// The agent limiters (`lib/auth/rate-limit.ts`) are process-wide singletons,
// and `globalKey`/`scopedKey` above are shared `beforeAll` fixtures spent by
// dozens of tests below — so without a reset, this file's own test count
// would slowly close in on `BETA_AGENT_KEY_RATE_LIMIT.max` (60) the same way
// the dedicated "rate limiting" suite deliberately drives ONE key there. A
// clean slate before every test is what makes that budget a property of the
// ONE test that means to spend it, not of how many tests happen to run
// before it.
beforeEach(resetRateLimitersForTests)

describe("authentication answers one 401 for every reason", () => {
  it("accepts a live key", async () => {
    const response = await meta(globalKey.secret)
    expect(response.status).toBe(200)
  })

  it("refuses every bad credential identically", async () => {
    const revokedOwner = await createAccount({ staff: true })
    await addMembership(acme.organizationId, revokedOwner.userId, "owner")
    const revoked = await createAgentKeyRow({
      actingUserId: revokedOwner.userId,
      revoked: true,
    })

    const disabledOwner = await createAccount({ staff: true })
    const disabledKey = await createAgentKeyRow({
      actingUserId: disabledOwner.userId,
    })
    await disableAccount(disabledOwner.userId)

    const demotedOwner = await createAccount({ staff: true })
    const demotedKey = await createAgentKeyRow({
      actingUserId: demotedOwner.userId,
    })
    await setStaff(demotedOwner.userId, false)

    const { GET } = await import("./meta/route")
    const attempts = [
      new Headers(),
      new Headers({ authorization: "Bearer" }),
      new Headers({ authorization: "Basic abc" }),
      new Headers({ authorization: `Bearer ${generateAgentKey()}` }),
      new Headers({ authorization: `Bearer ${revoked.secret}` }),
      new Headers({ authorization: `Bearer ${disabledKey.secret}` }),
      new Headers({ authorization: `Bearer ${demotedKey.secret}` }),
    ]

    const bodies = new Set<string>()
    for (const headers of attempts) {
      const response = await GET(new Request(`${ENDPOINT}/meta`, { headers }))
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe("Bearer")
      bodies.add(await response.text())
    }
    // One body, byte-identical, for all seven — no oracle for "real but
    // revoked" versus "never existed".
    expect(bodies).toEqual(new Set(['{"error":"unauthorized"}']))
  })

  it("never echoes the credential back", async () => {
    const response = await meta(globalKey.secret)
    expect(await response.text()).not.toContain(globalKey.secret)
  })
})

describe("the organization comes from the URL, bounded by the key", () => {
  it("an org-scoped key reaches its own book", async () => {
    const response = await post("filings", acme.slug, filingBody("scoped-1"), {
      secret: scopedKey.secret,
    })
    expect(response.status).toBe(200)
  })

  it("an org-scoped key cannot reach another book its accountant owns", async () => {
    const response = await post("filings", other.slug, filingBody("scoped-2"), {
      secret: scopedKey.secret,
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
  })

  it("an office-global key reaches any book its accountant is účetní of", async () => {
    const response = await post("filings", other.slug, filingBody("global-1"), {
      secret: globalKey.secret,
    })
    expect(response.status).toBe(200)
  })

  it("no key reaches a book its accountant is not účetní of", async () => {
    const stranger = await seedOrganization()
    const response = await post(
      "filings",
      stranger.slug,
      filingBody("global-2"),
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(404)
  })

  it("an unknown or archived book is the same 404", async () => {
    expect(
      (
        await post("filings", "neexistuje", filingBody("x"), {
          secret: globalKey.secret,
        })
      ).status,
    ).toBe(404)

    const archived = await seedOrganization()
    await addMembership(
      archived.organizationId,
      acme.members.owner.userId,
      "owner",
    )
    await archiveOrganization(archived.organizationId)
    expect(
      (
        await post("filings", archived.slug, filingBody("y"), {
          secret: globalKey.secret,
        })
      ).status,
    ).toBe(404)
  })

  it("only reports books the write path would actually accept", async () => {
    const response = await meta(scopedKey.secret)
    const body = (await response.json()) as {
      key: { scope: string }
      organizations: { slug: string }[]
    }
    expect(body.key.scope).toBe("organization")
    expect(body.organizations.map((org) => org.slug)).toEqual([acme.slug])
  })
})

describe("the body is validated before anything is written", () => {
  it("refuses a payload that names a tenant", async () => {
    const response = await post(
      "filings",
      acme.slug,
      { organizationId: other.organizationId, ...filingBody("inject-1") },
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "tenancy_key_in_payload",
      keys: ["organizationId"],
    })
  })

  it("refuses a tenant key nested inside an item", async () => {
    const response = await post(
      "filings",
      acme.slug,
      {
        items: [{ ...filingBody("inject-2").items[0], orgSlug: other.slug }],
      },
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(400)
  })

  it("refuses a non-JSON media type, and unparseable JSON", async () => {
    expect(
      (
        await post(
          "filings",
          acme.slug,
          {},
          {
            secret: globalKey.secret,
            contentType: "text/plain",
          },
        )
      ).status,
    ).toBe(415)

    const broken = await post("filings", acme.slug, null, {
      secret: globalKey.secret,
      rawBody: "{oops",
    })
    expect(broken.status).toBe(400)
    expect(await broken.json()).toEqual({ error: "invalid_json" })
  })

  it("reports schema issues by path and code, never by value", async () => {
    const response = await post(
      "filings",
      acme.slug,
      { items: [{ ...filingBody("bad").items[0], amountDue: "45000.999" }] },
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as {
      error: string
      issues: { path: string }[]
    }
    expect(body.error).toBe("invalid_body")
    expect(body.issues[0]?.path).toBe("items.0.amountDue")
    expect(JSON.stringify(body)).not.toContain("45000.999")
  })

  it("checks the key before the body — a stranger learns no schema", async () => {
    const response = await post(
      "filings",
      acme.slug,
      { nonsense: true },
      {
        authorization: `Bearer ${generateAgentKey()}`,
      },
    )
    expect(response.status).toBe(401)
  })
})

describe("publishing a dataset", () => {
  it("lands as a published batch the read model serves", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post("statements", org.slug, rozvahaBody, {
      secret: globalKey.secret,
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      summary: { batchId: string; rowCount: number; periodId: string }
    }
    expect(body.status).toBe("applied")
    expect(body.summary.rowCount).toBe(2)

    // Read back through `lib/data/imports.ts` — the functions the client pages
    // call — because the point of a publish is that the book's own people can
    // see it, not that a row exists somewhere.
    const { publishedBatchFor, statementLinesForBatch } =
      await import("@/lib/data/imports")
    const owner = await ownerScopeFor(globalKey.secret, org.slug)

    const batch = await publishedBatchFor(owner, {
      periodId: body.summary.periodId,
      dataset: "rozvaha",
    })
    expect(batch?.id).toBe(body.summary.batchId)
    expect(batch?.status).toBe("published")
    expect(batch?.source).toBe("agent")

    const lines = await statementLinesForBatch(owner, batch!.id)
    expect(lines).toHaveLength(2)
    expect(lines[0]?.netto).toBe("800000.00")
  })

  it("republishing supersedes rather than duplicating", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const first = (await (
      await post("statements", org.slug, rozvahaBody, {
        secret: globalKey.secret,
      })
    ).json()) as { summary: { batchId: string; periodId: string } }

    const second = (await (
      await post("statements", org.slug, rozvahaBody, {
        secret: globalKey.secret,
      })
    ).json()) as {
      summary: { batchId: string; supersededBatchId: string | null }
    }

    expect(second.summary.batchId).not.toBe(first.summary.batchId)
    expect(second.summary.supersededBatchId).toBe(first.summary.batchId)

    const { readImportBatchRow } = await import("@/tests/fixtures")
    expect((await readImportBatchRow(first.summary.batchId)).status).toBe(
      "superseded",
    )
    expect((await readImportBatchRow(second.summary.batchId)).status).toBe(
      "published",
    )
  })

  it("publishes an obratová předvaha through the same ritual", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "trialBalance",
      org.slug,
      {
        period: march,
        lines: [
          {
            accountCode: "221",
            accountName: "Bankovní účty",
            openingBalance: "100000.00",
            closingBalance: "150000.00",
          },
        ],
      },
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      summary: { batchId: string; dataset: string }
    }
    expect(body.summary.dataset).toBe("predvaha")
  })
})

/**
 * The saldokonto, which is the only dataset that is BOTH an upsert and a
 * publish (spec §3.2: "saldokonto (partner+saldo upsert)").
 *
 * The end-to-end claim is that ONE call reaches four surfaces: the partner
 * registry gains a row, the published batch feeds Pohledávky a závazky, the
 * Dodavatelé arm of Dluhy a platby lists the payable, and the uzávěrka
 * completeness matrix stops saying "zatím nenapojeno". None of those is
 * asserted through a mock — each is read back through the function the client
 * page itself calls.
 */
describe("publishing a saldokonto", () => {
  const saldoBody = (
    externalRef: string,
    overrides: {
      partner?: Record<string, unknown>
      line?: Record<string, unknown>
    } = {},
  ) => ({
    period: march,
    lines: [
      {
        partner: {
          externalRef,
          name: "Stavebniny Novak s.r.o.",
          ico: "12345678",
          partnerRole: "supplier",
          city: "Praha",
          ...(overrides.partner ?? {}),
        },
        receivableTotal: "0.00",
        payableTotal: "48250.50",
        oldestDue: "2026-04-30",
        ...(overrides.line ?? {}),
      },
    ],
  })

  it("creates the partner, publishes the batch, and feeds all three surfaces", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "saldokonto",
      org.slug,
      saldoBody("money:partner:1"),
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      summary: {
        dataset: string
        batchId: string
        periodId: string
        rowCount: number
        partners: { created: number; updated: number }
      }
    }
    expect(body.status).toBe("applied")
    expect(body.summary.dataset).toBe("saldokonto")
    expect(body.summary.rowCount).toBe(1)
    // The registry side of the act is reported apart from the batch: it is the
    // one part of a saldokonto publish that is NOT superseded next month.
    expect(body.summary.partners).toMatchObject({ created: 1, updated: 0 })

    const owner = await ownerScopeFor(globalKey.secret, org.slug)

    // 1. The registry.
    const { partnersForScope, saldokontoForScope } =
      await import("@/lib/data/partners")
    const partners = await partnersForScope(owner)
    expect(partners).toHaveLength(1)
    expect(partners[0]).toMatchObject({
      name: "Stavebniny Novak s.r.o.",
      ico: "12345678",
      role: "supplier",
      // Created BY the import, which is what `source` records.
      source: "saldokonto",
    })

    // 2. Finance › Pohledávky a závazky.
    const view = await saldokontoForScope(owner)
    expect(view.period?.id).toBe(body.summary.periodId)
    expect(view.batch?.id).toBe(body.summary.batchId)
    expect(view.batch?.source).toBe("agent")
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]).toMatchObject({
      partnerName: "Stavebniny Novak s.r.o.",
      payableTotal: "48250.50",
      oldestDue: "2026-04-30",
    })
    expect(view.totals.payable).toBe("48250.50")

    // 3. Finance › Dluhy a platby — the Dodavatelé arm, which no consumer had
    // to change to receive.
    const { obligationsForScope } = await import("@/lib/data/obligations")
    const obligations = await obligationsForScope(owner)
    expect(obligations.groups.map((g) => g.group)).toEqual(["dodavatele"])
    expect(obligations.groups[0]!.obligations[0]).toMatchObject({
      source: "partner_saldo",
      group: "dodavatele",
      label: "Stavebniny Novak s.r.o.",
      amount: "48250.50",
      dueOn: "2026-04-30",
    })
    expect(obligations.totals.total).toBe("48250.50")

    // 4. Pro účetní › Měsíční uzávěrka — the completeness matrix, which flipped
    // from "zatím nenapojeno" to a real state through the dataset registry
    // alone.
    const { datasetFreshnessForScope } = await import("@/lib/data/imports")
    const freshness = await datasetFreshnessForScope(owner)
    const saldokonto = freshness.find((row) => row.dataset === "saldokonto")!
    expect(saldokonto.implemented).toBe(true)
    expect(saldokonto.batchId).toBe(body.summary.batchId)
    expect(saldokonto.period?.month).toBe(3)
    expect(saldokonto.rowCount).toBe(1)
  })

  it("updates the partner in place and supersedes the batch on a re-run", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const first = (await (
      await post("saldokonto", org.slug, saldoBody("money:partner:2"), {
        secret: globalKey.secret,
      })
    ).json()) as { summary: { batchId: string } }

    const second = (await (
      await post(
        "saldokonto",
        org.slug,
        saldoBody("money:partner:2", {
          partner: { name: "Stavebniny Novak a.s." },
          line: { payableTotal: "31000.00", oldestDue: "2026-05-31" },
        }),
        { secret: globalKey.secret },
      )
    ).json()) as {
      summary: {
        batchId: string
        supersededBatchId: string | null
        partners: { created: number; updated: number }
      }
    }

    // The MEASUREMENT is versioned...
    expect(second.summary.supersededBatchId).toBe(first.summary.batchId)
    // ...and the IDENTITY is not: one partner, updated in place, keeping the
    // saldo history that points at it.
    expect(second.summary.partners).toMatchObject({ created: 0, updated: 1 })

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { partnersForScope, saldokontoForScope } =
      await import("@/lib/data/partners")
    const partners = await partnersForScope(owner)
    expect(partners).toHaveLength(1)
    expect(partners[0]!.name).toBe("Stavebniny Novak a.s.")

    const view = await saldokontoForScope(owner)
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]!.payableTotal).toBe("31000.00")
  })

  it("ADOPTS a partner the office typed by hand rather than duplicating it", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    // The accountant entered this supplier before the first import: no
    // `external_ref`, an office note the import must not touch, and the IČO the
    // import will find it by.
    const { createPartnerRow } = await import("@/tests/fixtures")
    const typedId = await createPartnerRow(org.organizationId, {
      name: "Stavebniny Novak",
      ico: "12345678",
      source: "manual",
      noteInternal: "Vzdy plati pozde.",
    })

    const response = await post(
      "saldokonto",
      org.slug,
      saldoBody("money:partner:3"),
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(200)

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { partnersForScope } = await import("@/lib/data/partners")
    const partners = await partnersForScope(owner)

    // ONE row, not two. A second row for the same IČO would split this
    // supplier's saldo across two lines of Pohledávky.
    expect(partners).toHaveLength(1)
    expect(partners[0]!.id).toBe(typedId)
    expect(partners[0]!.name).toBe("Stavebniny Novak s.r.o.")
    // `source` is the row's ORIGIN and is frozen: the office typed this one,
    // and adoption does not rewrite that.
    expect(partners[0]!.source).toBe("manual")
  })

  it("refuses a SECOND source id on one IČO, and writes nothing", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post("saldokonto", org.slug, saldoBody("money:partner:4a"), {
      secret: globalKey.secret,
    })

    // Two rows of the office's own system claiming one legal person.
    // Re-pointing would move the partner's whole saldo history under a new id.
    const response = await post(
      "saldokonto",
      org.slug,
      saldoBody("money:partner:4b"),
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: "identity_changed",
    })

    // The refusal rolled the WHOLE call back — no second partner, and the first
    // batch is still the published one.
    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { partnersForScope, saldokontoForScope } =
      await import("@/lib/data/partners")
    expect(await partnersForScope(owner)).toHaveLength(1)
    expect((await saldokontoForScope(owner)).rows).toHaveLength(1)
  })

  it("is idempotent under a retried Idempotency-Key", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")
    const requestId = "run-saldokonto-1"

    const first = (await (
      await post("saldokonto", org.slug, saldoBody("money:partner:5"), {
        secret: globalKey.secret,
        requestId,
      })
    ).json()) as { status: string; summary: { batchId: string } }
    const replay = (await (
      await post("saldokonto", org.slug, saldoBody("money:partner:5"), {
        secret: globalKey.secret,
        requestId,
      })
    ).json()) as { status: string; summary: { batchId: string } }

    expect(first.status).toBe("applied")
    expect(replay.status).toBe("replayed")
    expect(replay.summary.batchId).toBe(first.summary.batchId)

    // A replay wrote NOTHING: one batch, one partner, one activity_log row.
    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { partnersForScope } = await import("@/lib/data/partners")
    expect(await partnersForScope(owner)).toHaveLength(1)

    const log = await readActivityLog(org.organizationId)
    expect(
      log.filter((row) => row.action === "saldokonto.publish"),
    ).toHaveLength(1)
  })

  it("records the act as the agent, with the partner summary the office reads", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post("saldokonto", org.slug, saldoBody("money:partner:6"), {
      secret: globalKey.secret,
    })

    const [entry] = await readActivityLog(org.organizationId)
    expect(entry).toMatchObject({
      actor_kind: "agent",
      agent_key_id: globalKey.id,
      action: "saldokonto.publish",
      entity_kind: "import_batch",
    })
    expect(entry!.summary).toMatchObject({
      dataset: "saldokonto",
      rowCount: 1,
      partners: { created: 1, updated: 0 },
    })
  })

  it("refuses a payable with no splatnost — a debt with no date would vanish", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "saldokonto",
      org.slug,
      {
        period: march,
        lines: [
          {
            partner: {
              externalRef: "money:partner:7",
              name: "Bez data s.r.o.",
            },
            payableTotal: "1000.00",
          },
        ],
      },
      { secret: globalKey.secret },
    )
    // A named 400 rather than a 23514 at the bottom of a transaction: the
    // obligations union lists a payable WITH its splatnost, so a dateless one
    // would be silently dropped from Dluhy a platby.
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "invalid_body" })
  })

  it("refuses a negative total and a duplicate partner in one payload", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    // A negative receivable IS a payable; the caller meant the other column.
    expect(
      (
        await post(
          "saldokonto",
          org.slug,
          {
            period: march,
            lines: [
              {
                partner: { externalRef: "money:partner:8", name: "Zaporny" },
                receivableTotal: "-100.00",
              },
            ],
          },
          { secret: globalKey.secret },
        )
      ).status,
    ).toBe(400)

    // Two lines for one partner would double that supplier's payable if the
    // unique index were ever relaxed, so it is refused in both places.
    expect(
      (
        await post(
          "saldokonto",
          org.slug,
          {
            period: march,
            lines: [
              {
                partner: { externalRef: "money:partner:9", name: "Dvakrat" },
                receivableTotal: "100.00",
              },
              {
                partner: { externalRef: "money:partner:9", name: "Dvakrat" },
                receivableTotal: "200.00",
              },
            ],
          },
          { secret: globalKey.secret },
        )
      ).status,
    ).toBe(400)
  })

  it("cannot be reached for a book the key does not scope", async () => {
    // The same 404 a browser gets: the URL space of an office's client list is
    // not something a credential gets to enumerate.
    const response = await post(
      "saldokonto",
      other.slug,
      saldoBody("money:partner:10"),
      { secret: scopedKey.secret },
    )
    expect(response.status).toBe(404)
  })
})

describe("publishing payroll (spec 2.6, 3.2)", () => {
  const payrollBody = (employees: unknown[]) => ({
    period: march,
    summary: {
      grossTotal: "420000.00",
      employerSocial: "104160.00",
      employerHealth: "37800.00",
      // Deliberately NOT the sum of the three above: if anything in this stack
      // ever starts computing a payroll figure instead of storing it, the
      // read-back below stops matching.
      employerCostTotal: "999111.00",
      employeeWithholdingsTotal: "48720.00",
      incomeTaxAdvance: "63000.00",
      netPaidTotal: "111222.00",
      paymentDueDate: "2026-04-12",
      headcountHpp: 2,
      headcountDpc: 0,
      headcountDpp: 1,
    },
    employees,
  })

  const employee = (externalRef: string, fullName: string) => ({
    externalRef,
    fullName,
    contractType: "hpp",
    startedOn: "2024-02-01",
    gross: "60000.00",
    deductionsTotal: "6960.00",
    net: "44040.00",
    employerCost: "80280.00",
  })

  it("lands as a published batch the payroll reads serve, end to end", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "payroll",
      org.slug,
      payrollBody([
        employee("money:emp:1", "Alena Dvorakova"),
        employee("money:emp:2", "Bohumil Kral"),
      ]),
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      summary: {
        batchId: string
        periodId: string
        rowCount: number
        employeesCreated: number
        employeesUpdated: number
      }
    }
    expect(body.status).toBe("applied")
    expect(body.summary.employeesCreated).toBe(2)
    // Two lines plus the summary - `row_count` counts payload ROWS written.
    expect(body.summary.rowCount).toBe(3)

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const {
      payrollSummaryForPeriod,
      payrollLinesForPeriod,
      payrollEmployeesForScope,
    } = await import("@/lib/data/payroll")

    const summary = await payrollSummaryForPeriod(owner, body.summary.periodId)
    expect(summary).toMatchObject({
      grossTotal: "420000.00",
      employerCostTotal: "999111.00",
      netPaidTotal: "111222.00",
      paymentDueDate: "2026-04-12",
      headcountHpp: 2,
      headcountDpc: 0,
      headcountDpp: 1,
    })

    const lines = await payrollLinesForPeriod(owner, body.summary.periodId)
    expect(lines.map((line) => line.employeeName)).toEqual([
      "Alena Dvorakova",
      "Bohumil Kral",
    ])
    expect(lines[0]?.net).toBe("44040.00")

    const register = await payrollEmployeesForScope(owner)
    expect(register).toHaveLength(2)
    expect(register[0]).toMatchObject({
      contractType: "hpp",
      active: true,
      hasPortalAccount: false,
    })
  })

  it("flips the completeness matrix cell to a published payroll batch", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")
    const owner = await ownerScopeFor(globalKey.secret, org.slug)

    const { loadUzaverka } =
      await import("@/app/(portal)/[orgSlug]/pro-ucetni/uzaverka/_lib/load-uzaverka")

    const before = await loadUzaverka(owner, undefined)
    const beforeCell = before.cells.find((cell) => cell.dataset === "payroll")
    // Wired the moment `IMPORT_DATASETS` says so - the office's gap, not the
    // build's (spec 0.4: the two are different gaps and read differently).
    expect(beforeCell?.implemented).toBe(true)
    expect(beforeCell?.published).toBeNull()

    const body = (await (
      await post("payroll", org.slug, payrollBody([]), {
        secret: globalKey.secret,
      })
    ).json()) as { summary: { batchId: string; periodId: string } }

    const after = await loadUzaverka(owner, body.summary.periodId)
    const afterCell = after.cells.find((cell) => cell.dataset === "payroll")
    expect(afterCell?.published?.id).toBe(body.summary.batchId)
    expect(afterCell?.published?.source).toBe("agent")
  })

  it("updates an employee on the second run rather than duplicating them", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "payroll",
      org.slug,
      payrollBody([employee("money:emp:9", "Jan Novak")]),
      { secret: globalKey.secret },
    )

    // Same ref, new name and a contract change - the SAME person, so the
    // register is patched. Matching on the name instead would have created a
    // second Jan Novak the moment he married.
    const second = (await (
      await post(
        "payroll",
        org.slug,
        payrollBody([
          {
            ...employee("money:emp:9", "Jan Novacek"),
            contractType: "dpc",
            endedOn: "2026-03-31",
          },
        ]),
        { secret: globalKey.secret },
      )
    ).json()) as {
      summary: { employeesCreated: number; employeesUpdated: number }
    }

    expect(second.summary.employeesCreated).toBe(0)
    expect(second.summary.employeesUpdated).toBe(1)

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { payrollEmployeesForScope } = await import("@/lib/data/payroll")
    const register = await payrollEmployeesForScope(owner)
    expect(register).toHaveLength(1)
    expect(register[0]).toMatchObject({
      fullName: "Jan Novacek",
      contractType: "dpc",
      endedOn: "2026-03-31",
      // `ended_on` set and STILL active - spec 2.6.1's "never automatic".
      active: true,
    })
  })

  it("republishing supersedes the batch and leaves the register alone", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const first = (await (
      await post(
        "payroll",
        org.slug,
        payrollBody([employee("money:emp:5", "Jan Novak")]),
        { secret: globalKey.secret },
      )
    ).json()) as { summary: { batchId: string } }

    const second = (await (
      await post(
        "payroll",
        org.slug,
        payrollBody([employee("money:emp:5", "Jan Novak")]),
        { secret: globalKey.secret },
      )
    ).json()) as {
      summary: { batchId: string; supersededBatchId: string | null }
    }

    expect(second.summary.supersededBatchId).toBe(first.summary.batchId)

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { payrollEmployeesForScope } = await import("@/lib/data/payroll")
    // A person is not period-versioned: the register is upserted, not
    // superseded, so a re-publish leaves exactly one Jan Novak.
    expect(await payrollEmployeesForScope(owner)).toHaveLength(1)
  })

  it("records the act with external refs and NO employee names", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "payroll",
      org.slug,
      payrollBody([employee("money:emp:7", "Jan Novak")]),
      { secret: globalKey.secret },
    )

    const [entry] = await readActivityLog(org.organizationId)
    expect(entry).toMatchObject({
      actor_kind: "agent",
      action: "payroll.publish",
      entity_kind: "import_batch",
    })
    // The log answers WHAT the call did with the office's own ids. A payload of
    // full names would put personal data into an append-only table no surface
    // needs it in.
    const serialized = JSON.stringify(entry!.summary)
    expect(serialized).toContain("money:emp:7")
    expect(serialized).not.toContain("Jan Novak")
  })

  it("writes nothing at all when the payload is refused", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "payroll",
      org.slug,
      payrollBody([
        employee("money:emp:dup", "Jan Novak"),
        employee("money:emp:dup", "Jan Novak"),
      ]),
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(400)

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { payrollEmployeesForScope } = await import("@/lib/data/payroll")
    expect(await payrollEmployeesForScope(owner)).toEqual([])
    expect(await readActivityLog(org.organizationId)).toEqual([])
  })

  it("refuses a payload that names a tenant, like every other dataset", async () => {
    const response = await post(
      "payroll",
      acme.slug,
      { ...payrollBody([]), organizationId: other.organizationId },
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(400)
  })

  it("cannot be reached by an org-scoped key aimed at another book", async () => {
    const response = await post("payroll", other.slug, payrollBody([]), {
      secret: scopedKey.secret,
    })
    expect(response.status).toBe(404)
  })

  it("advertises itself as implemented on /meta", async () => {
    const body = (await (await meta(globalKey.secret)).json()) as {
      datasets: { path: string; implemented: boolean }[]
    }
    expect(
      body.datasets.find((dataset) => dataset.path === "publish/payroll"),
    ).toEqual({ path: "publish/payroll", implemented: true })
  })
})

describe("registry upserts are matched on externalRef", () => {
  it("creates once and updates thereafter", async () => {
    const ref = "money:filing:idem"
    const created = (await (
      await post("filings", acme.slug, filingBody(ref), {
        secret: globalKey.secret,
      })
    ).json()) as { summary: { items: { action: string; id: string }[] } }
    expect(created.summary.items[0]?.action).toBe("created")

    const updated = (await (
      await post(
        "filings",
        acme.slug,
        {
          items: [{ ...filingBody(ref).items[0], amountDue: "46000.00" }],
        },
        { secret: globalKey.secret },
      )
    ).json()) as { summary: { items: { action: string; id: string }[] } }
    expect(updated.summary.items[0]?.action).toBe("updated")
    expect(updated.summary.items[0]?.id).toBe(created.summary.items[0]?.id)
  })

  it("refuses to move a filing's identity, and writes nothing when it does", async () => {
    const ref = "money:filing:identity"
    await post("filings", acme.slug, filingBody(ref), {
      secret: globalKey.secret,
    })
    const before = (await readActivityLog(acme.organizationId)).length

    const response = await post(
      "filings",
      acme.slug,
      {
        items: [
          { ...filingBody(ref).items[0], kind: "dppo_priznani" },
          { ...filingBody("money:filing:collateral").items[0] },
        ],
      },
      { secret: globalKey.secret },
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "identity_changed" })

    // The whole call rolled back: no log row, and the second (perfectly valid)
    // item of the same call was not written either.
    expect((await readActivityLog(acme.organizationId)).length).toBe(before)
    const { filingByExternalRef } = await import("@/lib/data/filings")
    const owner = await ownerScopeFor(globalKey.secret, acme.slug)
    expect(
      await filingByExternalRef(owner, "money:filing:collateral"),
    ).toBeNull()
  })

  it("upserts liabilities", async () => {
    const item = {
      externalRef: "money:liability:1",
      label: "Penále",
      amount: "1500.00",
      dueOn: "2026-04-30",
    }
    const first = (await (
      await post(
        "liabilities",
        acme.slug,
        { items: [item] },
        {
          secret: globalKey.secret,
        },
      )
    ).json()) as { summary: { created: number } }
    expect(first.summary.created).toBe(1)

    const second = (await (
      await post(
        "liabilities",
        acme.slug,
        { items: [{ ...item, amount: "1600.00" }] },
        { secret: globalKey.secret },
      )
    ).json()) as { summary: { updated: number } }
    expect(second.summary.updated).toBe(1)
  })

  it("upserts client tasks, and never writes a template", async () => {
    const item = {
      externalRef: "money:task:1",
      title: "Doložte výpis z účtu",
      dueDate: "2026-04-15",
    }
    const created = (await (
      await post(
        "clientTasks",
        acme.slug,
        { items: [item] },
        {
          secret: globalKey.secret,
        },
      )
    ).json()) as { summary: { items: { id: string }[]; created: number } }
    expect(created.summary.created).toBe(1)

    const done = await post(
      "clientTasks",
      acme.slug,
      { items: [{ ...item, done: true }] },
      { secret: globalKey.secret },
    )
    expect(done.status).toBe(200)

    // `isTemplate` is not a field the API has — a template is a Pro účetní
    // construct, and an agent that could write one would be creating a monthly
    // obligation for every client of the office.
    const template = await post(
      "clientTasks",
      acme.slug,
      { items: [{ ...item, isTemplate: true }] },
      { secret: globalKey.secret },
    )
    expect(template.status).toBe(400)

    const owner = await ownerScopeFor(globalKey.secret, acme.slug)
    const { listTasksForOwner, listTemplatesForOwner } =
      await import("@/lib/data/client-tasks")
    const tasks = await listTasksForOwner(owner)
    expect(tasks.filter((task) => task.title === item.title)).toHaveLength(1)
    expect(await listTemplatesForOwner(owner)).toHaveLength(0)
  })

  it("upserts assets and applies a disposal once", async () => {
    const item = {
      externalRef: "money:asset:1",
      name: "Bagr",
      category: "machine",
      acquisitionCost: "800000.00",
      accumulatedDepreciation: "100000.00",
      depreciationAsOf: "2026-03-31",
    }
    const created = (await (
      await post(
        "assets",
        acme.slug,
        { items: [item] },
        {
          secret: globalKey.secret,
        },
      )
    ).json()) as { summary: { items: { id: string }[] } }
    const assetId = created.summary.items[0]!.id

    await post(
      "assets",
      acme.slug,
      {
        items: [{ ...item, status: "disposed", disposedOn: "2026-05-31" }],
      },
      { secret: globalKey.secret },
    )

    const { assetForScope } = await import("@/lib/data/assets")
    const owner = await ownerScopeFor(globalKey.secret, acme.slug)
    const asset = await assetForScope(owner, assetId)
    expect(asset?.status).toBe("disposed")
    expect(asset?.disposedOn).toBe("2026-05-31")
  })
})

/**
 * The account map arm (spec §3.2's `account_balance_map`, PR 27).
 *
 * ITS UPSERT KEY IS `accountCode`, NOT AN `externalRef`, which is why it gets
 * its own block rather than a row in the one above: the account code IS the
 * row's identity (migration 0014 makes it unique per book), so there is no
 * `external_ref` column here for a second key to disagree with.
 */
describe("the account map is upserted on the account code", () => {
  const mapBody = (
    items: Record<string, unknown>[],
  ): { items: Record<string, unknown>[] } => ({ items })

  /**
   * ITS OWN KEY, NOT `globalKey`.
   *
   * The limiters are process-wide and per KEY
   * (`BETA_AGENT_KEY_RATE_LIMIT.max`), so every block that spends `globalKey`'s
   * minute takes budget away from every block after it — and the failure lands
   * on whichever assertion happens to be last, as a 429 where a 400 was
   * expected. A block with its own credential cannot starve a sibling, which is
   * the same reasoning the rate-limiting block at the bottom of this file
   * already applies to itself.
   */
  let mapKey: { id: string; secret: string }

  beforeAll(async () => {
    mapKey = await createAgentKeyRow({
      actingUserId: acme.members.owner.userId,
      label: "Účty a hotovost",
    })
  })

  it("creates once and updates thereafter, feeding Účty a hotovost", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const created = (await (
      await post(
        "accountBalanceMap",
        org.slug,
        mapBody([
          { accountCode: "221", label: "Bankovní účty", kind: "bank" },
          { accountCode: "211", label: "Pokladna", kind: "cash" },
        ]),
        { secret: mapKey.secret },
      )
    ).json()) as {
      status: string
      summary: { created: number; items: { accountCode: string }[] }
    }
    expect(created.status).toBe("applied")
    expect(created.summary.created).toBe(2)

    const relabelled = (await (
      await post(
        "accountBalanceMap",
        org.slug,
        mapBody([
          {
            accountCode: "221",
            label: "Fio běžný účet",
            kind: "bank",
            matchKind: "prefix",
            sortOrder: 2,
          },
        ]),
        { secret: mapKey.secret },
      )
    ).json()) as { summary: { updated: number } }
    expect(relabelled.summary.updated).toBe(1)

    // Read back through the function the client page calls.
    const { accountMappingsForScope } =
      await import("@/lib/data/account-balances")
    const owner = await ownerScopeFor(mapKey.secret, org.slug)
    const rows = await accountMappingsForScope(owner)
    expect(rows.map((row) => row.accountCode)).toEqual(["211", "221"])
    expect(rows.find((row) => row.accountCode === "221")).toMatchObject({
      label: "Fio běžný účet",
      matchKind: "prefix",
      sortOrder: 2,
    })
  })

  it("retires an entry rather than deleting it", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "accountBalanceMap",
      org.slug,
      mapBody([{ accountCode: "221", label: "Banka", kind: "bank" }]),
      { secret: mapKey.secret },
    )
    await post(
      "accountBalanceMap",
      org.slug,
      mapBody([
        { accountCode: "221", label: "Banka", kind: "bank", active: false },
      ]),
      { secret: mapKey.secret },
    )

    const { accountMappingsForScope } =
      await import("@/lib/data/account-balances")
    const owner = await ownerScopeFor(mapKey.secret, org.slug)
    expect(await accountMappingsForScope(owner)).toHaveLength(0)
    expect(
      await accountMappingsForScope(owner, { includeInactive: true }),
    ).toHaveLength(1)
  })

  it("refuses an overlap and writes nothing at all", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "accountBalanceMap",
      org.slug,
      mapBody([{ accountCode: "221.01", label: "Fio", kind: "bank" }]),
      { secret: mapKey.secret },
    )
    const before = (await readActivityLog(org.organizationId)).length

    const response = await post(
      "accountBalanceMap",
      org.slug,
      mapBody([
        {
          accountCode: "221",
          matchKind: "prefix",
          label: "Vše",
          kind: "bank",
        },
        { accountCode: "211", label: "Pokladna", kind: "cash" },
      ]),
      { secret: mapKey.secret },
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "conflict" })

    // Rolled back whole: no log row, and the second (perfectly valid) item of
    // the same call was not written either.
    expect((await readActivityLog(org.organizationId)).length).toBe(before)
    const { accountMappingsForScope } =
      await import("@/lib/data/account-balances")
    const owner = await ownerScopeFor(mapKey.secret, org.slug)
    expect(
      (await accountMappingsForScope(owner)).map((row) => row.accountCode),
    ).toEqual(["221.01"])
  })

  it("refuses a payload the schema does not accept", async () => {
    for (const item of [
      // No `externalRef` on this endpoint — the account code is the key.
      { accountCode: "221", label: "Banka", kind: "bank", externalRef: "x" },
      { accountCode: " 221 ", label: "Banka", kind: "bank" },
      { accountCode: "221", label: "   ", kind: "bank" },
      { accountCode: "221", label: "Banka", kind: "crypto" },
      { accountCode: "221", label: "Banka", kind: "bank", matchKind: "regex" },
      { accountCode: "2".repeat(21), label: "Banka", kind: "bank" },
      { accountCode: "221", label: "Banka", kind: "bank", sortOrder: 1000 },
      { label: "Banka", kind: "bank" },
    ]) {
      const response = await post(
        "accountBalanceMap",
        acme.slug,
        mapBody([item]),
        {
          secret: mapKey.secret,
        },
      )
      expect(response.status, JSON.stringify(item)).toBe(400)
    }
  })

  it("records the write as an agent act", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "accountBalanceMap",
      org.slug,
      mapBody([{ accountCode: "221", label: "Banka", kind: "bank" }]),
      { secret: mapKey.secret },
    )

    const rows = await readActivityLog(org.organizationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: "account_map.upsert",
      entity_kind: "account_balance_map",
      actor_kind: "agent",
      agent_key_id: mapKey.id,
    })
    expect(rows[0]?.summary["created"]).toBe(1)
  })

  it("is confined by the key's own scope, like every other arm", async () => {
    const response = await post(
      "accountBalanceMap",
      other.slug,
      mapBody([{ accountCode: "221", label: "Banka", kind: "bank" }]),
      { secret: scopedKey.secret },
    )
    expect(response.status).toBe(404)
  })

  it("is advertised as implemented by the handshake", async () => {
    const body = (await (await meta(mapKey.secret)).json()) as {
      datasets: { path: string; implemented: boolean }[]
    }
    expect(
      body.datasets.find((dataset) => dataset.path === "account-balance-map"),
    ).toEqual({ path: "account-balance-map", implemented: true })
  })
})

describe("indicators are upserted on (kind, asOf)", () => {
  const indicatorBody = (
    items: Record<string, unknown>[],
  ): { items: Record<string, unknown>[] } => ({ items })

  /** Its own key, for the rate-limit reason the account-map block gives. */
  let indicatorKey: { id: string; secret: string }

  beforeAll(async () => {
    indicatorKey = await createAgentKeyRow({
      actingUserId: acme.members.owner.userId,
      label: "Ukazatele",
    })
  })

  it("states a reading and corrects it on a re-send, feeding Obrat watch", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const created = (await (
      await post(
        "indicators",
        org.slug,
        indicatorBody([
          {
            kind: "annual_turnover",
            amount: "1850000.00",
            asOf: "2026-06-30",
            noteInternal: "první odhad",
          },
        ]),
        { secret: indicatorKey.secret },
      )
    ).json()) as { status: string; summary: { created: number } }
    expect(created.status).toBe("applied")
    expect(created.summary.created).toBe(1)

    const corrected = (await (
      await post(
        "indicators",
        org.slug,
        indicatorBody([
          { kind: "annual_turnover", amount: "2100000.00", asOf: "2026-06-30" },
        ]),
        { secret: indicatorKey.secret },
      )
    ).json()) as { summary: { created: number; updated: number } }
    expect(corrected.summary).toMatchObject({ created: 0, updated: 1 })

    // Read back through the function the client's Přehled calls.
    const { latestIndicator, indicatorsForOwner } =
      await import("@/lib/data/indicators")
    const owner = await ownerScopeFor(indicatorKey.secret, org.slug)
    expect(await latestIndicator(owner, "annual_turnover")).toMatchObject({
      amount: "2100000.00",
      asOf: "2026-06-30",
    })
    // ONE row, corrected — never two contradictory obraty for one date.
    expect(await indicatorsForOwner(owner)).toHaveLength(1)
  })

  it("keeps a different as-of date as a separate reading", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "indicators",
      org.slug,
      indicatorBody([
        { kind: "annual_turnover", amount: "1000000.00", asOf: "2026-05-31" },
        { kind: "annual_turnover", amount: "1400000.00", asOf: "2026-06-30" },
      ]),
      { secret: indicatorKey.secret },
    )

    const { latestIndicator, indicatorsForOwner } =
      await import("@/lib/data/indicators")
    const owner = await ownerScopeFor(indicatorKey.secret, org.slug)
    expect(await indicatorsForOwner(owner)).toHaveLength(2)
    expect(await latestIndicator(owner, "annual_turnover")).toMatchObject({
      amount: "1400000.00",
    })
  })

  it("refuses a payload the schema does not accept, and writes nothing", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    for (const item of [
      { kind: "ebitda", amount: "1.00", asOf: "2026-06-30" },
      { kind: "annual_turnover", amount: "-1.00", asOf: "2026-06-30" },
      { kind: "annual_turnover", amount: "1.00" },
      { kind: "annual_turnover", amount: 1, asOf: "2026-06-30" },
      {
        kind: "annual_turnover",
        amount: "1.00",
        asOf: "2026-06-30",
        externalRef: "money:kpi:1",
      },
    ]) {
      const response = await post(
        "indicators",
        org.slug,
        indicatorBody([item]),
        { secret: indicatorKey.secret },
      )
      expect(response.status, JSON.stringify(item)).toBe(400)
    }

    const { indicatorsForOwner } = await import("@/lib/data/indicators")
    const owner = await ownerScopeFor(indicatorKey.secret, org.slug)
    expect(await indicatorsForOwner(owner)).toEqual([])
  })

  it("refuses an impossible calendar day as a 400, never a 500", async () => {
    // `2026-02-30` matches `YYYY-MM-DD` but is not a day. Before the shared
    // `isoDate` reader validated the calendar, Postgres answered 22008 at the
    // bottom of the transaction — not an `IngestRefused`, not a unique
    // violation, so `ingest` rethrew it and the caller received a 500 for a
    // payload this API is supposed to name.
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "indicators",
      org.slug,
      indicatorBody([
        { kind: "annual_turnover", amount: "1850000.00", asOf: "2026-02-30" },
      ]),
      { secret: indicatorKey.secret },
    )
    expect(response.status).toBe(400)
    // Named by PATH, never by value — the same rule every other refusal follows.
    const body = JSON.stringify(await response.json())
    expect(body).toContain("asOf")
    expect(body).not.toContain("2026-02-30")

    const { indicatorsForOwner } = await import("@/lib/data/indicators")
    const owner = await ownerScopeFor(indicatorKey.secret, org.slug)
    expect(await indicatorsForOwner(owner)).toEqual([])
  })

  it("refuses one (kind, asOf) stated twice, rather than last-wins", async () => {
    // The unique index makes a repeat an upsert, so without the schema guard the
    // second item would silently overwrite the first and the summary would
    // report `created: 1, updated: 1` for two readings the caller believed it
    // had sent.
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    const response = await post(
      "indicators",
      org.slug,
      indicatorBody([
        { kind: "annual_turnover", amount: "1000000.00", asOf: "2026-06-30" },
        { kind: "annual_turnover", amount: "2000000.00", asOf: "2026-06-30" },
      ]),
      { secret: indicatorKey.secret },
    )
    expect(response.status).toBe(400)

    const { indicatorsForOwner } = await import("@/lib/data/indicators")
    const owner = await ownerScopeFor(indicatorKey.secret, org.slug)
    expect(await indicatorsForOwner(owner)).toEqual([])
  })

  it("refuses a payload that names a tenant, like every other dataset", async () => {
    const response = await post(
      "indicators",
      acme.slug,
      {
        organizationId: acme.organizationId,
        items: [
          { kind: "annual_turnover", amount: "1.00", asOf: "2026-06-30" },
        ],
      },
      { secret: indicatorKey.secret },
    )
    expect(response.status).toBe(400)
  })

  it("records the write as an agent act", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post(
      "indicators",
      org.slug,
      indicatorBody([
        { kind: "annual_turnover", amount: "900000.00", asOf: "2026-03-31" },
      ]),
      { secret: indicatorKey.secret },
    )

    const rows = await readActivityLog(org.organizationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: "indicator.upsert",
      entity_kind: "organization_indicator",
      actor_kind: "agent",
      agent_key_id: indicatorKey.id,
    })
    expect(rows[0]?.summary["created"]).toBe(1)
  })

  it("is confined by the key's own scope, like every other arm", async () => {
    const response = await post(
      "indicators",
      other.slug,
      indicatorBody([
        { kind: "annual_turnover", amount: "1.00", asOf: "2026-06-30" },
      ]),
      { secret: scopedKey.secret },
    )
    expect(response.status).toBe(404)
  })

  it("is advertised as implemented by the handshake", async () => {
    const body = (await (await meta(indicatorKey.secret)).json()) as {
      datasets: { path: string; implemented: boolean }[]
    }
    expect(
      body.datasets.find((dataset) => dataset.path === "indicators"),
    ).toEqual({ path: "indicators", implemented: true })
  })
})

describe("the activity log", () => {
  it("records every agent write as an agent act", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")

    await post("statements", org.slug, rozvahaBody, {
      secret: globalKey.secret,
    })
    await post("filings", org.slug, filingBody("log-1"), {
      secret: globalKey.secret,
    })

    const rows = await readActivityLog(org.organizationId)
    expect(rows.map((row) => row.action)).toEqual([
      "statements.publish",
      "filing.upsert",
    ])
    for (const row of rows) {
      expect(row.actor_kind).toBe("agent")
      expect(row.agent_key_id).toBe(globalKey.id)
      // The key's accountant, so "who is answerable" is answered too.
      expect(row.actor_user_id).toBe(acme.members.owner.userId)
      expect(row.entity_id).not.toBeNull()
    }
    expect(rows[0]?.entity_kind).toBe("import_batch")
    expect(rows[1]?.entity_kind).toBe("filing")
    expect(rows[1]?.summary["created"]).toBe(1)
  })

  it("carries no credential in the summary", async () => {
    const rows = await readActivityLog(acme.organizationId)
    expect(JSON.stringify(rows)).not.toContain(globalKey.secret)
    expect(JSON.stringify(rows)).not.toContain(scopedKey.secret)
  })

  it("replays a retried call instead of applying it twice", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")
    const requestId = "run-2026-03-rozvaha"

    const first = (await (
      await post("statements", org.slug, rozvahaBody, {
        secret: globalKey.secret,
        requestId,
      })
    ).json()) as { status: string; summary: { batchId: string } }
    expect(first.status).toBe("applied")

    const retry = await post("statements", org.slug, rozvahaBody, {
      secret: globalKey.secret,
      requestId,
    })
    const replayed = (await retry.json()) as {
      status: string
      summary: { batchId: string }
    }
    expect(retry.status).toBe(200)
    expect(replayed.status).toBe("replayed")
    expect(replayed.summary.batchId).toBe(first.summary.batchId)

    // One act, one log row, one batch — the retry wrote nothing at all.
    const rows = await readActivityLog(org.organizationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.request_id).toBe(requestId)
  })

  /**
   * A REPLAY IS ONLY A REPLAY IF IT IS THE SAME ACT.
   *
   * The unique index is on (agent_key_id, request_id) and spans every endpoint
   * and every book, so an agent that mints ONE id per run — the natural shape
   * for a month-end script, and therefore what PR 25 will do — spends it on the
   * first call and then sends it to the next. Matching only on the id would
   * answer that with the FIRST act's summary and a 200, reporting success for a
   * write that never happened. Both directions are asserted, and each also
   * asserts that nothing was written.
   */
  it("refuses a request id reused on a different endpoint", async () => {
    const org = await seedOrganization()
    await addMembership(org.organizationId, acme.members.owner.userId, "owner")
    const requestId = "run-42"

    const first = await post("statements", org.slug, rozvahaBody, {
      secret: globalKey.secret,
      requestId,
    })
    expect(first.status).toBe(200)

    const reused = await post(
      "filings",
      org.slug,
      filingBody("reuse-endpoint"),
      { secret: globalKey.secret, requestId },
    )
    expect(reused.status).toBe(409)
    expect(await reused.json()).toEqual({ error: "idempotency_key_reused" })

    // Refused, not replayed and not applied: still one act, and the filing the
    // second call carried does not exist.
    const rows = await readActivityLog(org.organizationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.action).toBe("statements.publish")

    const owner = await ownerScopeFor(globalKey.secret, org.slug)
    const { filingByExternalRef } = await import("@/lib/data/filings")
    expect(await filingByExternalRef(owner, "reuse-endpoint")).toBeNull()
  })

  it("refuses a request id reused against a different organization", async () => {
    const first = await seedOrganization()
    const second = await seedOrganization()
    for (const org of [first, second]) {
      await addMembership(
        org.organizationId,
        acme.members.owner.userId,
        "owner",
      )
    }
    const requestId = "run-43"

    expect(
      (
        await post("filings", first.slug, filingBody("reuse-org-1"), {
          secret: globalKey.secret,
          requestId,
        })
      ).status,
    ).toBe(200)

    const reused = await post(
      "filings",
      second.slug,
      filingBody("reuse-org-2"),
      { secret: globalKey.secret, requestId },
    )
    expect(reused.status).toBe(409)
    expect(await reused.json()).toEqual({ error: "idempotency_key_reused" })

    // The second book saw nothing at all — no log row, no filing.
    expect(await readActivityLog(second.organizationId)).toHaveLength(0)
    const owner = await ownerScopeFor(globalKey.secret, second.slug)
    const { filingByExternalRef } = await import("@/lib/data/filings")
    expect(await filingByExternalRef(owner, "reuse-org-2")).toBeNull()
  })

  /**
   * A header that is present and does not parse must never be treated as absent:
   * the call would run UNPROTECTED and its 200 would be indistinguishable from a
   * protected one, so the good-faith retry that followed would publish twice.
   */
  it("refuses a malformed Idempotency-Key rather than ignoring it", async () => {
    for (const header of ["run 42", "run/42", "  ", "x".repeat(201)]) {
      const response = await post(
        "filings",
        acme.slug,
        filingBody(`malformed-${header.length}`),
        { secret: globalKey.secret, requestId: header },
      )
      expect(response.status, header).toBe(400)
      expect(await response.json()).toEqual({
        error: "invalid_idempotency_key",
      })
    }

    // Refused before the write: none of those filings exist.
    const owner = await ownerScopeFor(globalKey.secret, acme.slug)
    const { filingByExternalRef } = await import("@/lib/data/filings")
    expect(await filingByExternalRef(owner, "malformed-6")).toBeNull()
  })
})

/**
 * Position in the file no longer matters: the top-level `beforeEach` above
 * resets both process-wide limiters before every test, so this suite starts
 * from the same clean slate wherever it runs and cannot spend a budget any
 * other test still needs.
 */
describe("rate limiting", () => {
  it("caps a single key and says when to come back", async () => {
    const owner = await createAccount({ staff: true })
    await addMembership(acme.organizationId, owner.userId, "owner")
    const key = await createAgentKeyRow({ actingUserId: owner.userId })

    const { BETA_AGENT_KEY_RATE_LIMIT } = await import("@/lib/auth/policy")

    let last = await meta(key.secret)
    for (let i = 0; i < BETA_AGENT_KEY_RATE_LIMIT.max; i += 1) {
      last = await meta(key.secret)
    }

    expect(last.status).toBe(429)
    expect(await last.json()).toEqual({ error: "rate_limited" })
    expect(Number(last.headers.get("retry-after"))).toBeGreaterThan(0)
  })
})
