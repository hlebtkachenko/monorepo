/**
 * Ukazatele's two Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT. It has a generated name, it is reachable
 * without ever rendering the page that holds its form, and it does NOT run
 * `pro-ucetni/layout.tsx`'s owner gate — so the matrix below is not a repeat of
 * `lib/data/indicators.test.ts`'s. That one proves the DATA layer refuses a
 * non-owner handle; this one proves these actions never obtain one, for every
 * role, on both actions, with a real `FormData` and a real session.
 *
 * THE ROUND TRIP IS ASSERTED, NOT DESCRIBED. The last block states a figure
 * through the form and reads it back through `latestIndicator` — the exact call
 * `load-prehled.ts` makes for the client's Obrat watch — so "typing it here
 * lights up the card there" is a test rather than a claim.
 *
 * `revalidatePath` is mocked away: it is Next's request-scoped cache API and
 * throws outside a render.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createIndicatorRow,
  endFixtures,
  readActivityLog,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const actions = await import("./ukazatele")
const { indicatorsForOwner, latestIndicator } =
  await import("@/lib/data/indicators")
const { requireScope, requireOwner } = await import("@/lib/data/scope")

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

/** Both actions, with a payload that WOULD succeed for an owner. */
function everyAction(context: { orgSlug: string; indicatorId: string }) {
  const { orgSlug, indicatorId } = context
  return [
    [
      "saveIndicator",
      actions.saveIndicatorAction,
      fd({
        orgSlug,
        kind: "annual_turnover",
        amount: "1234567.89",
        asOf: "2026-06-30",
      }),
    ],
    [
      "deleteIndicator",
      actions.deleteIndicatorAction,
      fd({ orgSlug, indicatorId }),
    ],
  ] as const
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(endFixtures)

describe("the authz matrix — every action, every role", () => {
  it("404s admin, member and guest on both actions", async () => {
    const target = await seedOrganization()
    const indicatorId = await createIndicatorRow(target.organizationId)

    for (const role of ["admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      for (const [name, action, payload] of everyAction({
        orgSlug: target.slug,
        indicatorId,
      })) {
        await expect404(() => action(IDLE, payload), `${role} may not ${name}`)
      }
    }

    // Nothing above changed a single row.
    as(target.members.owner.headers)
    const owner = requireOwner(await requireScope(target.slug))
    const rows = await indicatorsForOwner(owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: "1500000.00" })
  })

  it("404s a signed-out visitor", async () => {
    as(new Headers())
    await expect404(
      () =>
        actions.saveIndicatorAction(
          IDLE,
          fd({
            orgSlug: org.slug,
            kind: "annual_turnover",
            amount: "1.00",
            asOf: "2026-06-30",
          }),
        ),
      "no session, no write",
    )
  })

  it("404s an owner of ANOTHER organization — the slug is not authority", async () => {
    const foreign = await seedOrganization()
    const indicatorId = await createIndicatorRow(foreign.organizationId)

    as(org.members.owner.headers)
    for (const [name, action, payload] of everyAction({
      orgSlug: foreign.slug,
      indicatorId,
    })) {
      await expect404(
        () => action(IDLE, payload),
        `an outside owner may not ${name}`,
      )
    }

    as(foreign.members.owner.headers)
    const owner = requireOwner(await requireScope(foreign.slug))
    expect(await indicatorsForOwner(owner)).toHaveLength(1)
  })

  it("404s a malformed or unknown slug rather than raising", async () => {
    as(org.members.owner.headers)
    for (const slug of ["", "NOT A SLUG", "../admin", "neexistuje"]) {
      await expect404(
        () =>
          actions.deleteIndicatorAction(
            IDLE,
            fd({
              orgSlug: slug,
              indicatorId: "00000000-0000-0000-0000-000000000000",
            }),
          ),
        `slug ${JSON.stringify(slug)}`,
      )
    }
  })
})

describe("the boundary readers — a Czech sentence, never a 500", () => {
  it("refuses an unknown kind rather than reaching the enum column", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          kind: "ebitda",
          amount: "1.00",
          asOf: "2026-06-30",
        }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorInvalidInput" })
  })

  it("refuses a malformed, negative or absent figure", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    for (const amount of ["", "abc", "-1", "1,2,3", "12345678901234"]) {
      expect(
        await actions.saveIndicatorAction(
          IDLE,
          fd({
            orgSlug: target.slug,
            kind: "annual_turnover",
            amount,
            asOf: "2026-06-30",
          }),
        ),
        `amount ${JSON.stringify(amount)}`,
      ).toEqual({ status: "error", error: "ukazatele.errorAmountInvalid" })
    }

    expect(
      await indicatorsForOwner(requireOwner(await requireScope(target.slug))),
    ).toEqual([])
  })

  it("refuses an impossible calendar day as a sentence, never a 500", async () => {
    // A date picker cannot produce `2026-02-30`, but a Server Action is a public
    // POST endpoint and a hand-rolled body can. Postgres would answer 22008,
    // which is NOT a CHECK violation, so `guarded()` would rethrow it and the
    // office would get a 500. `formDate` checks the calendar, not just the shape.
    const target = await seedOrganization()
    as(target.members.owner.headers)

    for (const asOf of [
      "2026-02-30",
      "2026-02-29", // 2026 is not a leap year
      "2026-04-31",
      "2026-13-01",
      "2026-06-00",
    ]) {
      expect(
        await actions.saveIndicatorAction(
          IDLE,
          fd({
            orgSlug: target.slug,
            kind: "annual_turnover",
            amount: "1000000.00",
            asOf,
          }),
        ),
        `asOf ${asOf}`,
      ).toEqual({ status: "error", error: "ukazatele.errorAsOfRequired" })
    }

    // A real leap day still goes through.
    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          kind: "annual_turnover",
          amount: "1000000.00",
          asOf: "2024-02-29",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })
  })

  it("refuses an internal note longer than the agent API accepts", async () => {
    // One column, two doors, one ceiling: `note_internal` is unbounded `text`,
    // and the agent's schema caps it at 2 000. Refused, never truncated — a note
    // silently cut short is a note whose end the office believes it wrote.
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      kind: "annual_turnover",
      amount: "1000000.00",
      asOf: "2026-06-30",
    }

    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({ ...base, noteInternal: "x".repeat(2001) }),
      ),
    ).toEqual({ status: "error", error: "ukazatele.errorNoteTooLong" })

    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({ ...base, noteInternal: "x".repeat(2000) }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })
  })

  it("refuses a figure with no date — §0.4, every number carries its own", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    for (const asOf of ["", "30.6.2026", "2026-6-30"]) {
      expect(
        await actions.saveIndicatorAction(
          IDLE,
          fd({
            orgSlug: target.slug,
            kind: "annual_turnover",
            amount: "1000000.00",
            asOf,
          }),
        ),
        `asOf ${JSON.stringify(asOf)}`,
      ).toEqual({ status: "error", error: "ukazatele.errorAsOfRequired" })
    }
  })

  it("takes a Czech-written figure and stores it as digits", async () => {
    // `normalizeBetaMoneyInput` is the ONE rewrite of a money input in this
    // app, and it moves no digit: "2 536 500,01" is what `formatBetaMoney`
    // renders back, so it has to be what the office may type in.
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          kind: "annual_turnover",
          amount: "2 536 500,01",
          asOf: "2026-07-31",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })

    const owner = requireOwner(await requireScope(target.slug))
    expect(await latestIndicator(owner, "annual_turnover")).toMatchObject({
      amount: "2536500.01",
    })
  })
})

describe("the owner's happy path — and the round trip to Obrat watch", () => {
  it("states a figure, corrects it in place, and deletes it", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      kind: "annual_turnover",
      asOf: "2026-06-30",
    }

    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({ ...base, amount: "1800000.00", noteInternal: "první odhad" }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okCreated" })

    // The exact call `load-prehled.ts` makes for the client's card.
    const owner = requireOwner(await requireScope(target.slug))
    expect(await latestIndicator(owner, "annual_turnover")).toMatchObject({
      amount: "1800000.00",
      asOf: "2026-06-30",
    })

    // SAME DATE = a correction, reported as a save rather than as a second row.
    expect(
      await actions.saveIndicatorAction(
        IDLE,
        fd({ ...base, amount: "2100000.00", noteInternal: "po uzávěrce" }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okSaved" })

    const rows = await indicatorsForOwner(owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      amount: "2100000.00",
      noteInternal: "po uzávěrce",
    })

    expect(
      await actions.deleteIndicatorAction(
        IDLE,
        fd({ orgSlug: target.slug, indicatorId: rows[0]!.id }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okDeleted" })
    expect(await latestIndicator(owner, "annual_turnover")).toBeNull()
  })

  it("records both writes in activity_log, as the USER who made them", async () => {
    // AUDIT PARITY. The agent path logs every indicator write it makes; obrat
    // can enter this book through both doors, and a figure that decides whether
    // a client is told they have a registration duty must not have an audit
    // trail that depends on which door was used.
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      kind: "annual_turnover",
      amount: "1800000.00",
      asOf: "2026-06-30",
    }

    await actions.saveIndicatorAction(IDLE, fd(base))
    await actions.saveIndicatorAction(
      IDLE,
      fd({ ...base, amount: "1900000.00" }),
    )

    const owner = requireOwner(await requireScope(target.slug))
    const [row] = await indicatorsForOwner(owner)
    await actions.deleteIndicatorAction(
      IDLE,
      fd({ orgSlug: target.slug, indicatorId: row!.id }),
    )

    const log = await readActivityLog(target.organizationId)
    expect(log.map((entry) => entry.action)).toEqual([
      "indicator.upsert",
      "indicator.upsert",
      "indicator.delete",
    ])

    for (const entry of log) {
      // `activity_log_actor_coherence` refuses a `user` row naming a key, so
      // an office write can never be logged as if an agent had made it — or
      // the reverse, which is the lie the table exists to prevent.
      expect(entry.actor_kind).toBe("user")
      expect(entry.agent_key_id).toBeNull()
      expect(entry.actor_user_id).toBe(target.members.owner.userId)
      expect(entry.entity_kind).toBe("organization_indicator")
      expect(entry.request_id).toBeNull()
      // The summary names WHICH reading moved, never the figure — the amount
      // lives in its own table and the log is not a second copy of it.
      expect(entry.summary).toMatchObject({
        kind: "annual_turnover",
        asOf: "2026-06-30",
      })
      expect(entry.summary["amount"]).toBeUndefined()
    }
    expect(log[0]?.summary["action"]).toBe("created")
    expect(log[1]?.summary["action"]).toBe("updated")
  })

  it("writes no audit row for a delete that matched nothing", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    await actions.deleteIndicatorAction(
      IDLE,
      fd({
        orgSlug: target.slug,
        indicatorId: "00000000-0000-0000-0000-000000000000",
      }),
    )

    // Nothing happened, so nothing is claimed to have happened.
    expect(await readActivityLog(target.organizationId)).toEqual([])
  })

  it("reports a delete of a row that is not there as not found", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(
      await actions.deleteIndicatorAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          indicatorId: "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorNotFound" })
  })

  it("refuses a malformed indicator id rather than raising 22P02", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(
      await actions.deleteIndicatorAction(
        IDLE,
        fd({ orgSlug: target.slug, indicatorId: "not-a-uuid" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorInvalidInput" })
  })
})
