/**
 * Zadávání dat's six Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT. It has a generated name, it is
 * reachable without ever rendering the page that holds its form, and it does
 * NOT run `pro-ucetni/layout.tsx`'s owner gate. So the matrix below is not a
 * repeat of `lib/data/liabilities.test.ts`'s — that one proves the DATA layer
 * refuses a non-owner handle; this one proves the ACTIONS never obtain one, for
 * every role, on every action, with a real `FormData` and a real session.
 *
 * The cross-org case is the other half: an owner of organization A POSTing
 * organization B's slug must get B's answer (404), not A's authority.
 *
 * `revalidatePath` is mocked away — it is Next's request-scoped cache API and
 * throws outside a render; nothing about it is under test here.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createLiabilityRow,
  createFilingRow,
  createMonthPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const actions = await import("./zadavani")
const { requireScope } = await import("@/lib/data/scope")
const { liabilitiesForScope } = await import("@/lib/data/liabilities")
const { filingsForScope } = await import("@/lib/data/filings")

const IDLE = { status: "idle" } as const
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

async function expect404(
  run: () => Promise<unknown>,
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

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

/**
 * Every action, with a payload that WOULD succeed for an owner — so a refusal
 * below is provably about the caller and never about the fields.
 */
function everyAction(context: {
  orgSlug: string
  filingId: string
  liabilityId: string
}) {
  const { orgSlug, filingId, liabilityId } = context
  return [
    [
      "createFiling",
      actions.createFilingAction,
      fd({
        orgSlug,
        kind: "ostatni",
        periodKind: "year",
        year: "2027",
        dueOn: "2027-03-31",
        status: "planned",
        amountDue: "100.00",
      }),
    ],
    [
      "saveFiling",
      actions.saveFilingAction,
      fd({ orgSlug, filingId, dueOn: "2026-04-30", status: "planned" }),
    ],
    [
      "setFilingPaid",
      actions.setFilingPaidAction,
      fd({ orgSlug, filingId, paid: "true" }),
    ],
    ["deleteFiling", actions.deleteFilingAction, fd({ orgSlug, filingId })],
    [
      "createLiability",
      actions.createLiabilityAction,
      fd({
        orgSlug,
        group: "ostatni",
        label: "Nema tam co delat",
        amount: "1.00",
        dueOn: "2027-01-31",
      }),
    ],
    [
      "saveLiability",
      actions.saveLiabilityAction,
      fd({
        orgSlug,
        liabilityId,
        group: "ostatni",
        label: "Zmena",
        amount: "2.00",
        dueOn: "2027-02-28",
      }),
    ],
    [
      "setLiabilityPaid",
      actions.setLiabilityPaidAction,
      fd({ orgSlug, liabilityId, paid: "true" }),
    ],
    [
      "deleteLiability",
      actions.deleteLiabilityAction,
      fd({ orgSlug, liabilityId }),
    ],
  ] as const
}

describe("the authz matrix — every action, every role", () => {
  it("404s admin, member and guest on all eight actions", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const filingId = await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
    })
    const liabilityId = await createLiabilityRow(target.organizationId)

    for (const role of ["admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      for (const [name, action, payload] of everyAction({
        orgSlug: target.slug,
        filingId,
        liabilityId,
      })) {
        await expect404(() => action(IDLE, payload), `${role} may not ${name}`)
      }
    }

    // Nothing above changed a single row.
    as(target.members.owner.headers)
    const scope = await requireScope(target.slug)
    expect(await filingsForScope(scope)).toHaveLength(1)
    const [liability] = await liabilitiesForScope(scope, { includePaid: true })
    expect(liability).toMatchObject({ paidAt: null })
  })

  it("404s a signed-out visitor", async () => {
    as(new Headers())
    await expect404(
      () =>
        actions.createLiabilityAction(
          IDLE,
          fd({
            orgSlug: org.slug,
            group: "ostatni",
            label: "Anonym",
            amount: "1.00",
            dueOn: "2027-01-31",
          }),
        ),
      "no session, no write",
    )
  })

  it("404s an owner of ANOTHER organization — the slug is not authority", async () => {
    const foreign = await seedOrganization()
    const periodId = await createMonthPeriod(foreign.organizationId)
    const filingId = await createFilingRow(foreign.organizationId, periodId, {
      amountDue: "5000.00",
    })
    const liabilityId = await createLiabilityRow(foreign.organizationId)

    // A genuine owner — of a different book. `orgSlug` is a hidden form field,
    // which is request input like any other: the scope is resolved FROM it, so
    // naming someone else's slug resolves no membership and answers 404.
    as(org.members.owner.headers)
    for (const [name, action, payload] of everyAction({
      orgSlug: foreign.slug,
      filingId,
      liabilityId,
    })) {
      await expect404(
        () => action(IDLE, payload),
        `an outside owner may not ${name}`,
      )
    }

    as(foreign.members.owner.headers)
    const scope = await requireScope(foreign.slug)
    expect(await filingsForScope(scope)).toHaveLength(1)
    expect(await liabilitiesForScope(scope)).toHaveLength(1)
  })

  it("404s a malformed or unknown slug rather than raising", async () => {
    as(org.members.owner.headers)
    for (const slug of ["", "NOT A SLUG", "../admin", "neexistuje"]) {
      await expect404(
        () =>
          actions.createLiabilityAction(
            IDLE,
            fd({
              orgSlug: slug,
              group: "ostatni",
              label: "X",
              amount: "1.00",
              dueOn: "2027-01-31",
            }),
          ),
        `slug ${JSON.stringify(slug)}`,
      )
    }
  })
})

describe("liability writes — the owner's happy path and its refusals", () => {
  it("creates, edits, marks paid and deletes", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      group: "fu",
      label: "Penale z prodleni",
      amount: "1 500,50".replace(" ", ""),
      dueOn: "2026-04-30",
      variableSymbol: "87654321",
    }

    expect(await actions.createLiabilityAction(IDLE, fd(base))).toEqual({
      status: "ok",
      message: "zadavani.okCreated",
    })

    const scope = await requireScope(target.slug)
    const [created] = await liabilitiesForScope(scope)
    expect(created).toMatchObject({
      group: "fu",
      label: "Penale z prodleni",
      // The Czech decimal comma survived as a dot, digit for digit.
      amount: "1500.50",
      variableSymbol: "87654321",
    })

    expect(
      await actions.saveLiabilityAction(
        IDLE,
        fd({ ...base, liabilityId: created!.id, amount: "1600.00" }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okSaved" })
    expect((await liabilitiesForScope(scope))[0]!.amount).toBe("1600.00")

    expect(
      await actions.setLiabilityPaidAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          liabilityId: created!.id,
          paid: "true",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okMarkedPaid" })
    expect(await liabilitiesForScope(scope)).toEqual([])

    expect(
      await actions.setLiabilityPaidAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          liabilityId: created!.id,
          paid: "false",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okMarkedUnpaid" })
    expect(await liabilitiesForScope(scope)).toHaveLength(1)

    expect(
      await actions.deleteLiabilityAction(
        IDLE,
        fd({ orgSlug: target.slug, liabilityId: created!.id }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okDeleted" })
    expect(await liabilitiesForScope(scope, { includePaid: true })).toEqual([])
  })

  it("refuses a bad amount, a blank titul and a bad VS with their own messages", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      group: "ostatni",
      label: "Najem",
      amount: "1000.00",
      dueOn: "2026-05-31",
    }

    expect(
      await actions.createLiabilityAction(IDLE, fd({ ...base, amount: "abc" })),
    ).toEqual({ status: "error", error: "zadavani.errorAmountInvalid" })
    expect(
      await actions.createLiabilityAction(
        IDLE,
        fd({ ...base, amount: "-1.00" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorAmountInvalid" })
    expect(
      await actions.createLiabilityAction(IDLE, fd({ ...base, amount: "" })),
    ).toEqual({ status: "error", error: "zadavani.errorAmountInvalid" })
    expect(
      await actions.createLiabilityAction(IDLE, fd({ ...base, label: "   " })),
    ).toEqual({ status: "error", error: "zadavani.errorLabelRequired" })
    expect(
      await actions.createLiabilityAction(
        IDLE,
        fd({ ...base, variableSymbol: "12345678901" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorVariableSymbolInvalid" })

    expect(await liabilitiesForScope(await requireScope(target.slug))).toEqual(
      [],
    )
  })

  it("refuses `dodavatele` before it ever reaches the database", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    // Not on `MANUAL_OBLIGATION_GROUPS`, so the reader returns null and the
    // action refuses — the option is never offered, and a hand-built POST that
    // supplies it anyway gets an ordinary "neplatný vstup" rather than a 500
    // carrying `liability_group_is_residue`.
    expect(
      await actions.createLiabilityAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          group: "dodavatele",
          label: "Faktura od dodavatele",
          amount: "5000.00",
          dueOn: "2026-08-31",
        }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorInvalidInput" })
    expect(await liabilitiesForScope(await requireScope(target.slug))).toEqual(
      [],
    )
  })

  it("reports a miss on an id from another book, without touching it", async () => {
    const foreign = await seedOrganization()
    const foreignId = await createLiabilityRow(foreign.organizationId, {
      label: "Cizi",
    })

    as(org.members.owner.headers)
    expect(
      await actions.setLiabilityPaidAction(
        IDLE,
        fd({ orgSlug: org.slug, liabilityId: foreignId, paid: "true" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorNotFound" })

    as(foreign.members.owner.headers)
    expect(
      await liabilitiesForScope(await requireScope(foreign.slug)),
    ).toHaveLength(1)
  })
})

describe("filing writes — the period upsert and the coherence rules", () => {
  it("creates the reporting period the filing names, and reuses it", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      kind: "dph_priznani",
      periodKind: "month",
      year: "2026",
      month: "3",
      status: "planned",
    }

    expect(
      await actions.createFilingAction(
        IDLE,
        fd({ ...base, dueOn: "2026-04-27", amountDue: "31200,00" }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })
    expect(
      await actions.createFilingAction(
        IDLE,
        fd({
          ...base,
          kind: "dph_kontrolni_hlaseni",
          dueOn: "2026-04-25",
          amountDue: "",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })

    const filings = await filingsForScope(await requireScope(target.slug))
    expect(filings).toHaveLength(2)
    // One period row for both — `ensureReportingPeriod` is an idempotent upsert.
    expect(new Set(filings.map((f) => f.period.id)).size).toBe(1)
    expect(filings.map((f) => f.amountDue).sort()).toEqual([
      "31200.00",
      null,
    ] as unknown as (string | null)[])
  })

  it("refuses a period whose coordinate is missing or out of range", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      kind: "ostatni",
      dueOn: "2026-04-27",
      status: "planned",
    }

    expect(
      await actions.createFilingAction(
        IDLE,
        fd({ ...base, periodKind: "month", year: "2026", month: "" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorPeriodInvalid" })
    expect(
      await actions.createFilingAction(
        IDLE,
        fd({ ...base, periodKind: "quarter", year: "2026", quarter: "5" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorPeriodInvalid" })
    expect(
      await actions.createFilingAction(
        IDLE,
        fd({ ...base, periodKind: "month", year: "1899", month: "3" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorInvalidInput" })

    expect(await filingsForScope(await requireScope(target.slug))).toEqual([])
  })

  it("keeps a nadměrný odpočet enterable — the amount is sign-carrying", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(
      await actions.createFilingAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          kind: "dph_priznani",
          periodKind: "month",
          year: "2026",
          month: "4",
          dueOn: "2026-05-25",
          status: "planned",
          amountDue: "-8400.00",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })

    const [filing] = await filingsForScope(await requireScope(target.slug))
    expect(filing!.amountDue).toBe("-8400.00")
    // A refund is not a debt, so it never reaches Dluhy a platby — the read
    // model's `amount_due > 0` predicate, asserted from the write side.
    expect(filing!.paidAt).toBeNull()
  })

  it("drops a filed date that contradicts a `planned` status", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    // `filing_filed_coherence` makes `planned` ⟺ no filed_on a DB rule; the
    // action honours the status the office chose rather than bouncing the form.
    expect(
      await actions.createFilingAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          kind: "ostatni",
          periodKind: "year",
          year: "2026",
          dueOn: "2027-03-31",
          status: "planned",
          filedOn: "2027-03-01",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })

    const [filing] = await filingsForScope(await requireScope(target.slug))
    expect(filing!.status).toBe("planned")
    expect(filing!.filedOn).toBeNull()
  })

  it("turns a DB CHECK refusal into a Czech message, not a 500", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    // No amount stated, so `filing_paid_requires_amount` refuses the payment.
    const filingId = await createFilingRow(target.organizationId, periodId, {
      amountDue: null,
    })

    as(target.members.owner.headers)
    expect(
      await actions.setFilingPaidAction(
        IDLE,
        fd({ orgSlug: target.slug, filingId, paid: "true" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorRejected" })
  })

  it("refuses a paid flag that is neither literal — absence is not `false`", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const filingId = await createFilingRow(target.organizationId, periodId, {
      amountDue: "100.00",
      paidAt: new Date(),
    })

    as(target.members.owner.headers)
    for (const paid of ["", "on", "yes", "0"]) {
      expect(
        await actions.setFilingPaidAction(
          IDLE,
          fd({ orgSlug: target.slug, filingId, paid }),
        ),
        paid || "<empty>",
      ).toEqual({ status: "error", error: "zadavani.errorInvalidInput" })
    }

    // Still paid: a misread flag never silently reopened the debt.
    const [filing] = await filingsForScope(await requireScope(target.slug))
    expect(filing!.paidAt).not.toBeNull()
  })
})
